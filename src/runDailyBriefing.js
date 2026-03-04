import dayjs from 'dayjs';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import { X_TARGETS, WEIBO_TARGETS, X_TARGET_PROFILES, WEIBO_TARGET_PROFILES } from './targets.js';
import { buildDailyPrompt } from './prompt.js';

const X_ACTOR_KEYWORDS = ['twitter', 'x.com', 'x ', 'tweet'];
const WEIBO_ACTOR_KEYWORDS = ['weibo', '微博'];

function normalizeIdentity(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, '');
}

const X_TARGET_SET = new Set(X_TARGETS.map(normalizeIdentity));
const WEIBO_TARGET_SET = new Set(WEIBO_TARGETS.map(normalizeIdentity));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function buildApifyUrl(path, query = {}) {
  const base = process.env.APIFY_BASE_URL || 'https://api.apify.com';
  const url = new URL(path, base);
  url.searchParams.set('token', requiredEnv('APIFY_TOKEN'));

  Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

  return url;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify API error ${response.status}: ${body}`);
  }

  return response.json();
}

export async function listUsedActors(limit = 200) {
  const actsUrl = buildApifyUrl('/v2/acts', { limit });
  const response = await fetchJson(actsUrl);
  return response?.data?.items || [];
}

function pickActorFromActs(acts, keywords) {
  return acts.find((act) => {
    const text = [act.name, act.title, act.username, act.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return keywords.some((keyword) => text.includes(keyword));
  });
}

async function resolveActorId(platform) {
  const manualId = process.env[`APIFY_${platform}_ACTOR_ID`];
  if (manualId) {
    return manualId;
  }

  const acts = await listUsedActors(1000);
  const actor =
    platform === 'X'
      ? pickActorFromActs(acts, X_ACTOR_KEYWORDS)
      : pickActorFromActs(acts, WEIBO_ACTOR_KEYWORDS);

  if (!actor?.id) {
    throw new Error(`Cannot auto-resolve APIFY_${platform}_ACTOR_ID. Please set it in env.`);
  }

  return actor.id;
}

async function runActorAndFetchItems({ actorId, input }) {
  const runUrl = buildApifyUrl(`/v2/acts/${encodeURIComponent(actorId)}/runs`, {
    waitForFinish: 180
  });

  const runResponse = await fetchJson(runUrl, {
    method: 'POST',
    body: JSON.stringify(input)
  });

  const datasetId = runResponse?.data?.defaultDatasetId;
  if (!datasetId) {
    throw new Error(`Actor ${actorId} run finished without dataset.`);
  }

  const datasetUrl = buildApifyUrl(`/v2/datasets/${datasetId}/items`, {
    clean: true,
    desc: true,
    limit: parsePositiveInt(process.env.APIFY_FETCH_LIMIT, 80)
  });

  return fetchJson(datasetUrl);
}

function pickIdentityCandidates(item) {
  const candidates = new Set();
  const directKeys = [
    'username',
    'userName',
    'screenName',
    'author',
    'authorName',
    'handle',
    'ownerUsername',
    'ownerScreenName'
  ];

  for (const key of directKeys) {
    if (typeof item?.[key] === 'string') {
      candidates.add(normalizeIdentity(item[key]));
    }
  }

  const userObjKeys = ['user', 'authorProfile', 'owner'];
  for (const key of userObjKeys) {
    const obj = item?.[key];
    if (!obj || typeof obj !== 'object') {
      continue;
    }
    for (const nested of ['username', 'userName', 'screenName', 'name', 'handle']) {
      if (typeof obj[nested] === 'string') {
        candidates.add(normalizeIdentity(obj[nested]));
      }
    }
  }

  return [...candidates].filter(Boolean);
}

function filterItemsByTargets(items, targetSet) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const candidates = pickIdentityCandidates(item);
    return candidates.some((identity) => targetSet.has(identity));
  });
}

function buildPlatformInput({ platform, fromDate }) {
  if (platform === 'X') {
    return {
      handles: X_TARGETS,
      includeReplies: false,
      includeRetweets: true,
      includeLikes: false,
      fromDate,
      ...parseJsonEnv('APIFY_X_INPUT_JSON')
    };
  }

  return {
    keywordsOrUsers: WEIBO_TARGETS,
    includeComments: false,
    includeReposts: true,
    fromDate,
    ...parseJsonEnv('APIFY_WEIBO_INPUT_JSON')
  };
}

async function collectDailySignals() {
  const lookbackDays = parsePositiveInt(process.env.APIFY_LOOKBACK_DAYS, 2);
  const fromDate = dayjs().subtract(lookbackDays, 'day').startOf('day').toISOString();
  const xActorId = await resolveActorId('X');
  const weiboActorId = await resolveActorId('WEIBO');

  const [xItems, weiboItems] = await Promise.all([
    runActorAndFetchItems({
      actorId: xActorId,
      input: buildPlatformInput({ platform: 'X', fromDate })
    }),
    runActorAndFetchItems({
      actorId: weiboActorId,
      input: buildPlatformInput({ platform: 'WEIBO', fromDate })
    })
  ]);

  const filteredXItems = filterItemsByTargets(xItems, X_TARGET_SET);
  const filteredWeiboItems = filterItemsByTargets(weiboItems, WEIBO_TARGET_SET);

  console.log('Signal filtering summary', {
    strictFilter: true,
    xBefore: xItems.length,
    xAfter: filteredXItems.length,
    weiboBefore: weiboItems.length,
    weiboAfter: filteredWeiboItems.length
  });

  return { xItems: filteredXItems, weiboItems: filteredWeiboItems, xActorId, weiboActorId };
}


function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function truncateString(value, maxLength = 600) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function compactItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const preferredKeys = [
    'id',
    'url',
    'author',
    'username',
    'screenName',
    'text',
    'content',
    'createdAt',
    'publishedAt',
    'type',
    'language',
    'likes',
    'retweets',
    'reposts',
    'comments'
  ];

  const picked = {};
  for (const key of preferredKeys) {
    if (item[key] !== undefined) {
      picked[key] = truncateString(item[key]);
    }
  }

  if (Object.keys(picked).length === 0) {
    for (const [key, value] of Object.entries(item).slice(0, 12)) {
      picked[key] = truncateString(value);
    }
  }

  return picked;
}

function prepareItemsForPrompt(items, platformName) {
  const maxItems = parsePositiveInt(process.env[`PROMPT_${platformName}_MAX_ITEMS`], 35);
  return (Array.isArray(items) ? items : []).slice(0, maxItems).map(compactItem);
}

async function generateBriefing({ xItems, weiboItems }) {
  const openai = new OpenAI({ apiKey: requiredEnv('OPENAI_API_KEY') });
  const prompt = buildDailyPrompt({
    date: dayjs().format('YYYY-MM-DD'),
    xItems: prepareItemsForPrompt(xItems, 'X'),
    weiboItems: prepareItemsForPrompt(weiboItems, 'WEIBO'),
    xProfiles: X_TARGET_PROFILES,
    weiboProfiles: WEIBO_TARGET_PROFILES
  });

  const response = await openai.responses.create({
    model: requiredEnv('OPENAI_MODEL'),
    input: prompt,
    temperature: 0.2
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error('OpenAI returned empty briefing.');
  }

  return text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linkifyLine(line) {
  return line.replace(/https?:\/\/[^\s)]+/g, (url) => {
    const href = encodeURI(url);
    return `<a href="${href}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>`;
  });
}

