import dayjs from 'dayjs';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import { X_TARGETS, WEIBO_TARGETS, X_TARGET_PROFILES, WEIBO_TARGET_PROFILES } from './targets.js';
import { buildDailyPrompt } from './prompt.js';

const X_ACTOR_KEYWORDS = ['twitter', 'x.com', 'x ', 'tweet'];

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

function extractWeiboUidFromValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  if (/^\d+$/.test(text)) {
    return text;
  }

  const match = text.match(/\/u\/(\d+)/i) || text.match(/uid=(\d+)/i);
  return match?.[1] || '';
}

function buildWeiboUidTargetMap() {
  const parsed = parseJsonEnv('WEIBO_TARGET_UIDS_JSON');
  const out = new Map();

  for (const profile of WEIBO_TARGET_PROFILES) {
    const uidFromProfile = extractWeiboUidFromValue(profile.homepage);
    if (uidFromProfile) {
      out.set(uidFromProfile, profile);
    }

    const uidFromEnv = extractWeiboUidFromValue(parsed?.[profile.name]);
    if (uidFromEnv) {
      out.set(uidFromEnv, profile);
    }
  }

  return out;
}

const WEIBO_PROFILE_BY_UID = buildWeiboUidTargetMap();

function getWeiboUidForProfile(profile) {
  return extractWeiboUidFromValue(parseJsonEnv('WEIBO_TARGET_UIDS_JSON')?.[profile.name]) || extractWeiboUidFromValue(profile.homepage);
}

function getWeiboTargetCoverage() {
  return WEIBO_TARGET_PROFILES.map((profile) => ({
    name: profile.name,
    uid: getWeiboUidForProfile(profile) || null,
    homepage: profile.homepage
  }));
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

async function resolveXActorId() {
  const manualId = process.env.APIFY_X_ACTOR_ID;
  if (manualId) {
    return manualId;
  }

  const acts = await listUsedActors(1000);
  const actor = pickActorFromActs(acts, X_ACTOR_KEYWORDS);

  if (!actor?.id) {
    throw new Error('Cannot auto-resolve APIFY_X_ACTOR_ID. Please set it in env.');
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

  const rawBody = await response.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }

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

async function fetchWeiboHomepageHtml(uid) {
  const headers = await buildWeiboRequestHeaders(uid);
  const response = await fetch(`https://m.weibo.cn/u/${encodeURIComponent(uid)}`, { headers });
  if (!response.ok) {
    return '';
  }
  return response.text();
}

function extractStatusIdsFromHtml(html) {
  const text = typeof html === 'string' ? html : '';
  const ids = new Set();
  const patterns = [/\/status\/([a-zA-Z0-9]+)/g, /"id"\s*:\s*"([a-zA-Z0-9]+)"/g];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1];
      if (id && id.length >= 6) {
        ids.add(id);
      }
      if (ids.size >= 40) {
        break;
      }
    }
  }

  return [...ids];
}

async function fetchWeiboPostsFromHomepageFallback(uid, fromDate, perUserLimit, seenPostIds) {
  const html = await fetchWeiboHomepageHtml(uid);
  const statusIds = extractStatusIdsFromHtml(html);
  const posts = [];

  for (const statusId of statusIds) {
    if (seenPostIds.has(String(statusId))) {
      continue;
    }

    const meta = await fetchWeiboStatusMeta(statusId);
    if (!meta || !isRecentEnough(meta.createdAt, fromDate)) {
      continue;
    }

    const postId = String(statusId);
    seenPostIds.add(postId);
    posts.push({
      postId,
      postUrl: `https://m.weibo.cn/status/${postId}`,
      text: meta.text,
      createdAt: meta.createdAt,
      userId: meta.userId || uid,
      screenName: meta.screenName,
      authorName: meta.screenName,
      authorUrl: meta.profileUrl || `https://m.weibo.cn/u/${uid}`,
      profileUrl: meta.profileUrl || `https://m.weibo.cn/u/${uid}`
    });

    if (posts.length >= perUserLimit) {
      break;
    }
  }

  return posts;
}


