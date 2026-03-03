import dotenv from 'dotenv';
import dayjs from 'dayjs';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import { X_TARGETS, WEIBO_TARGETS } from './targets.js';
import { buildDailyPrompt } from './prompt.js';

dotenv.config();

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
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;

  if (token) {
    url.searchParams.set('token', token);
  }

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

function pickActorFromActs(acts = [], keywords = []) {
  const normalizedKeywords = keywords.map((item) => item.toLowerCase());

  return acts.find((act) => {
    const fields = [act.name, act.title, act.username, act.description]
      .filter(Boolean)
      .map((item) => item.toLowerCase())
      .join(' ');

    return normalizedKeywords.some((keyword) => fields.includes(keyword));
  });
}

async function resolveActorId(platform) {
  const directId = process.env[`APIFY_${platform}_ACTOR_ID`];
  if (directId) {
    return directId;
  }

  const actsUrl = process.env.APIFY_ACTS_API_URL
    ? new URL(process.env.APIFY_ACTS_API_URL)
    : buildApifyUrl('/v2/acts');

  if (!actsUrl.searchParams.get('token')) {
    actsUrl.searchParams.set('token', requiredEnv('APIFY_TOKEN'));
  }

  const actsResponse = await fetchJson(actsUrl);
  const acts = actsResponse?.data?.items || [];

  const actor =
    platform === 'X'
      ? pickActorFromActs(acts, ['twitter', 'x.com', 'x scraper'])
      : pickActorFromActs(acts, ['weibo']);

  if (!actor?.id) {
    throw new Error(
      `Cannot resolve APIFY_${platform}_ACTOR_ID automatically. Please set APIFY_${platform}_ACTOR_ID explicitly.`
    );
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
    throw new Error(`Actor ${actorId} run succeeded but no dataset ID returned.`);
  }

  const datasetUrl = buildApifyUrl(`/v2/datasets/${datasetId}/items`, {
    clean: true,
    desc: true,
    limit: 200
  });

  return fetchJson(datasetUrl, {
    method: 'GET',
    headers: {
      'content-type': 'application/json'
    }
  });
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
  requiredEnv('APIFY_TOKEN');
  const dayStart = dayjs().subtract(1, 'day').startOf('day').toISOString();

  const xActorId = await resolveActorId('X');
  const weiboActorId = await resolveActorId('WEIBO');

  const [xItems, weiboItems] = await Promise.all([
    runActorAndFetchItems({
      actorId: xActorId,
      input: buildPlatformInput({ platform: 'X', fromDate: dayStart })
    }),
    runActorAndFetchItems({
      actorId: weiboActorId,
      input: buildPlatformInput({ platform: 'WEIBO', fromDate: dayStart })
    })
  ]);

  return { xItems, weiboItems, xActorId, weiboActorId };
}

async function generateBriefing({ xItems, weiboItems }) {
  const model = requiredEnv('OPENAI_MODEL');
  const openai = new OpenAI({ apiKey: requiredEnv('OPENAI_API_KEY') });
  const prompt = buildDailyPrompt({
    date: dayjs().format('YYYY-MM-DD'),
    xItems,
    weiboItems
  });

  const response = await openai.responses.create({
    model,
    input: prompt,
    temperature: 0.2
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error('OpenAI returned empty briefing.');
  }
  return text;
}

async function sendEmail({ subject, markdownBody }) {
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
    text: markdownBody
  });
}

async function main() {
  const { xItems, weiboItems, xActorId, weiboActorId } = await collectDailySignals();
  const briefing = await generateBriefing({ xItems, weiboItems });

  await sendEmail({
    subject: `AI 领袖动态日报 - ${dayjs().format('YYYY-MM-DD')}`,
    markdownBody: briefing
  });

  console.log('Daily briefing sent successfully.', { xActorId, weiboActorId });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
