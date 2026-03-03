import dayjs from 'dayjs';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import { X_TARGETS, WEIBO_TARGETS } from './targets.js';
import { buildDailyPrompt } from './prompt.js';

const X_ACTOR_KEYWORDS = ['twitter', 'x.com', 'x ', 'tweet'];
const WEIBO_ACTOR_KEYWORDS = ['weibo', '微博'];

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
    limit: 200
  });

  return fetchJson(datasetUrl);
}

function buildPlatformInput({ platform, fromDate }) {
  if (platform === 'X') {
    return {
      handles: X_TARGETS,
      includeReplies: true,
      includeRetweets: true,
      includeLikes: true,
      fromDate
    };
  }

  return {
    keywordsOrUsers: WEIBO_TARGETS,
    includeComments: true,
    includeReposts: true,
    fromDate
  };
}

async function collectDailySignals() {
  const fromDate = dayjs().subtract(1, 'day').startOf('day').toISOString();
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

  return { xItems, weiboItems, xActorId, weiboActorId };
}

async function generateBriefing({ xItems, weiboItems }) {
  const openai = new OpenAI({ apiKey: requiredEnv('OPENAI_API_KEY') });
  const prompt = buildDailyPrompt({
    date: dayjs().format('YYYY-MM-DD'),
    xItems,
    weiboItems
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
    text: body
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