function renderDailyHtml(subject, body) {
  const lines = String(body).split(/\r?\n/);
  const content = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '<div style="height:10px;"></div>';
      }

      if (/^【.+】$/.test(trimmed)) {
        return `<h2 style="margin:16px 0 8px;font-size:18px;font-weight:800;letter-spacing:.3px;color:#0f172a;text-transform:uppercase;">${escapeHtml(trimmed)}</h2>`;
      }

      const escaped = escapeHtml(line);
      return `<p style="margin:0 0 8px;line-height:1.75;font-size:15px;color:#111827;">${linkifyLine(escaped)}</p>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:linear-gradient(135deg,#0f172a,#1e293b);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
    <div style="max-width:860px;margin:24px auto;padding:20px;">
      <div style="background:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.15);">
        <div style="font-size:14px;color:#475569;margin-bottom:8px;font-weight:700;letter-spacing:.6px;">AI DAILY BRIEFING</div>
        <h1 style="margin:0 0 16px 0;font-size:26px;font-weight:900;letter-spacing:.4px;color:#0f172a;text-transform:uppercase;">${escapeHtml(subject)}</h1>
        <div style="white-space:normal;">${content}</div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmail(subject, body) {
  const transporter = nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port: Number(requiredEnv('SMTP_PORT')),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASS')
    }
  });

  await transporter.sendMail({
    from: requiredEnv('EMAIL_FROM'),
    to: requiredEnv('EMAIL_TO'),
    subject,
    text: body,
    html: renderDailyHtml(subject, body)
  });
}

export async function runDailyBriefing() {
  const { xItems, weiboItems, xActorId, weiboActorId } = await collectDailySignals();
  const briefing = await generateBriefing({ xItems, weiboItems });
  const subject = `AI 领袖动态日报 - ${dayjs().format('YYYY-MM-DD')}`;

  await sendEmail(subject, briefing);

  return {
    subject,
    xActorId,
    weiboActorId,
    xCount: xItems.length,
    weiboCount: weiboItems.length
  };
}
