'use strict';

const Plugin = {};
const PLUGIN_ID = 'haa9-experience';
const SETTINGS_KEY = 'haa9-experience';

const meta = require.main.require('./src/meta');
const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const categories = require.main.require('./src/categories');
let privileges;
try { privileges = require.main.require('./src/privileges'); } catch (error) { privileges = null; }

const cache = {
  media: new Map(),
  profile: new Map(),
  categories: null
};

const defaults = {
  enabled: 'on',
  categoryIndexEnabled: 'on',
  categoryIndexStyle: 'hero-grid',
  topicListEnabled: 'on',
  topicListCidMode: 'include',
  topicListCids: '6',
  topicDetailEnabled: 'on',
  topicDetailAllCids: 'on',
  voiceAudioBitsPerSecond: '16000',
  mediaCacheSeconds: '300',
  profileCacheSeconds: '3600',
  categoryCacheSeconds: '600',
  mediaBatchLimit: '40',
  profileBatchLimit: '80',
  maxImages: '4',
  maxAudios: '3',
  maxTiktoks: '2',
  peipeAvatarFieldsEnabled: 'on',
  peipeFollowEnabled: 'on',
  peipeTopicBottomBarEnabled: 'on',
  essenceFilterEnabled: 'on',
  essenceTagName: '精华',
  essenceScanLimit: '500',
  categoryCovers: '{}'
};

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 'on' || value === '1' || value === 1;
}

function int(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  return String(value || '').split(',').map(item => parseInt(item.trim(), 10)).filter(Boolean);
}

async function getSettings() {
  const stored = await meta.settings.get(SETTINGS_KEY);
  return Object.assign({}, defaults, stored || {});
}

async function setSettings(payload) {
  const next = Object.assign({}, defaults, payload || {});
  await meta.settings.set(SETTINGS_KEY, next);
  clearCache();
  return next;
}

function publicConfig(settings) {
  const cids = list(settings.topicListCids);
  return {
    enabled: bool(settings.enabled, true),
    settings: {
      categoryIndexEnabled: bool(settings.categoryIndexEnabled, true),
      categoryIndexStyle: settings.categoryIndexStyle || 'hero-grid',
      topicListEnabled: bool(settings.topicListEnabled, true),
      topicListCidMode: settings.topicListCidMode || 'include',
      topicListCids: cids,
      topicDetailEnabled: bool(settings.topicDetailEnabled, true),
      topicDetailAllCids: bool(settings.topicDetailAllCids, true)
    },
    client: {
      cid: cids[0] || 0,
      topicDetailAllCids: bool(settings.topicDetailAllCids, true),
      voiceAudioBitsPerSecond: int(settings.voiceAudioBitsPerSecond, 16000),
      topicCacheMs: int(settings.mediaCacheSeconds, 300) * 1000,
      topicLocalCacheMs: int(settings.mediaCacheSeconds, 300) * 1000,
      profileCacheMs: int(settings.profileCacheSeconds, 86400) * 1000,
      categoryIndexCacheMs: int(settings.categoryCacheSeconds, 600) * 1000,
      mediaBatchLimit: int(settings.mediaBatchLimit, 40),
      profileBatchLimit: int(settings.profileBatchLimit, 80),
      peipeAvatarFieldsEnabled: bool(settings.peipeAvatarFieldsEnabled, true),
      peipeFollowEnabled: bool(settings.peipeFollowEnabled, true),
      peipeTopicBottomBarEnabled: bool(settings.peipeTopicBottomBarEnabled, true),
      essenceFilterEnabled: bool(settings.essenceFilterEnabled, true),
      essenceTagName: settings.essenceTagName || '精华',
      essenceScanLimit: int(settings.essenceScanLimit, 500),
      maxImages: int(settings.maxImages, 4),
      maxAudios: int(settings.maxAudios, 3),
      maxTiktoks: int(settings.maxTiktoks, 2)
    }
  };
}

function clearCache() {
  cache.media.clear();
  cache.profile.clear();
  cache.categories = null;
}

function ttlCacheGet(map, key) {
  const item = map.get(String(key));
  if (!item || item.expiresAt <= Date.now()) {
    map.delete(String(key));
    return null;
  }
  return item.value;
}

