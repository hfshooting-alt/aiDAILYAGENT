import dotenv from 'dotenv';
import dayjs from 'dayjs';
import { ApifyClient } from 'apify-client';
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

async function collectFromApify({ actorId, input }) {
  const client = new ApifyClient({ token: requiredEnv('APIFY_TOKEN') });
  const run = await client.actor(actorId).call(input);
  const dataset = client.dataset(run.defaultDatasetId);
  const { items } = await dataset.listItems({ limit: 200, desc: true });
  return items;
}

async function collectDailySignals() {
  const dayStart = dayjs().subtract(1, 'day').startOf('day').toISOString();

  const xItems = await collectFromApify({
    actorId: requiredEnv('APIFY_X_ACTOR_ID'),
    input: {
      handles: X_TARGETS,
      includeReplies: true,
      includeRetweets: true,
      includeLikes: true,
      fromDate: dayStart
    }
  });

  const weiboItems = await collectFromApify({
    actorId: requiredEnv('APIFY_WEIBO_ACTOR_ID'),
    input: {
      keywordsOrUsers: WEIBO_TARGETS,
      includeComments: true,
      includeReposts: true,
      fromDate: dayStart
    }
  });

  return { xItems, weiboItems };
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
  const { xItems, weiboItems } = await collectDailySignals();
  const briefing = await generateBriefing({ xItems, weiboItems });

  await sendEmail({
    subject: `AI 领袖动态日报 - ${dayjs().format('YYYY-MM-DD')}`,
    markdownBody: briefing
  });

  console.log('Daily briefing sent successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