function isRecentEnough(createdAt, fromDate) {
  if (!createdAt) {
    return true;
  }

  const text = String(createdAt).trim();
  let parsed = dayjs(text);

  if (!parsed.isValid()) {
    if (/^\d+分钟前$/.test(text) || /^\d+小时[前内]$/.test(text) || text === '刚刚') {
      parsed = dayjs();
    } else if (/^今天\s*\d{1,2}:\d{1,2}$/.test(text)) {
      const [, hhmm] = text.split(/\s+/);
      parsed = dayjs(`${dayjs().format('YYYY-MM-DD')} ${hhmm}`);
    } else if (/^昨天\s*\d{1,2}:\d{1,2}$/.test(text)) {
      const [, hhmm] = text.split(/\s+/);
      parsed = dayjs(`${dayjs().subtract(1, 'day').format('YYYY-MM-DD')} ${hhmm}`);
    } else if (/^\d{2}-\d{2}$/.test(text)) {
      parsed = dayjs(`${dayjs().year()}-${text} 00:00`);
    }
  }

  if (!parsed.isValid()) {
    return true;
  }

  return parsed.isAfter(dayjs(fromDate)) || parsed.isSame(dayjs(fromDate));
}

function extractMblogsFromCards(cards) {
  const out = [];
  const queue = Array.isArray(cards) ? [...cards] : [];

  while (queue.length > 0) {
    const card = queue.shift();
    if (!card || typeof card !== 'object') {
      continue;
    }

    if (card.mblog && typeof card.mblog === 'object') {
      out.push(card.mblog);
    }

    if (Array.isArray(card.card_group)) {
      queue.push(...card.card_group);
    }
  }

  return out;
}

async function fetchWeiboProfileInfo(uid) {
  const requestHeaders = await buildWeiboRequestHeaders(uid);
  const url = `https://m.weibo.cn/profile/info?uid=${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    headers: requestHeaders
  });

  if (!response.ok) {
    return null;
  }

  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function normalizeCookiePair(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(';')[0]?.trim() || '';
}

function collectSetCookies(response) {
  if (!response?.headers) {
    return [];
  }

  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map(normalizeCookiePair).filter(Boolean);
  }

  const single = response.headers.get('set-cookie');
  return single ? [normalizeCookiePair(single)] : [];
}

async function fetchWeiboSessionCookie(uid) {
  const response = await fetch(`https://m.weibo.cn/u/${encodeURIComponent(uid)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    return '';
  }

  const cookies = collectSetCookies(response);
  return cookies.join('; ');
}

function getCookieValue(cookieHeader, key) {
  if (!cookieHeader) {
    return '';
  }
  const pair = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  return pair ? decodeURIComponent(pair.slice(key.length + 1)) : '';
}

async function buildWeiboRequestHeaders(uid) {
  const cookie = await fetchWeiboSessionCookie(uid);
  const xsrf = getCookieValue(cookie, 'XSRF-TOKEN');
  return {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    referer: `https://m.weibo.cn/u/${uid}`,
    accept: 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'x-requested-with': 'XMLHttpRequest',
    ...(xsrf ? { 'x-xsrf-token': xsrf } : {}),
    ...(cookie ? { cookie } : {})
  };
}

async function resolveWeiboContainerIds(uid) {
  const ids = [
    `107603${uid}`,
    `100505${uid}`,
    `230413${uid}_-_WEIBO_SECOND_PROFILE_WEIBO`,
    `100505${uid}_-_WEIBO_SECOND_PROFILE_WEIBO`
  ];
  const profileInfo = await fetchWeiboProfileInfo(uid);
  const tabs = Array.isArray(profileInfo?.data?.tabsInfo?.tabs) ? profileInfo.data.tabsInfo.tabs : [];

  for (const tab of tabs) {
    const containerid = tab?.containerid;
    const tabType = String(tab?.tab_type || '').toLowerCase();
    const type = String(tab?.type || '').toLowerCase();
    if (typeof containerid !== 'string' || !containerid) {
      continue;
    }
    if (tabType.includes('weibo') || type.includes('weibo') || containerid.startsWith('107603')) {
      ids.push(containerid);
    }
  }

  return [...new Set(ids)];
}