function ttlCacheSet(map, key, value, ttlSeconds) {
  map.set(String(key), { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function maybe(fn, ...args) {
  if (typeof fn !== 'function') return null;
  return fn(...args);
}

async function canReadTopic(tid, uid) {
  if (!privileges || !privileges.topics) return true;
  try {
    if (typeof privileges.topics.can === 'function') {
      const result = await privileges.topics.can('read', tid, uid || 0);
      return Array.isArray(result) ? !!result[0] : !!result;
    }
    if (typeof privileges.topics.isAllowedTo === 'function') {
      const result = await privileges.topics.isAllowedTo('read', tid, uid || 0);
      return !!result;
    }
  } catch (error) {
    return false;
  }
  return true;
}

async function getTopicFields(tids) {
  const fields = ['tid', 'cid', 'mainPid', 'title', 'slug', 'timestamp', 'lastposttime'];
  if (typeof topics.getTopicsFields === 'function') return topics.getTopicsFields(tids, fields);
  if (typeof topics.getTopicFields === 'function') return Promise.all(tids.map(tid => topics.getTopicFields(tid, fields)));
  if (typeof topics.getTopicsByTids === 'function') return topics.getTopicsByTids(tids, 0);
  return [];
}

async function getPostFields(pids) {
  const fields = ['pid', 'tid', 'cid', 'uid', 'content', 'timestamp'];
  if (typeof posts.getPostsFields === 'function') return posts.getPostsFields(pids, fields);
  if (typeof posts.getPostFields === 'function') return Promise.all(pids.map(pid => posts.getPostFields(pid, fields)));
  return [];
}

function collectTikToks(text, max) {
  const out = [];
  const seen = new Set();
  String(text || '').replace(/https?:\/\/(?:www\.)?tiktok\.com\/@[^/\s<>'"]+\/video\/(\d+)(?:\?[^\s<>'"]*)?/ig, (match, videoId) => {
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId);
      out.push({ videoId, url: match.replace(/&amp;/g, '&') });
    }
    return match;
  });
  return out.slice(0, max);
}

function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanText(raw) {
  return stripHtml(raw)
    .replace(/https?:\/\/(?:www\.)?tiktok\.com\/\S+/ig, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[\s*(?:语音消息|语音动态|voice\s*message|audio\s*message)[^\]]*\]\([^)]+\)/ig, '')
    .replace(/\bimage\b/ig, '')
    .split(/[\r\n]+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line && !/^(?:新动态|图片分享|图片动态|语音消息|语音动态|voice message|audio message|image|photo|picture)(?:\s*:?\s*\d{1,2}:\d{2}(?::\d{2})?)?$/i.test(line))
    .join('\n')
    .trim();
}

function parseDurationFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''), 'https://example.com');
    const raw = parsed.searchParams.get('haa8dur') || parsed.searchParams.get('dur') || parsed.searchParams.get('duration');
    const value = parseInt(raw || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    const match = String(url || '').match(/[?&](?:haa8dur|dur|duration)=(\d+)/i);
    return match ? parseInt(match[1], 10) || 0 : 0;
  }
}

function uniquePush(arr, value) {
  if (value && !arr.includes(value)) arr.push(value);
}

