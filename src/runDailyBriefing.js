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
    .replace(/^https?:\/\/(www\.)?(x|twitter|weibo)\.com\/(n\/)?/g, '')
    .replace(/^u\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/[._\-\s]+/g, '');
}

const X_TARGET_SET = new Set(X_TARGETS.map(normalizeIdentity));
const WEIBO_TARGET_SET = new Set(WEIBO_TARGETS.map(normalizeIdentity));
const X_PROFILE_BY_IDENTITY = new Map(X_TARGET_PROFILES.map((p) => [normalizeIdentity(p.handle), p]));
const WEIBO_PROFILE_BY_IDENTITY = new Map(WEIBO_TARGET_PROFILES.map((p) => [normalizeIdentity(p.name), p]));

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function resolveHardMaxItems(platform) {
  const perPlatform = parseOptionalPositiveInt(process.env[`APIFY_${platform}_MAX_ITEMS`]);
  if (perPlatform) {
    return perPlatform;
  }
  return parsePositiveInt(process.env.APIFY_FETCH_LIMIT, 80);
}

function buildHardLimitFields(platform, maxItems) {
  if (platform === 'X') {
    return { maxItems, maxTweets: maxItems, resultsLimit: maxItems, limit: maxItems };
  }

  return { maxItems, maxPosts: maxItems, resultsLimit: maxItems, limit: maxItems };
}

function buildHardTimeFields(fromDate) {
  return { fromDate, since: fromDate, startDate: fromDate };
}

function isRunTerminalStatus(status) {
  return ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status);
}

async function waitForRunToFinish(runId) {
  const maxWaitSeconds = parsePositiveInt(process.env.APIFY_RUN_MAX_WAIT_SECONDS, 240);
  const pollSeconds = parsePositiveInt(process.env.APIFY_RUN_POLL_SECONDS, 20);
  const startedAt = Date.now();

  while (true) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= maxWaitSeconds * 1000) {
      const abortUrl = buildApifyUrl(`/v2/actor-runs/${encodeURIComponent(runId)}/abort`, { gracefully: false });
      await fetchJson(abortUrl, { method: 'POST' });
      throw new Error(`Actor run ${runId} exceeded ${maxWaitSeconds}s and was aborted to control cost.`);
    }

    const remainingSeconds = Math.max(1, Math.ceil((maxWaitSeconds * 1000 - elapsedMs) / 1000));
    const waitForFinish = Math.min(pollSeconds, remainingSeconds);

    const runUrl = buildApifyUrl(`/v2/actor-runs/${encodeURIComponent(runId)}`, { waitForFinish });
    const runResponse = await fetchJson(runUrl);
    const runData = runResponse?.data;

    if (runData?.status && isRunTerminalStatus(runData.status)) {
      if (runData.status !== 'SUCCEEDED') {
        throw new Error(`Actor run ${runId} finished with status ${runData.status}.`);
      }
      return runData;
    }
  }
}

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
  const actor = platform === 'X' ? pickActorFromActs(acts, X_ACTOR_KEYWORDS) : pickActorFromActs(acts, WEIBO_ACTOR_KEYWORDS);

  if (!actor?.id) {
    throw new Error(`Cannot auto-resolve APIFY_${platform}_ACTOR_ID. Please set it in env.`);
  }

  return actor.id;
}

async function runActorAndFetchItems({ actorId, input, platform }) {
  const runUrl = buildApifyUrl(`/v2/acts/${encodeURIComponent(actorId)}/runs`);

  const runStart = await fetchJson(runUrl, {
    method: 'POST',
    body: JSON.stringify(input)
  });

  const runId = runStart?.data?.id;
  if (!runId) {
    throw new Error(`Actor ${actorId} run started without run id.`);
  }

  const runData = await waitForRunToFinish(runId);
  const datasetId = runData?.defaultDatasetId;
  if (!datasetId) {
    throw new Error(`Actor ${actorId} run finished without dataset.`);
  }

  const limit = resolveHardMaxItems(platform || 'X');
  const datasetUrl = buildApifyUrl(`/v2/datasets/${datasetId}/items`, {
    clean: true,
    desc: true,
    limit
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
    'ownerScreenName',
    'userId',
    'ownerName',
    'targetName',
    'targetHandle'
  ];

  for (const key of directKeys) {
    if (typeof item?.[key] === 'string') {
      candidates.add(normalizeIdentity(item[key]));
    }
  }

  const userObjKeys = ['user', 'authorProfile', 'owner', 'author', 'authorData'];
  for (const key of userObjKeys) {
    const obj = item?.[key];
    if (!obj || typeof obj !== 'object') {
      continue;
    }
    for (const nested of ['username', 'userName', 'screenName', 'name', 'handle', 'profileUrl', 'url']) {
      if (typeof obj[nested] === 'string') {
        candidates.add(normalizeIdentity(obj[nested]));
      }
    }
  }

  for (const linkKey of ['url', 'authorUrl', 'profileUrl', 'userUrl', 'permalink', 'postUrl', 'link']) {
    if (typeof item?.[linkKey] === 'string') {
      candidates.add(normalizeIdentity(item[linkKey]));
    }
  }

  return [...candidates].filter(Boolean);
}

function parseWeiboPostId(item) {
  if (item?.postId) {
    return String(item.postId);
  }

  const url = String(item?.postUrl || item?.url || item?.link || '');
  const match = url.match(/status\/(\d+)/i);
  return match?.[1] || '';
}

async function fetchWeiboStatusMeta(postId) {
  if (!postId) {
    return null;
  }

  const url = `https://m.weibo.cn/statuses/show?id=${encodeURIComponent(postId)}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const user = data?.data?.user || data?.user;
  const status = data?.data || data;

  if (!status) {
    return null;
  }

  return {
    screenName: user?.screen_name,
    userId: user?.id ? String(user.id) : undefined,
    profileUrl: user?.id ? `https://weibo.com/u/${user.id}` : undefined,
    createdAt: status?.created_at,
    text: status?.text || status?.raw_text
  };
}