async function fetchWeiboTimelineByUid(uid, fromDate, perUserLimit) {
  if (!uid) {
    return [];
  }

  const seenPostIds = new Set();
  const results = [];
  const containerIds = await resolveWeiboContainerIds(uid);
  const requestHeaders = await buildWeiboRequestHeaders(uid);
  const containerCandidates = [...containerIds, ''];

  for (const containerId of containerCandidates) {
    let sinceId = '';

    for (let page = 1; page <= 5 && results.length < perUserLimit; page += 1) {
      const params = new URLSearchParams({ type: 'uid', value: String(uid) });
      if (containerId) {
        params.set('containerid', containerId);
      }
      if (sinceId) {
        params.set('since_id', sinceId);
      } else {
        params.set('page', String(page));
      }

      const url = `https://m.weibo.cn/api/container/getIndex?${params.toString()}`;
      const response = await fetch(url, {
        headers: requestHeaders
      });

      if (!response.ok) {
        continue;
      }

      const rawBody = await response.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        continue;
      }

      if (data?.ok !== undefined && Number(data.ok) <= 0) {
        continue;
      }

      const cards = Array.isArray(data?.data?.cards) ? data.data.cards : [];
      const mblogs = extractMblogsFromCards(cards);
      if (mblogs.length === 0) {
        if (!sinceId) {
          continue;
        }
        break;
      }

      for (const mblog of mblogs) {
        if (!isRecentEnough(mblog?.created_at, fromDate)) {
          continue;
        }

        const postId = String(mblog?.id || mblog?.idstr || '');
        if (!postId || seenPostIds.has(postId)) {
          continue;
        }

        seenPostIds.add(postId);
        results.push({
          postId,
          postUrl: `https://m.weibo.cn/status/${postId}`,
          text: mblog?.raw_text || mblog?.text,
          createdAt: mblog?.created_at,
          userId: mblog?.user?.id ? String(mblog.user.id) : uid,
          screenName: mblog?.user?.screen_name,
          authorName: mblog?.user?.screen_name,
          authorUrl: uid ? `https://m.weibo.cn/u/${uid}` : undefined,
          profileUrl: uid ? `https://m.weibo.cn/u/${uid}` : undefined
        });

        if (results.length >= perUserLimit) {
          break;
        }
      }

      const nextSinceId = data?.data?.cardlistInfo?.since_id;
      if (!nextSinceId || String(nextSinceId) === String(sinceId || '')) {
        break;
      }
      sinceId = String(nextSinceId);
    }
  }

  if (results.length === 0) {
    const homepageFallback = await fetchWeiboPostsFromHomepageFallback(uid, fromDate, perUserLimit, seenPostIds);
    for (const post of homepageFallback) {
      results.push(post);
      if (results.length >= perUserLimit) {
        break;
      }
    }
  }

  if (results.length === 0) {
    console.log('Weibo UID empty across containers', { uid, containerIds: containerCandidates });
  } else {
    console.log('Weibo UID recovered via fallback', { uid, count: results.length });
  }

  return results;
}

async function fetchWeiboFallbackItems({ fromDate, maxItems }) {
  const perUserLimit = parsePositiveInt(process.env.WEIBO_FALLBACK_PER_USER, 3);
  const all = [];

  for (const profile of WEIBO_TARGET_PROFILES) {
    const uid = getWeiboUidForProfile(profile);
    const posts = await fetchWeiboTimelineByUid(uid, fromDate, perUserLimit);
    console.log('Weibo UID fetch result', { target: profile.name, uid: uid || null, count: posts.length });
    for (const post of posts) {
      all.push(post);
      if (all.length >= maxItems) {
        return all;
      }
    }
  }

  return all;
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

function attachTargetForPlatform(items, profileMap) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const identities = pickIdentityCandidates(item);
    const matchedIdentity = identities.find((id) => profileMap.has(id));

    if (matchedIdentity) {
      return { ...item, _targetProfile: profileMap.get(matchedIdentity) };
    }

    return item;
  });
}

