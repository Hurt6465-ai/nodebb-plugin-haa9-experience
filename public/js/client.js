/* global ajaxify */
'use strict';

(() => {
  const PLUGIN_ID = 'haa9-experience';
  const API_PREFIX = '/api/haa9-experience';
  const DEFAULT_CONFIG = {
    client: {
      cid: 6,
      topicDetailAllCids: true,
      voiceAudioBitsPerSecond: 16000,
      topicCacheMs: 5 * 60 * 1000,
      topicLocalCacheMs: 30 * 60 * 1000,
      profileCacheMs: 24 * 60 * 60 * 1000,
      categoryIndexCacheMs: 10 * 60 * 1000,
      mediaBatchLimit: 40,
      mediaBatchDelayMs: 35,
      profileBatchLimit: 80,
      profileBatchDelayMs: 35
    }
  };

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    return path.indexOf(base) === 0 ? path : base + path;
  }

  function safeJsonGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeJsonSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function mergeConfig(next) {
    const merged = Object.assign({}, DEFAULT_CONFIG, next || {});
    merged.client = Object.assign({}, DEFAULT_CONFIG.client, (next && next.client) || {});
    window.HAA9Plugin.config = merged;
    safeJsonSet('haa9-plugin-config', merged);
    document.dispatchEvent(new CustomEvent('haa9:config.ready', { detail: merged }));
    return merged;
  }

  const stored = safeJsonGet('haa9-plugin-config', DEFAULT_CONFIG) || DEFAULT_CONFIG;

  window.HAA9Plugin = window.HAA9Plugin || {};
  window.HAA9Plugin.version = '15.0.0-plugin-peipe-0.4.0';
  window.HAA9Plugin.config = mergeConfig(stored);

  const mediaCache = new Map();
  const profileCache = new Map();
  let mediaQueue = new Map();
  let mediaTimer = 0;
  let profileQueue = new Map();
  let profileTimer = 0;

  async function fetchJson(url) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  }

  async function loadConfig() {
    try {
      const data = await fetchJson(rel(`${API_PREFIX}/config`));
      mergeConfig(data || {});
    } catch (error) {
      console.warn('[HAA9] config load failed, using local/default config:', error);
    }
  }

  function cacheKey(prefix, id) { return `${prefix}:${id}`; }

  window.HAA9Plugin.fetchTopicMedia = function fetchTopicMedia(tid) {
    const key = String(tid || '').trim();
    if (!key) return Promise.resolve(null);

    const cfg = window.HAA9Plugin.config.client || DEFAULT_CONFIG.client;
    const localKey = cacheKey('haa9-plugin-media', key);
    const cached = mediaCache.get(key) || safeJsonGet(localKey, null);
    if (cached && cached.expiresAt > Date.now()) {
      mediaCache.set(key, cached);
      return Promise.resolve(cached.value);
    }

    if (mediaQueue.has(key)) return mediaQueue.get(key).promise;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    mediaQueue.set(key, { resolve, reject, promise });

    window.clearTimeout(mediaTimer);
    mediaTimer = window.setTimeout(flushMediaQueue, cfg.mediaBatchDelayMs || 35);
    if (mediaQueue.size >= (cfg.mediaBatchLimit || 40)) flushMediaQueue();
    return promise;
  };

  async function flushMediaQueue() {
    const cfg = window.HAA9Plugin.config.client || DEFAULT_CONFIG.client;
    const entries = Array.from(mediaQueue.entries()).slice(0, cfg.mediaBatchLimit || 40);
    if (!entries.length) return;
    entries.forEach(([key]) => mediaQueue.delete(key));
    const ids = entries.map(([key]) => key);
    try {
      const payload = await fetchJson(rel(`${API_PREFIX}/media?ids=${encodeURIComponent(ids.join(','))}`));
      const map = (payload && payload.media) || {};
      entries.forEach(([key, slot]) => {
        const value = map[key] || { cid: 0, text: '', images: [], audios: [], tiktoks: [] };
        const cached = { value, expiresAt: Date.now() + (cfg.topicLocalCacheMs || 30 * 60 * 1000) };
        mediaCache.set(key, cached);
        safeJsonSet(cacheKey('haa9-plugin-media', key), cached);
        slot.resolve(value);
      });
    } catch (error) {
      entries.forEach(([, slot]) => slot.reject(error));
    }
  }

  window.HAA9Plugin.fetchProfile = function fetchProfile(user) {
    const slug = String(user && user.userslug || '').trim();
    const uid = String(user && user.uid || '').trim();
    const key = slug ? `slug:${slug.toLowerCase()}` : (uid ? `uid:${uid}` : '');
    if (!key) return Promise.resolve(null);

    const cfg = window.HAA9Plugin.config.client || DEFAULT_CONFIG.client;
    const localKey = cacheKey('haa9-plugin-profile', key);
    const cached = profileCache.get(key) || safeJsonGet(localKey, null);
    if (cached && cached.expiresAt > Date.now()) {
      profileCache.set(key, cached);
      return Promise.resolve(cached.value);
    }

    if (profileQueue.has(key)) return profileQueue.get(key).promise;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    profileQueue.set(key, { resolve, reject, promise, slug, uid });

    window.clearTimeout(profileTimer);
    profileTimer = window.setTimeout(flushProfileQueue, cfg.profileBatchDelayMs || 35);
    if (profileQueue.size >= (cfg.profileBatchLimit || 40)) flushProfileQueue();
    return promise;
  };

  async function flushProfileQueue() {
    const cfg = window.HAA9Plugin.config.client || DEFAULT_CONFIG.client;
    const entries = Array.from(profileQueue.entries()).slice(0, cfg.profileBatchLimit || 40);
    if (!entries.length) return;
    entries.forEach(([key]) => profileQueue.delete(key));
    const slugs = entries.map(([, slot]) => slot.slug).filter(Boolean);
    const uids = entries.map(([, slot]) => slot.uid).filter(Boolean);
    try {
      const query = new URLSearchParams();
      if (slugs.length) query.set('slugs', slugs.join(','));
      if (uids.length) query.set('uids', uids.join(','));
      const payload = await fetchJson(rel(`${API_PREFIX}/profiles?${query.toString()}`));
      const map = (payload && payload.profiles) || {};
      entries.forEach(([key, slot]) => {
        const value = map[key] || map[`slug:${slot.slug}`] || map[`uid:${slot.uid}`] || {};
        const cached = { value, expiresAt: Date.now() + (cfg.profileCacheMs || 24 * 60 * 60 * 1000) };
        profileCache.set(key, cached);
        safeJsonSet(cacheKey('haa9-plugin-profile', key), cached);
        slot.resolve(value);
      });
    } catch (error) {
      entries.forEach(([, slot]) => slot.reject(error));
    }
  }

  window.HAA9Plugin.fetchCategoryIndex = async function fetchCategoryIndex() {
    const cfg = window.HAA9Plugin.config.client || DEFAULT_CONFIG.client;
    const key = 'haa9-plugin-category-index';
    const cached = safeJsonGet(key, null);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const payload = await fetchJson(rel(`${API_PREFIX}/categories`));
    safeJsonSet(key, { value: payload, expiresAt: Date.now() + (cfg.categoryIndexCacheMs || 10 * 60 * 1000) });
    return payload;
  };

  loadConfig();
})();