async function enrichWeiboItems(items) {
  const list = Array.isArray(items) ? items : [];
  const cache = new Map();

  const enriched = await Promise.all(
    list.map(async (item) => {
      const postId = parseWeiboPostId(item);
      if (!postId) {
        return item;
      }

      if (!cache.has(postId)) {
        cache.set(postId, fetchWeiboStatusMeta(postId).catch(() => null));
      }

      const meta = await cache.get(postId);
      if (!meta) {
        return item;
      }

      return {
        ...item,
        postId,
        authorName: item.authorName || meta.screenName,
        screenName: item.screenName || meta.screenName,
        username: item.username || meta.screenName,
        authorUrl: item.authorUrl || meta.profileUrl,
        profileUrl: item.profileUrl || meta.profileUrl,
        createdAt: item.createdAt || meta.createdAt,
        text: item.text || meta.text || item.content
      };
    })
  );

  return enriched;
}

function attachTargetForPlatform(items, profileMap, fallbackProfileByName = false) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const identities = pickIdentityCandidates(item);
    const matchedIdentity = identities.find((id) => profileMap.has(id));

    if (matchedIdentity) {
      return { ...item, _targetProfile: profileMap.get(matchedIdentity) };
    }

    if (fallbackProfileByName && typeof item?.text === 'string') {
      const byText = WEIBO_TARGET_PROFILES.find((profile) => item.text.includes(profile.name));
      if (byText) {
        return { ...item, _targetProfile: byText };
      }
    }

    return item;
  });
}

function filterItemsByAttachedTarget(items) {
  return (Array.isArray(items) ? items : []).filter((item) => Boolean(item?._targetProfile));
}

function balanceItemsAcrossTargets(items, profiles, maxItems) {
  const buckets = new Map(profiles.map((profile) => [profile.name, []]));
  for (const item of Array.isArray(items) ? items : []) {
    const key = item?._targetProfile?.name;
    if (key && buckets.has(key)) {
      buckets.get(key).push(item);
    }
  }

  const ordered = profiles.map((profile) => buckets.get(profile.name) || []);
  const result = [];
  let cursor = 0;

  while (result.length < maxItems) {
    let pickedInRound = false;
    for (const bucket of ordered) {
      if (bucket[cursor]) {
        result.push(bucket[cursor]);
        pickedInRound = true;
        if (result.length >= maxItems) {
          break;
        }
      }
    }

    if (!pickedInRound) {
      break;
    }
    cursor += 1;
  }

  return result;
}

function buildPlatformInput({ platform, fromDate }) {
  const hardMaxItems = resolveHardMaxItems(platform);
  const hardLimits = buildHardLimitFields(platform, hardMaxItems);
  const hardTime = buildHardTimeFields(fromDate);

  if (platform === 'X') {
    return {
      handles: X_TARGETS,
      includeReplies: false,
      includeRetweets: false,
      includeLikes: false,
      ...hardTime,
      ...parseJsonEnv('APIFY_X_INPUT_JSON'),
      ...hardLimits,
      ...hardTime
    };
  }

  return {
    keywordsOrUsers: WEIBO_TARGETS,
    includeComments: false,
    includeReposts: false,
    ...hardTime,
    ...parseJsonEnv('APIFY_WEIBO_INPUT_JSON'),
    ...hardLimits,
    ...hardTime
  };
}