function attachWeiboTarget(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const uid = item?.userId ? String(item.userId) : '';
    if (uid && WEIBO_PROFILE_BY_UID.has(uid)) {
      return { ...item, _targetProfile: WEIBO_PROFILE_BY_UID.get(uid) };
    }

    const identities = pickIdentityCandidates(item);
    const matchedIdentity = identities.find((id) => WEIBO_PROFILE_BY_IDENTITY.has(id));
    if (matchedIdentity) {
      return { ...item, _targetProfile: WEIBO_PROFILE_BY_IDENTITY.get(matchedIdentity) };
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

function buildXInput({ fromDate }) {
  const hardMaxItems = resolveHardMaxItems('X');
  const hardLimits = buildHardLimitFields('X', hardMaxItems);
  const hardTime = buildHardTimeFields(fromDate);

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

async function collectDailySignals() {
  const lookbackDays = parsePositiveInt(process.env.APIFY_LOOKBACK_DAYS, 2);
  const fromDate = dayjs().subtract(lookbackDays, 'day').startOf('day').toISOString();
  const xActorId = await resolveXActorId();
  const weiboTargetCoverage = getWeiboTargetCoverage();

  console.log('Configured Weibo targets', {
    total: weiboTargetCoverage.length,
    withUid: weiboTargetCoverage.filter((item) => Boolean(item.uid)).length,
    withoutUid: weiboTargetCoverage.filter((item) => !item.uid).map((item) => item.name),
    targets: weiboTargetCoverage
  });

  const xItemsRaw = await runActorAndFetchItems({
    actorId: xActorId,
    input: buildXInput({ fromDate }),
    platform: 'X'
  });

  const weiboSource = 'uid_timeline';
  const weiboItemsRaw = await fetchWeiboFallbackItems({ fromDate, maxItems: resolveHardMaxItems('WEIBO') });

  const xWithTargets = attachTargetForPlatform(xItemsRaw, X_PROFILE_BY_IDENTITY);
  const filteredXItems = filterItemsByAttachedTarget(xWithTargets);
  const balancedXItems = balanceItemsAcrossTargets(filteredXItems, X_TARGET_PROFILES, resolveHardMaxItems('X'));

  const weiboEnriched = await enrichWeiboItems(weiboItemsRaw);
  const weiboWithTargets = attachWeiboTarget(weiboEnriched);
  const filteredWeiboItems = filterItemsByAttachedTarget(weiboWithTargets);
  const balancedWeiboItems = balanceItemsAcrossTargets(filteredWeiboItems, WEIBO_TARGET_PROFILES, resolveHardMaxItems('WEIBO'));

  console.log('Signal filtering summary', {
    strictFilter: true,
    xBefore: xItemsRaw.length,
    xAfterMatch: filteredXItems.length,
    xAfterBalanced: balancedXItems.length,
    weiboSource,
    weiboBefore: weiboItemsRaw.length,
    weiboAfterEnrich: weiboEnriched.length,
    weiboAfterMatch: filteredWeiboItems.length,
    weiboAfterBalanced: balancedWeiboItems.length,
    xPerTarget: Object.fromEntries(X_TARGET_PROFILES.map((p) => [p.name, balancedXItems.filter((i) => i?._targetProfile?.name === p.name).length])),
    weiboPerTarget: Object.fromEntries(WEIBO_TARGET_PROFILES.map((p) => [p.name, balancedWeiboItems.filter((i) => i?._targetProfile?.name === p.name).length]))
  });

  return { xItems: balancedXItems, weiboItems: balancedWeiboItems, xActorId, weiboActorId: 'uid_timeline' };
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
