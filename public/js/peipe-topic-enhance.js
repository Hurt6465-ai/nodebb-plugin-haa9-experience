/* global ajaxify */
'use strict';

(function () {
  const VERSION = '0.4.0-peipe-topic-enhance';
  const API_PREFIX = '/api/haa9-experience';
  const ESSENCE_QUERY = 'essence';
  const TEXT = {
    essence: '精华',
    emptyEssence: '暂无精华帖子',
    follow: '关注',
    following: '已关注',
    followFail: '关注失败',
    unfollowFail: '取消关注失败'
  };
  const I18N_KEYS = ['essence', 'emptyEssence', 'follow', 'following', 'followFail', 'unfollowFail'];

  window.PEIPE_TOPIC_ENHANCE_VERSION = VERSION;

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    return path.indexOf(base) === 0 ? path : base + path;
  }

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function t(key) { return TEXT[key] || key; }

  function loadTranslations() {
    return new Promise(resolve => {
      if (!window.require) return resolve();
      window.require(['translator'], translator => {
        let pending = I18N_KEYS.length;
        I18N_KEYS.forEach(key => {
          translator.translate(`[[haa9-experience:peipe.${key}]]`, translated => {
            if (translated && translated.indexOf('[[haa9-experience:') === -1) TEXT[key] = translated;
            pending -= 1;
            if (!pending) resolve();
          });
        });
      }, resolve);
    });
  }

  function currentConfig() {
    const cfg = (window.HAA9Plugin && window.HAA9Plugin.config && window.HAA9Plugin.config.client) || {};
    return {
      profileBatchLimit: Number(cfg.profileBatchLimit || 80),
      essenceFilterEnabled: cfg.essenceFilterEnabled !== false,
      essenceTagName: cfg.essenceTagName || t('essence'),
      peipeTopicBottomBarEnabled: cfg.peipeTopicBottomBarEnabled !== false
    };
  }

  function currentCid() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const cid = Number(data.cid || data.category && data.category.cid || data.topic && data.topic.cid || 0);
    if (cid) return cid;
    const match = location.pathname.match(/\/category\/(\d+)(?:\/|$)/);
    return match ? Number(match[1]) : 0;
  }

  function isCategoryPage() {
    return document.body.classList.contains('page-category') || /\/category\/(\d+)(?:\/|$)/.test(location.pathname);
  }

  function isTopicPage() {
    return document.body.classList.contains('page-topic') || /\/topic\/\d+/i.test(location.pathname);
  }

  function topicNodes() {
    return $$('li[component="category/topic"], [data-tid].topic-card, [data-tid].category-item, article[data-tid]')
      .filter(node => findTid(node));
  }

  function findTid(node) {
    if (!node) return '';
    const direct = node.getAttribute('data-tid') || node.dataset.tid || node.dataset.topicId || node.getAttribute('data-topic-id');
    if (direct && /^\d+$/.test(String(direct))) return String(direct);
    const link = $('a[href*="/topic/"]', node) || (node.matches && node.matches('a[href*="/topic/"]') ? node : null);
    const match = link && String(link.getAttribute('href') || '').match(/\/topic\/(\d+)(?:\/|$)/);
    return match ? match[1] : '';
  }

  function extractUserRef(root) {
    if (!root) return null;
    const directUid = root.getAttribute('data-uid') || root.dataset.uid || '';
    const userLink = $('a[href*="/user/"]', root) || (root.matches && root.matches('a[href*="/user/"]') ? root : null);
    let slug = '';
    if (userLink) {
      const match = String(userLink.getAttribute('href') || '').match(/\/user\/([^/?#]+)/);
      slug = match ? decodeURIComponent(match[1]) : '';
    }
    const uid = String(directUid || '').trim();
    if (!uid && !slug) return null;
    return { uid, userslug: slug };
  }

  function collectUserRefs() {
    const refs = new Map();
    const roots = topicNodes().concat($$('[component="post"], [data-pid], .posts li, article'));
    roots.forEach(root => {
      const ref = extractUserRef(root);
      if (!ref) return;
      const key = ref.uid ? `uid:${ref.uid}` : `slug:${ref.userslug.toLowerCase()}`;
      if (!refs.has(key)) refs.set(key, ref);
    });
    return Array.from(refs.values());
  }

  async function fetchProfiles(refs) {
    if (!refs.length) return {};
    if (window.HAA9Plugin && typeof window.HAA9Plugin.fetchProfile === 'function') {
      const entries = await Promise.all(refs.map(async ref => {
        try {
          const profile = await window.HAA9Plugin.fetchProfile(ref);
          return [ref.uid ? `uid:${ref.uid}` : `slug:${String(ref.userslug || '').toLowerCase()}`, profile || {}];
        } catch (error) {
          return [ref.uid ? `uid:${ref.uid}` : `slug:${String(ref.userslug || '').toLowerCase()}`, {}];
        }
      }));
      return entries.reduce((memo, pair) => {
        memo[pair[0]] = pair[1];
        if (pair[1] && pair[1].uid) memo[`uid:${pair[1].uid}`] = pair[1];
        if (pair[1] && pair[1].userslug) memo[`slug:${String(pair[1].userslug).toLowerCase()}`] = pair[1];
        return memo;
      }, {});
    }
    const limit = currentConfig().profileBatchLimit || 80;
    const uids = refs.map(ref => ref.uid).filter(Boolean).slice(0, limit);
    const slugs = refs.map(ref => ref.userslug).filter(Boolean).slice(0, limit);
    const query = new URLSearchParams();
    if (uids.length) query.set('uids', uids.join(','));
    if (slugs.length) query.set('slugs', slugs.join(','));
    const res = await fetch(rel(`${API_PREFIX}/profiles?${query.toString()}`), { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) return {};
    const json = await res.json();
    return (json && json.profiles) || {};
  }

  function profileForRoot(root, profiles) {
    const ref = extractUserRef(root);
    if (!ref) return null;
    return (ref.uid && profiles[`uid:${ref.uid}`]) || (ref.userslug && profiles[`slug:${ref.userslug.toLowerCase()}`]) || null;
  }

  function applyAvatarFlag(root, profile) {
    if (!profile || !profile.flagEmoji) return;
    const avatar = $('img.avatar, img[component="user/picture"], .user-img img, img[alt]', root);
    if (!avatar) return;
    const wrap = avatar.closest('.avatar, .user-icon, .user-img, a, .avatar-wrapper') || avatar.parentElement;
    if (!wrap || wrap.querySelector('.peipe-topic-flag')) return;
    wrap.classList.add('peipe-topic-avatar-wrap');
    const flag = document.createElement('span');
    flag.className = 'peipe-topic-flag';
    flag.textContent = profile.flagEmoji;
    wrap.appendChild(flag);
  }

  function langChips(profile) {
    const native = Array.isArray(profile.nativeCodes) ? profile.nativeCodes.slice(0, 3) : (profile.nativeCode ? [profile.nativeCode] : []);
    const learn = Array.isArray(profile.learnCodes) ? profile.learnCodes.slice(0, 3) : (profile.learnCode ? [profile.learnCode] : []);
    if (!native.length && !learn.length) return '';
    const chips = [];
    if (native.length) chips.push(`<span class="peipe-lang-row"><b>母</b>${native.map(code => `<i>${escapeHtml(code)}</i>`).join('')}</span>`);
    if (learn.length) chips.push(`<span class="peipe-lang-row learn"><b>学</b>${learn.map(code => `<i>${escapeHtml(code)}</i>`).join('')}</span>`);
    return `<span class="peipe-topic-langs">${chips.join('')}</span>`;
  }

  function applyUserMeta(root, profile) {
    if (!profile) return;
    const title = $('[component="topic/title"] a, .topic-title a, h3 a, .title a, a[href*="/topic/"]', root);
    const name = $('[component="user/username"], .username, .haa9-name, a[href*="/user/"]', root);
    const anchor = name || title;
    if (!anchor) return;
    const holder = anchor.closest('.d-flex, .topic-info, .content, .card-body, .haa9-user') || anchor.parentElement;
    if (!holder || holder.querySelector('.peipe-topic-langs')) return;
    const html = langChips(profile);
    if (!html) return;
    const tmp = document.createElement('span');
    tmp.innerHTML = html;
    holder.appendChild(tmp.firstElementChild);
  }

  function commentsAndLikes(node) {
    const commentsNode = $('[component="topic/post-count"], [component="topic/reply-count"], .stats-postcount, .post-count, .replies', node);
    const votesNode = $('[component="topic/vote-count"], [component="post/vote-count"], .stats-votes, .vote-count, .upvotes', node);
    const comments = commentsNode ? (String(commentsNode.textContent || '').match(/\d+/) || ['0'])[0] : (node.getAttribute('data-postcount') || '0');
    const likes = votesNode ? (String(votesNode.textContent || '').match(/-?\d+/) || ['0'])[0] : (node.getAttribute('data-votes') || '0');
    return { comments, likes };
  }

  function applyBottomBar(node) {
    if (!currentConfig().peipeTopicBottomBarEnabled || node.querySelector('.peipe-topic-bottom')) return;
    const stats = commentsAndLikes(node);
    const bar = document.createElement('div');
    bar.className = 'peipe-topic-bottom';
    bar.innerHTML = `<span class="peipe-topic-stat">💬 ${escapeHtml(stats.comments)}</span><span class="peipe-topic-stat">👍 ${escapeHtml(stats.likes)}</span>`;
    const body = $('.card-body, .content, .topic-info, .description, .haa9-card-body', node) || node;
    body.appendChild(bar);
  }

  function applyFollowButton(root, profile) {
    if (!profile || !profile.uid || root.querySelector('.peipe-follow-btn, .haa9-follow')) return;
    const me = window.app && window.app.user;
    if (!me || !me.uid || Number(me.uid) === Number(profile.uid)) return;
    const name = $('[component="user/username"], .username, .haa9-name, a[href*="/user/"]', root);
    if (!name) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `peipe-follow-btn${profile.isFollowing ? ' is-following' : ''}`;
    btn.dataset.uid = profile.uid;
    btn.textContent = profile.isFollowing ? t('following') : t('follow');
    btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const following = !btn.classList.contains('is-following');
      btn.disabled = true;
      try {
        const method = following ? 'PUT' : 'DELETE';
        const res = await fetch(rel(`/api/v3/users/${encodeURIComponent(profile.uid)}/follow`), { method, credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`follow ${res.status}`);
        btn.classList.toggle('is-following', following);
        btn.textContent = following ? t('following') : t('follow');
      } catch (error) {
        if (window.app && window.app.alertError) window.app.alertError(following ? t('followFail') : t('unfollowFail'));
      } finally {
        btn.disabled = false;
      }
    });
    name.insertAdjacentElement('afterend', btn);
  }

  async function decorateProfiles() {
    const refs = collectUserRefs();
    if (!refs.length) return;
    const profiles = await fetchProfiles(refs);
    const roots = topicNodes().concat($$('[component="post"], [data-pid], article'));
    roots.forEach(root => {
      const profile = profileForRoot(root, profiles);
      if (!profile) return;
      applyAvatarFlag(root, profile);
      applyUserMeta(root, profile);
      applyFollowButton(root, profile);
      if (findTid(root)) applyBottomBar(root);
    });
  }

  function isEssenceActive() {
    try { return new URL(location.href).searchParams.get(ESSENCE_QUERY) === '1'; } catch (_) { return false; }
  }

  function setEssenceUrl(active) {
    const url = new URL(location.href);
    if (active) url.searchParams.set(ESSENCE_QUERY, '1');
    else url.searchParams.delete(ESSENCE_QUERY);
    if (window.ajaxify && typeof window.ajaxify.go === 'function') {
      window.ajaxify.go(url.pathname.replace(/^\//, '') + url.search + url.hash);
    } else {
      location.href = url.toString();
    }
  }

  function ensureEssenceButton() {
    if (!isCategoryPage() || !currentConfig().essenceFilterEnabled) return;
    if ($('.peipe-essence-filter')) return;
    const label = currentConfig().essenceTagName || '精华';
    const toolbar = $('[component="category/sort"], .category-tools, .topic-list-header, .category-header .btn-toolbar, .category-header, [component="category/controls"]') || $('.category') || $('.container');
    if (!toolbar) return;
    const wrap = document.createElement('div');
    wrap.className = 'peipe-essence-toolbar';
    const active = isEssenceActive();
    wrap.innerHTML = `<button type="button" class="peipe-essence-filter${active ? ' active' : ''}" aria-pressed="${active ? 'true' : 'false'}">⭐ ${escapeHtml(label)}</button>`;
    wrap.querySelector('button').addEventListener('click', event => {
      event.preventDefault();
      setEssenceUrl(!isEssenceActive());
    });
    toolbar.appendChild(wrap);
  }

  async function applyEssenceFilter() {
    if (!isCategoryPage() || !isEssenceActive()) return;
    const nodes = topicNodes();
    if (!nodes.length) return;
    const cid = currentCid();
    try {
      const res = await fetch(rel(`${API_PREFIX}/essence-tids?cid=${encodeURIComponent(cid)}&_=${Date.now()}`), { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`essence ${res.status}`);
      const json = await res.json();
      const tids = new Set((json.tids || []).map(String));
      nodes.forEach(node => {
        const tid = findTid(node);
        node.classList.toggle('peipe-topic-hidden', !tids.has(String(tid)));
      });
      if (!tids.size) showEmptyEssence();
    } catch (error) {
      console.warn('[Peipe] essence filter failed:', error);
    }
  }

  function showEmptyEssence() {
    if ($('.peipe-essence-empty')) return;
    const list = $('[component="category/topic/list"], [component="category"] ul, .category ul, .topic-list') || $('.category') || document.body;
    const box = document.createElement('div');
    box.className = 'peipe-essence-empty';
    box.textContent = t('emptyEssence');
    list.appendChild(box);
  }

  function run() {
    ensureEssenceButton();
    applyEssenceFilter();
    decorateProfiles();
  }

  let timer = 0;
  let translationsReady = false;
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (translationsReady) return run();
      loadTranslations().then(() => {
        translationsReady = true;
        run();
      });
    }, 80);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  document.addEventListener('haa9:config.ready', schedule);
  if (window.jQuery) {
    window.jQuery(window).off('action:ajaxify.end.peipeTopicEnhance').on('action:ajaxify.end.peipeTopicEnhance', schedule);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