function parseMediaFromContent(content, settings) {
  const raw = String(content || '');
  const maxImages = int(settings.maxImages, 4);
  const maxAudios = int(settings.maxAudios, 3);
  const maxTiktoks = int(settings.maxTiktoks, 2);
  const images = [];
  const audios = [];

  raw.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/ig, (_, src) => uniquePush(images, src));
  raw.replace(/<audio[^>]+src=["']([^"']+)["'][^>]*>/ig, (_, src) => {
    if (!audios.some(item => item.url === src)) audios.push({ url: src, duration: parseDurationFromUrl(src), label: '语音消息' });
  });
  raw.replace(/<source[^>]+src=["']([^"']+)["'][^>]*>/ig, (_, src) => {
    if (/\.(m4a|mp3|wav|ogg|oga|webm|aac)(?:[?#].*)?$/i.test(src) && !audios.some(item => item.url === src)) audios.push({ url: src, duration: parseDurationFromUrl(src), label: '语音消息' });
  });
  raw.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, src) => uniquePush(images, src));
  raw.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, label, url) => {
    if (/\.(m4a|mp3|wav|ogg|oga|webm|aac)(?:[?#].*)?$/i.test(url) && !audios.some(item => item.url === url)) audios.push({ url, duration: parseDurationFromUrl(url), label: label || '语音消息' });
    if (/\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(url)) uniquePush(images, url);
  });

  return {
    cid: 0,
    pid: 0,
    text: cleanText(raw),
    images: images.slice(0, maxImages),
    audios: audios.slice(0, maxAudios),
    tiktoks: collectTikToks(raw, maxTiktoks)
  };
}

async function buildMediaForTid(tid, uid, settings) {
  const cached = ttlCacheGet(cache.media, tid);
  if (cached) return cached;
  if (!(await canReadTopic(tid, uid))) return null;

  const topicData = (await getTopicFields([tid]))[0] || {};
  const pid = topicData.mainPid || topicData.mainpid || topicData.pid;
  if (!pid) return { cid: topicData.cid || 0, pid: 0, text: '', images: [], audios: [], tiktoks: [] };
  const postData = (await getPostFields([pid]))[0] || {};
  const media = parseMediaFromContent(postData.content || '', settings);
  media.cid = Number(topicData.cid || postData.cid || 0);
  media.pid = Number(pid || postData.pid || 0);
  ttlCacheSet(cache.media, tid, media, int(settings.mediaCacheSeconds, 300));
  return media;
}


const PEIPE_USER_FIELDS = [
  'uid', 'username', 'userslug', 'displayname', 'picture', 'status', 'lastonline',
  'countryCode', 'country_code', 'country', 'country_name', 'nationality', 'region', 'location',
  'language_flag', 'language_fluent', 'native_language', 'language_native',
  'language_learning', 'learning_language', 'language_target', 'target_language',
  'gender', 'sex', 'age'
];

const PEIPE_COUNTRY_KEYWORDS = {
  cn: ['cn', 'china', '中国', '中华人民共和国', 'zh-cn'],
  tw: ['tw', 'taiwan', '台湾', 'zh-tw'],
  hk: ['hk', 'hong kong', '香港'],
  us: ['us', 'usa', 'united states', '美国'],
  gb: ['gb', 'uk', 'united kingdom', 'great britain', 'england', '英国'],
  mm: ['mm', 'myanmar', 'burma', '缅甸'],
  vn: ['vn', 'vi', 'vietnam', '越南'],
  th: ['th', 'thailand', '泰国'],
  jp: ['jp', 'ja', 'japan', '日本'],
  kr: ['kr', 'ko', 'korea', 'south korea', '韩国', '南韩'],
  sg: ['sg', 'singapore', '新加坡'],
  la: ['la', 'laos', '老挝'],
  my: ['my', 'malaysia', '马来西亚'],
  ph: ['ph', 'philippines', '菲律宾'],
  id: ['id', 'indonesia', '印尼', '印度尼西亚'],
  kh: ['kh', 'cambodia', '柬埔寨'],
  in: ['in', 'india', '印度'],
  fr: ['fr', 'france', '法国'],
  de: ['de', 'germany', '德国'],
  br: ['br', 'brazil', '巴西'],
  ca: ['ca', 'canada', '加拿大'],
  au: ['au', 'australia', '澳大利亚'],
  ru: ['ru', 'russia', '俄罗斯']
};

const PEIPE_LANG_MAP = {
  cn: 'CN', zh: 'CN', 'zh-cn': 'CN', china: 'CN', chinese: 'CN', '中文': 'CN', '汉语': 'CN',
  en: 'EN', us: 'EN', uk: 'EN', gb: 'EN', english: 'EN', '英语': 'EN',
  vi: 'VI', vn: 'VI', vietnam: 'VI', vietnamese: 'VI', '越南': 'VI', '越南语': 'VI',
  mm: 'MM', my: 'MM', myanmar: 'MM', burmese: 'MM', '缅甸': 'MM', '缅甸语': 'MM',
  th: 'TH', thai: 'TH', thailand: 'TH', '泰语': 'TH',
  jp: 'JP', ja: 'JP', japan: 'JP', japanese: 'JP', '日语': 'JP',
  kr: 'KR', ko: 'KR', korea: 'KR', korean: 'KR', '韩语': 'KR'
};

function peipeClean(value) {
  return String(value == null ? '' : value).replace(/["\\[\]{}]/g, '').trim();
}

function peipeParseMulti(value) {
  if (Array.isArray(value)) return value.map(peipeClean).filter(Boolean);
  if (value == null || value === '') return [];
  const raw = String(value).trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(peipeClean).filter(Boolean);
    if (parsed && typeof parsed === 'object') return Object.values(parsed).map(peipeClean).filter(Boolean);
    return [peipeClean(parsed)].filter(Boolean);
  } catch (error) {
    return raw.split(/[，,|/]+/).map(peipeClean).filter(Boolean);
  }
}

function peipeToLangCode(value) {
  const text = peipeClean(value).toLowerCase();
  if (!text) return '';
  if (PEIPE_LANG_MAP[text]) return PEIPE_LANG_MAP[text];
  for (const key of Object.keys(PEIPE_LANG_MAP)) {
    if (text.includes(key)) return PEIPE_LANG_MAP[key];
  }
  if (/^[a-z]{2}$/.test(text)) return text.toUpperCase();
  return text.length >= 2 ? text.substring(0, 2).toUpperCase() : '';
}

function peipeToLangCodes(value) {
  return Array.from(new Set(peipeParseMulti(value).map(peipeToLangCode).filter(Boolean)));
}

function peipeGender(value) {
  const text = peipeClean(value).toLowerCase();
  if (!text) return '';
  if (text === 'm' || text === 'male' || text === '男' || text.includes('男')) return 'M';
  if (text === 'f' || text === 'female' || text === '女' || text.includes('女')) return 'F';
  return '';
}

function peipeMatchCountryCode(value) {
  const text = peipeClean(value).toLowerCase();
  if (!text) return '';
  if (/^[a-z]{2}$/.test(text) && PEIPE_COUNTRY_KEYWORDS[text]) return text;
  for (const code of Object.keys(PEIPE_COUNTRY_KEYWORDS)) {
    for (const keyword of PEIPE_COUNTRY_KEYWORDS[code]) {
      if (text === keyword || text.includes(keyword)) return code;
    }
  }
  return '';
}

function peipeResolveCountryCode(profile, nativeCode) {
  const fields = [profile.countryCode, profile.country_code, profile.country, profile.country_name, profile.nationality, profile.region, profile.language_flag, profile.location];
  for (const field of fields) {
    const code = peipeMatchCountryCode(field);
    if (code) return code;
  }
  const fallback = { CN: 'cn', MM: 'mm', VI: 'vn', EN: 'gb', TH: 'th', JP: 'jp', KR: 'kr' };
  return fallback[nativeCode] || '';
}

function peipeFlagEmoji(code) {
  const country = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return '';
  return country.replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function peipeAgeText(age) {
  const n = Number(age || 0);
  return n > 0 ? `${n}岁` : '';
}

async function getFollowingSet(viewerUid, targetUids) {
  const uid = Number(viewerUid || 0);
  const targets = Array.from(new Set((targetUids || []).map(Number).filter(Boolean)));
  const out = new Set();
  if (!uid || !targets.length) return out;
  const key = `following:${uid}`;
  try {
    if (typeof db.sortedSetScores === 'function') {
      const scores = await db.sortedSetScores(key, targets);
      targets.forEach((target, index) => {
        if (scores && scores[index] !== null && scores[index] !== undefined) out.add(Number(target));
      });
      return out;
    }
  } catch (error) {}
  await Promise.all(targets.map(async target => {
    try {
      if (typeof db.isSortedSetMember === 'function') {
        if (await db.isSortedSetMember(key, target)) out.add(Number(target));
      } else if (typeof db.sortedSetScore === 'function') {
        const score = await db.sortedSetScore(key, target);
        if (score !== null && score !== undefined) out.add(Number(target));
      }
    } catch (error) {}
  }));
  return out;
}

function addPeipeFields(profile, followingSet) {
  const uid = Number(profile && profile.uid || 0);
  const nativeCodes = peipeToLangCodes(profile.language_fluent || profile.native_language || profile.language_native);
  const learnCodes = peipeToLangCodes(profile.language_learning || profile.learning_language || profile.language_target || profile.target_language);
  const nativeCode = nativeCodes[0] || '';
  const learnCode = learnCodes[0] || '';
  const countryCode = peipeResolveCountryCode(profile, nativeCode);
  const genderCode = peipeGender(profile.gender || profile.sex);
  return Object.assign({}, profile, {
    uid,
    countryCode,
    flagEmoji: peipeFlagEmoji(countryCode),
    nativeCode,
    nativeCodes,
    learnCode,
    learnCodes,
    genderCode,
    age: Number(profile.age || 0) || 0,
    ageText: peipeAgeText(profile.age),
    isFollowing: followingSet ? followingSet.has(uid) : !!(profile.isFollowing || profile.is_following || profile.following)
  });
}

function profilePublicPayload(profile) {
  return {
    uid: Number(profile.uid || 0),
    username: profile.username,
    userslug: profile.userslug,
    displayname: profile.displayname,
    picture: profile.picture,
    status: profile.status,
    countryCode: profile.countryCode,
    flagEmoji: profile.flagEmoji,
    nativeCode: profile.nativeCode,
    nativeCodes: profile.nativeCodes || [],
    learnCode: profile.learnCode,
    learnCodes: profile.learnCodes || [],
    genderCode: profile.genderCode,
    age: Number(profile.age || 0) || 0,
    ageText: profile.ageText,
    isFollowing: !!profile.isFollowing
  };
}

function normalizeUserProfile(profile) {
  if (!profile) return {};
  return addPeipeFields({
    uid: Number(profile.uid || 0),
    username: profile.username,
    userslug: profile.userslug,
    displayname: profile.displayname,
    picture: profile.picture,
    status: profile.status,
    lastonline: profile.lastonline,
    location: profile.location,
    countryCode: profile.countryCode,
    country_code: profile.country_code,
    country: profile.country,
    country_name: profile.country_name,
    nationality: profile.nationality,
    region: profile.region,
    language_flag: profile.language_flag,
    language_fluent: profile.language_fluent,
    native_language: profile.native_language,
    language_native: profile.language_native,
    language_learning: profile.language_learning,
    learning_language: profile.learning_language,
    language_target: profile.language_target,
    target_language: profile.target_language,
    gender: profile.gender,
    sex: profile.sex,
    age: profile.age,
    isFollowing: profile.isFollowing || profile.is_following || profile.following
  });
}

async function getProfiles(slugs, uids, settings, viewerUid = 0) {
  const result = {};
  const profileTtl = int(settings.profileCacheSeconds, 3600);
  const wantedUids = new Set((uids || []).map(Number).filter(Boolean));
  const wantedSlugs = Array.from(new Set((slugs || []).map(slug => String(slug || '').trim().toLowerCase()).filter(Boolean)));

  const slugMisses = [];
  wantedSlugs.forEach(slug => {
    const cached = ttlCacheGet(cache.profile, `slug:${slug}`);
    if (cached && cached.uid) wantedUids.add(Number(cached.uid));
    else slugMisses.push(slug);
  });

  await Promise.all(slugMisses.map(async slug => {
    try {
      let uid = 0;
      if (typeof user.getUidByUserslug === 'function') uid = Number(await user.getUidByUserslug(slug));
      else if (typeof user.getUserDataByUserSlug === 'function') {
        const data = await user.getUserDataByUserSlug(slug);
        uid = Number(data && data.uid || 0);
      }
      if (uid) wantedUids.add(uid);
    } catch (error) {}
  }));

  const finalUids = Array.from(wantedUids).filter(Boolean);
  const misses = [];
  finalUids.forEach(uid => {
    const cached = ttlCacheGet(cache.profile, `uid:${uid}`);
    if (!cached) misses.push(uid);
  });

  if (misses.length) {
    let rows = [];
    try {
      if (typeof user.getUsersFields === 'function') rows = await user.getUsersFields(misses, PEIPE_USER_FIELDS);
      else rows = await Promise.all(misses.map(uid => user.getUserData(uid)));
    } catch (error) {
      rows = [];
    }
    (rows || []).forEach(row => {
      const profile = normalizeUserProfile(row || {});
      if (!profile.uid) return;
      ttlCacheSet(cache.profile, `uid:${profile.uid}`, profile, profileTtl);
      if (profile.userslug) ttlCacheSet(cache.profile, `slug:${String(profile.userslug).toLowerCase()}`, profile, profileTtl);
    });
  }

  const followingSet = bool(settings.peipeFollowEnabled, true) ? await getFollowingSet(viewerUid, finalUids) : new Set();
  finalUids.forEach(uid => {
    const base = ttlCacheGet(cache.profile, `uid:${uid}`);
    if (!base) return;
    const profile = addPeipeFields(base, followingSet);
    const payload = profilePublicPayload(profile);
    result[`uid:${uid}`] = payload;
    if (profile.userslug) result[`slug:${String(profile.userslug).toLowerCase()}`] = payload;
  });
  return result;
}

function collectUserObjects(root, out = [], seen = new WeakSet(), depth = 0) {
  if (!root || typeof root !== 'object' || depth > 7) return out;
  if (seen.has(root)) return out;
  seen.add(root);
  if (Array.isArray(root)) {
    root.forEach(item => collectUserObjects(item, out, seen, depth + 1));
    return out;
  }
  const uid = Number(root.uid || root.userUid || root.authorUid || 0);
  if (uid && (root.username || root.userslug || root.displayname || root.picture || root.language_flag || root.language_fluent || root.language_learning || root.countryCode || root.flagEmoji)) out.push(root);
  ['user', 'author', 'teaser', 'mainPost', 'postData', 'post', 'posts', 'topic', 'topics', 'children'].forEach(key => {
    if (root[key]) collectUserObjects(root[key], out, seen, depth + 1);
  });
  return out;
}

async function attachPeipeProfilesToPayload(data, settings, viewerUid = 0) {
  if (!bool(settings.peipeAvatarFieldsEnabled, true)) return data;
  const objects = collectUserObjects(data);
  if (!objects.length) return data;
  const uids = Array.from(new Set(objects.map(obj => Number(obj.uid || obj.userUid || obj.authorUid || 0)).filter(Boolean)));
  const profiles = await getProfiles([], uids, settings, viewerUid);
  objects.forEach(obj => {
    const uid = Number(obj.uid || obj.userUid || obj.authorUid || 0);
    const profile = profiles[`uid:${uid}`];
    if (!profile) return;
    obj.peipeProfile = Object.assign({}, obj.peipeProfile || {}, profile);
    ['countryCode', 'flagEmoji', 'nativeCode', 'nativeCodes', 'learnCode', 'learnCodes', 'genderCode', 'ageText', 'isFollowing'].forEach(key => {
      if (obj[key] === undefined || obj[key] === null || obj[key] === '') obj[key] = profile[key];
    });
  });
  return data;
}

async function getTopicTags(tid) {
  const id = Number(tid || 0);
  if (!id) return [];
  try {
    if (typeof topics.getTopicTags === 'function') return (await topics.getTopicTags(id)) || [];
  } catch (error) {}
  try {
    if (typeof topics.getTopicField === 'function') {
      const tags = await topics.getTopicField(id, 'tags');
      if (Array.isArray(tags)) return tags;
      if (typeof tags === 'string') return tags.split(',').map(item => item.trim()).filter(Boolean);
    }
  } catch (error) {}
  try {
    const values = await db.getSetMembers(`topic:${id}:tags`);
    return Array.isArray(values) ? values : [];
  } catch (error) {}
  return [];
}


function requestWantsEssence(data, settings) {
  const req = data && (data.req || data.request || data._req || data.ctx && data.ctx.req) || null;
  const query = Object.assign({}, data && data.query || {}, req && req.query || {});
  const tagName = String(settings.essenceTagName || '精华').trim();
  return query.essence === '1' || query.essence === 'true' || String(query.filter || '') === 'essence' || String(query.tag || '') === tagName;
}

async function filterEssenceTopicsInPayload(data, settings) {
  if (!bool(settings.essenceFilterEnabled, true) || !requestWantsEssence(data, settings)) return data;
  const list = Array.isArray(data && data.topics) ? data.topics : (Array.isArray(data) ? data : []);
  if (!list.length) return data;
  const tagName = String(settings.essenceTagName || '精华').trim();
  const keep = [];
  for (const topic of list) {
    const tid = Number(topic && topic.tid || 0);
    const tags = Array.isArray(topic && topic.tags) ? topic.tags : await getTopicTags(tid);
    const has = (tags || []).some(tag => String(tag && (tag.value || tag.name || tag)).trim() === tagName);
    if (has) keep.push(topic);
  }
  if (Array.isArray(data && data.topics)) data.topics = keep;
  else if (Array.isArray(data)) {
    data.splice(0, data.length, ...keep);
  }
  return data;
}

async function getEssenceTids(cid, settings) {
  const tagName = String(settings.essenceTagName || '精华').trim();
  const scanLimit = Math.max(20, int(settings.essenceScanLimit, 500));
  const c = Number(cid || 0);
  let candidateTids = [];
  let fromTagIndex = false;
  const tagKeys = [`tag:${tagName}:topics`, `tag:${encodeURIComponent(tagName)}:topics`];
  for (const key of tagKeys) {
    try {
      const values = await db.getSortedSetRevRange(key, 0, scanLimit - 1);
      const found = (values || []).map(Number).filter(Boolean);
      if (found.length) fromTagIndex = true;
      candidateTids = candidateTids.concat(found);
    } catch (error) {}
  }
  if (!candidateTids.length && c) {
    try {
      const values = await db.getSortedSetRevRange(`cid:${c}:tids`, 0, scanLimit - 1);
      candidateTids = (values || []).map(Number).filter(Boolean);
    } catch (error) {}
  }
  candidateTids = Array.from(new Set(candidateTids)).filter(Boolean);
  if (!candidateTids.length) return [];
  const rows = await getTopicFields(candidateTids);
  const byTid = new Map((rows || []).map(row => [Number(row && row.tid || 0), row || {}]));
  const out = [];
  for (const tid of candidateTids) {
    const row = byTid.get(Number(tid)) || {};
    if (c && Number(row.cid || 0) !== c) continue;
    const tags = await getTopicTags(tid);
    const hasTag = (tags || []).some(tag => String(tag && (tag.value || tag.name || tag)).trim() === tagName);
    if (fromTagIndex || hasTag) out.push(tid);
  }
  return out;
}

function parseCoverSettings(settings) {
  try {
    const parsed = JSON.parse(settings.categoryCovers || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function normalizeCategory(cat, covers) {
  if (!cat) return null;
  const cid = Number(cat.cid || 0);
  const cover = covers[cid] || covers[String(cid)] || {};
  return {
    cid,
    name: cat.name || '',
    slug: cat.slug || cat.name || String(cid),
    description: cat.descriptionParsed || cat.description || '',
    icon: cat.icon || cat.class || '',
    bgColor: cat.bgColor || cat.backgroundColor || '',
    color: cat.color || '',
    totalTopicCount: Number(cat.totalTopicCount || cat.topic_count || cat.topicCount || cat.topics || 0),
    totalPostCount: Number(cat.totalPostCount || cat.post_count || cat.postCount || cat.posts || 0),
    cover: typeof cover === 'string' ? cover : (cover.cover || cover.image || ''),
    children: Array.isArray(cat.children) ? cat.children.map(child => normalizeCategory(child, covers)).filter(Boolean) : [],
    teaser: cat.teaser || null
  };
}

async function getCategoryIndex(settings) {
  const ttl = int(settings.categoryCacheSeconds, 600);
  if (cache.categories && cache.categories.expiresAt > Date.now()) return cache.categories.value;
  const covers = parseCoverSettings(settings);
  let list = [];
  if (typeof categories.getAllCategories === 'function') {
    list = await categories.getAllCategories(['cid', 'name', 'slug', 'description', 'descriptionParsed', 'icon', 'bgColor', 'color', 'totalTopicCount', 'totalPostCount', 'parentCid', 'teaser']);
  } else if (typeof categories.getCategories === 'function') {
    list = await categories.getCategories();
  }
  const roots = (Array.isArray(list) ? list : []).filter(cat => !Number(cat.parentCid || 0));
  const all = (roots.length ? roots : list).map(cat => normalizeCategory(cat, covers)).filter(Boolean);
  const value = { categories: all };
  cache.categories = { value, expiresAt: Date.now() + ttl * 1000 };
  return value;
}

Plugin.init = async function init(params) {
  const router = params.router;
  const middleware = params.middleware || {};
  const helpers = params.helpers || {};
  const authenticate = middleware.authenticateRequest || ((req, res, next) => next());
  const ensureAdmin = (req, res, next) => {
    if (req.user && (req.user.isAdmin || (Array.isArray(req.user.privileges) && req.user.privileges.includes('admin')))) return next();
    if (req.uid && req.uid > 0 && req.user && req.user.isGlobalModerator) return next();
    return res.status(403).json({ error: 'not-authorized' });
  };
  const adminGuard = middleware.admin && typeof middleware.admin.checkPrivileges === 'function' ? middleware.admin.checkPrivileges : ensureAdmin;

  if (helpers.setupAdminPageRoute) {
    helpers.setupAdminPageRoute(router, '/admin/plugins/haa9-experience', [], (req, res) => {
      res.render('admin/plugins/haa9-experience', {});
    });
  } else {
    router.get('/admin/plugins/haa9-experience', middleware.admin && middleware.admin.buildHeader ? middleware.admin.buildHeader : (req, res, next) => next(), (req, res) => {
      res.render('admin/plugins/haa9-experience', {});
    });
  }

  router.get('/api/haa9-experience/config', authenticate, async (req, res, next) => {
    try {
      const settings = await getSettings();
      res.json(publicConfig(settings));
    } catch (error) { next(error); }
  });

  router.get('/api/haa9-experience/media', authenticate, async (req, res, next) => {
    try {
      const settings = await getSettings();
      const limit = int(settings.mediaBatchLimit, 40);
      const ids = String(req.query.ids || '').split(',').map(id => parseInt(id, 10)).filter(Boolean).slice(0, limit);
      const uid = req.uid || (req.user && req.user.uid) || 0;
      const entries = await Promise.all(ids.map(async tid => [String(tid), await buildMediaForTid(tid, uid, settings)]));
      const media = {};
      entries.forEach(([tid, value]) => { if (value) media[tid] = value; });
      res.json({ media });
    } catch (error) { next(error); }
  });

  router.get('/api/haa9-experience/profiles', authenticate, async (req, res, next) => {
    try {
      const settings = await getSettings();
      const limit = int(settings.profileBatchLimit, 80);
      const slugs = String(req.query.slugs || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, limit);
      const uids = String(req.query.uids || '').split(',').map(id => parseInt(id, 10)).filter(Boolean).slice(0, limit);
      const viewerUid = Number(req.uid || req.query.viewerUid || 0);
      const profiles = await getProfiles(slugs, uids, settings, viewerUid);
      res.json({ profiles });
    } catch (error) { next(error); }
  });


  router.get('/api/haa9-experience/essence-tids', authenticate, async (req, res, next) => {
    try {
      const settings = await getSettings();
      if (!bool(settings.essenceFilterEnabled, true)) return res.json({ ok: true, tids: [], tag: settings.essenceTagName || '精华', disabled: true });
      const cid = Number(req.query.cid || 0);
      const tids = await getEssenceTids(cid, settings);
      res.json({ ok: true, cid, tag: settings.essenceTagName || '精华', tids });
    } catch (error) { next(error); }
  });

  router.get('/api/haa9-experience/categories', authenticate, async (req, res, next) => {
    try {
      const settings = await getSettings();
      res.json(await getCategoryIndex(settings));
    } catch (error) { next(error); }
  });

  router.get('/api/admin/plugins/haa9-experience/settings', authenticate, adminGuard, async (req, res, next) => {
    try {
      res.json(await getSettings());
    } catch (error) { next(error); }
  });

  router.post('/api/admin/plugins/haa9-experience/settings', authenticate, adminGuard, async (req, res, next) => {
    try {
      // The route is under /api/admin and is intended for ACP use. Most NodeBB
      // builds already guard it via ACP route middleware; keep the payload small
      // and persist only known keys.
      const body = req.body || {};
      const allowed = Object.keys(defaults).reduce((memo, key) => {
        if (body[key] !== undefined) memo[key] = body[key];
        return memo;
      }, {});
      res.json(await setSettings(allowed));
    } catch (error) { next(error); }
  });
};

Plugin.addAdminNavigation = async function addAdminNavigation(header) {
  header.plugins = header.plugins || [];
  header.plugins.push({
    route: '/plugins/haa9-experience',
    icon: 'fa-comments',
    name: '[[haa9-experience:admin.title]]'
  });
  return header;
};

Plugin.clearCacheOnPost = async function clearCacheOnPost(data) {
  if (data && data.post && data.post.tid) cache.media.delete(String(data.post.tid));
  if (data && data.tid) cache.media.delete(String(data.tid));
  cache.categories = null;
};

Plugin.clearCacheOnTopic = async function clearCacheOnTopic(data) {
  if (data && data.topic && data.topic.tid) cache.media.delete(String(data.topic.tid));
  if (data && data.tid) cache.media.delete(String(data.tid));
  cache.categories = null;
};


Plugin.filterTopicsGet = async function filterTopicsGet(data) {
  const settings = await getSettings();
  const viewerUid = Number(data && (data.uid || data.callerUid || data.user && data.user.uid) || 0);
  await attachPeipeProfilesToPayload(data, settings, viewerUid);
  await filterEssenceTopicsInPayload(data, settings);
  return data;
};

Plugin.filterTopicGet = async function filterTopicGet(data) {
  const settings = await getSettings();
  const viewerUid = Number(data && (data.uid || data.callerUid || data.user && data.user.uid) || 0);
  await attachPeipeProfilesToPayload(data, settings, viewerUid);
  await filterEssenceTopicsInPayload(data, settings);
  return data;
};

Plugin.filterTopicGetPosts = async function filterTopicGetPosts(data) {
  const settings = await getSettings();
  const viewerUid = Number(data && (data.uid || data.callerUid || data.user && data.user.uid) || 0);
  return attachPeipeProfilesToPayload(data, settings, viewerUid);
};

Plugin.filterPostGetPosts = async function filterPostGetPosts(data) {
  const settings = await getSettings();
  const viewerUid = Number(data && (data.uid || data.callerUid || data.user && data.user.uid) || 0);
  return attachPeipeProfilesToPayload(data, settings, viewerUid);
};

module.exports = Plugin;