async function collectDailySignals() {
  const lookbackDays = parsePositiveInt(process.env.APIFY_LOOKBACK_DAYS, 2);
  const fromDate = dayjs().subtract(lookbackDays, 'day').startOf('day').toISOString();
  const xActorId = await resolveActorId('X');
  const weiboActorId = await resolveActorId('WEIBO');

  const [xItemsRaw, weiboItemsRaw] = await Promise.all([
    runActorAndFetchItems({
      actorId: xActorId,
      input: buildPlatformInput({ platform: 'X', fromDate }),
      platform: 'X'
    }),
    runActorAndFetchItems({
      actorId: weiboActorId,
      input: buildPlatformInput({ platform: 'WEIBO', fromDate }),
      platform: 'WEIBO'
    })
  ]);

  const xWithTargets = attachTargetForPlatform(xItemsRaw, X_PROFILE_BY_IDENTITY, false);
  const filteredXItems = filterItemsByAttachedTarget(xWithTargets);
  const balancedXItems = balanceItemsAcrossTargets(filteredXItems, X_TARGET_PROFILES, resolveHardMaxItems('X'));

  const weiboEnriched = await enrichWeiboItems(weiboItemsRaw);
  const weiboWithTargets = attachTargetForPlatform(weiboEnriched, WEIBO_PROFILE_BY_IDENTITY, true);
  const filteredWeiboItems = filterItemsByAttachedTarget(weiboWithTargets);
  const balancedWeiboItems = balanceItemsAcrossTargets(filteredWeiboItems, WEIBO_TARGET_PROFILES, resolveHardMaxItems('WEIBO'));

  console.log('Signal filtering summary', {
    strictFilter: true,
    xBefore: xItemsRaw.length,
    xAfterMatch: filteredXItems.length,
    xAfterBalanced: balancedXItems.length,
    weiboBefore: weiboItemsRaw.length,
    weiboAfterEnrich: weiboEnriched.length,
    weiboAfterMatch: filteredWeiboItems.length,
    weiboAfterBalanced: balancedWeiboItems.length,
    xPerTarget: Object.fromEntries(X_TARGET_PROFILES.map((p) => [p.name, balancedXItems.filter((i) => i?._targetProfile?.name === p.name).length])),
    weiboPerTarget: Object.fromEntries(WEIBO_TARGET_PROFILES.map((p) => [p.name, balancedWeiboItems.filter((i) => i?._targetProfile?.name === p.name).length]))
  });

  return { xItems: balancedXItems, weiboItems: balancedWeiboItems, xActorId, weiboActorId };
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

function stripHtml(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function compactItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const preferredKeys = [
    'id',
    'postId',
    'url',
    'postUrl',
    'tweetUrl',
    'permalink',
    'authorUrl',
    'author',
    'authorName',
    'username',
    'screenName',
    'text',
    'content',
    'createdAt',
    'publishedAt',
    'date',
    'timestamp',
    'time',
    'type',
    'language',
    'likes',
    'retweets',
    'reposts',
    'comments',
    'targetName',
    'targetHandle',
    'targetHomepage'
  ];

  const picked = {};
  for (const key of preferredKeys) {
    if (item[key] !== undefined) {
      const normalized = key === 'text' || key === 'content' ? stripHtml(item[key]) : item[key];
      picked[key] = truncateString(normalized);
    }
  }

  if (Object.keys(picked).length === 0) {
    for (const [key, value] of Object.entries(item).slice(0, 12)) {
      picked[key] = truncateString(value);
    }
  }

  return picked;
}

function toPromptSignal(item) {
  const target = item?._targetProfile;
  return compactItem({
    ...item,
    targetName: target?.name,
    targetHandle: target?.handle,
    targetHomepage: target?.homepage
  });
}

function prepareItemsForPrompt(items, platformName) {
  const maxItems = parsePositiveInt(process.env[`PROMPT_${platformName}_MAX_ITEMS`], 35);
  return (Array.isArray(items) ? items : []).slice(0, maxItems).map(toPromptSignal);
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

function buildExecutionMeta({ xCount, weiboCount }) {
  return [
    '【EXECUTION SUMMARY｜执行摘要】',
    `- X 目标信号条数：${xCount}`,
    `- 微博目标信号条数：${weiboCount}`,
    `- 生成模型：${process.env.OPENAI_MODEL || 'unknown'}`,
    ''
  ].join('\n');
}

function removeConsecutiveDuplicateLines(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (out.length === 0 || out[out.length - 1].trim() !== line.trim() || !line.trim()) {
      out.push(line);
    }
  }
  return out.join('\n').trim();
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
  const fullBody = removeConsecutiveDuplicateLines(`${buildExecutionMeta({ xCount: xItems.length, weiboCount: weiboItems.length })}${briefing}`);

  await sendEmail(subject, fullBody);

  return {
    subject,
    xActorId,
    weiboActorId,
    xCount: xItems.length,
    weiboCount: weiboItems.length
  };
}
