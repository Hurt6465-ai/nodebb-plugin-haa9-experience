/* =========================================
   NodeBB Topic Detail UI v14.0
   修复点：
   - 手机端极限紧凑间距 / 清理隐藏媒体占位
   - AI 设置贴原生工具栏，不额外生成“翻译工具”行
   - 帖子翻译按钮插到文字末尾，不跟随媒体/audio
   - 语音录制指定 opus 16kbps，降低上传体积
   - 头像和用户名跳到用户主题列表 /user/{userslug}/topics
   - 避免重复初始化、重复发送、错误的内容重排
   Load this once on topic pages. Do not load older x-topic-detail patches together.
   ========================================= */
(function ($, window, document) {
  'use strict';

  if (!$) return;

  const VERSION = '14.0.0';
  const UI_VERSION_ATTR = 'data-x-topic-detail-version';

  const IMAGE_CONFIG = {
    maxSide: 1440,
    maxSizeMB: 0.45,
    quality: 0.60,
    minCompressBytes: 120 * 1024,
    useWebp: true
  };

  const VOICE_CONFIG = {
    mimeType: 'audio/webm;codecs=opus',
    fallbackMimeTypes: ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'],
    audioBitsPerSecond: 16000
  };


  try {
    const storedPluginConfig = JSON.parse(localStorage.getItem('haa9-plugin-config') || '{}');
    if (storedPluginConfig && storedPluginConfig.client && storedPluginConfig.client.voiceAudioBitsPerSecond) {
      VOICE_CONFIG.audioBitsPerSecond = Number(storedPluginConfig.client.voiceAudioBitsPerSecond) || VOICE_CONFIG.audioBitsPerSecond;
    }
  } catch (_) {}

  const COUNTRY_MAP = {
    '中国': '🇨🇳', cn: '🇨🇳', china: '🇨🇳',
    '新加坡': '🇸🇬', sg: '🇸🇬', singapore: '🇸🇬',
    '缅甸': '🇲🇲', myanmar: '🇲🇲', burma: '🇲🇲', mm: '🇲🇲',
    '泰国': '🇹🇭', th: '🇹🇭', thailand: '🇹🇭',
    '越南': '🇻🇳', vn: '🇻🇳', vietnam: '🇻🇳',
    '老挝': '🇱🇦', laos: '🇱🇦', la: '🇱🇦',
    '柬埔寨': '🇰🇭', cambodia: '🇰🇭', kh: '🇰🇭',
    '马来西亚': '🇲🇾', malaysia: '🇲🇾', my: '🇲🇾',
    '菲律宾': '🇵🇭', philippines: '🇵🇭', ph: '🇵🇭',
    '日本': '🇯🇵', japan: '🇯🇵', jp: '🇯🇵',
    '韩国': '🇰🇷', korea: '🇰🇷', kr: '🇰🇷',
    '美国': '🇺🇸', usa: '🇺🇸', us: '🇺🇸', unitedstates: '🇺🇸',
    '英国': '🇬🇧', uk: '🇬🇧', gb: '🇬🇧', unitedkingdom: '🇬🇧'
  };

  const LANGUAGE_META = {
    auto: { flag: '🌐', label: '自动检测' },
    zh: { flag: '🇨🇳', label: '中文' },
    'zh-cn': { flag: '🇨🇳', label: '中文' },
    'zh-tw': { flag: '🇹🇼', label: '繁中' },
    en: { flag: '🇺🇸', label: 'English' },
    my: { flag: '🇲🇲', label: 'မြန်မာ' },
    mm: { flag: '🇲🇲', label: 'မြန်မာ' },
    th: { flag: '🇹🇭', label: 'ไทย' },
    vi: { flag: '🇻🇳', label: 'Tiếng Việt' },
    vn: { flag: '🇻🇳', label: 'Tiếng Việt' },
    ja: { flag: '🇯🇵', label: '日本語' },
    ko: { flag: '🇰🇷', label: '한국어' },
    ms: { flag: '🇲🇾', label: 'Bahasa Melayu' },
    id: { flag: '🇮🇩', label: 'Bahasa Indonesia' },
    fr: { flag: '🇫🇷', label: 'Français' },
    de: { flag: '🇩🇪', label: 'Deutsch' },
    es: { flag: '🇪🇸', label: 'Español' },
    ru: { flag: '🇷🇺', label: 'Русский' }
  };

  const SOURCE_LANGUAGE_OPTIONS = ['auto', 'zh', 'en', 'my', 'th', 'vi', 'ja', 'ko'];
  const TARGET_LANGUAGE_OPTIONS = ['en', 'zh', 'my', 'th', 'vi', 'ja', 'ko', 'ms', 'id', 'fr', 'de', 'es', 'ru'];
  const TRANSLATE_SETTINGS_KEY = 'x-topic-translate-settings';
  const DEFAULT_PROMPT = '你是专业论坛翻译助手。请把用户提供的内容从 {{sourceLang}} 翻译为 {{targetLang}}。保留原有语气、换行、链接、Markdown、代码块、用户名、表情和列表结构。只输出译文，不要解释。';
  const WAVE_HEIGHTS = [8, 12, 18, 10, 22, 14, 19, 9, 16, 24, 14, 11, 18, 13, 20, 9];
  const PAGE_SLIDER_TRACK_PADDING = 14;

  const oldState = window.__xTopicDetailV14State || window.__xTopicDetailV13State || window.__xTopicDetailV14State || window.__xTopicDetailV9State || {};
  if (oldState && oldState.postObserver) {
    try { oldState.postObserver.disconnect(); } catch (_) {}
    oldState.postObserver = null;
  }
  const state = window.__xTopicDetailV14State = Object.assign({
    version: VERSION,
    topicKey: '',
    replySending: false,
    replyTo: null,
    pendingFile: null,
    pendingFileUrl: '',
    pendingFileKind: '',
    pendingVoiceBlob: null,
    pendingVoiceUrl: '',
    pendingVoiceSeconds: 0,
    mediaRecorder: null,
    recordStream: null,
    recordChunks: [],
    recordTimer: null,
    recordStartAt: 0,
    currentAudio: null,
    currentAudioCard: null,
    titleTranslated: false,
    titleOriginal: '',
    titleTranslatedText: '',
    translateSettings: null,
    postObserver: null,
    langPickerRole: '',
    pagePickerValue: 1,
    pageDragActive: false,
    encodeSupport: {},
    lastReplyFingerprint: '',
    lastReplyAt: 0,
    inFlightFingerprint: ''
  }, oldState, { version: VERSION, postObserver: null });

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    return path.indexOf(base) === 0 ? path : `${base}${path}`;
  }

  function isTopicPage() {
    return $('body').hasClass('page-topic');
  }

  function currentTopicKey() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    return String(data.tid || data.topic_id || data.topicId || location.pathname || '');
  }

  function ensureTopicState() {
    const key = currentTopicKey();
    if (state.topicKey === key) return;
    state.topicKey = key;
    state.replyTo = null;
    state.titleTranslated = false;
    state.titleOriginal = '';
    state.titleTranslatedText = '';
    state.inFlightFingerprint = '';
    if (state.postObserver) {
      try { state.postObserver.disconnect(); } catch (_) {}
      state.postObserver = null;
    }
  }

  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showError(msg) {
    if (window.app && typeof window.app.alertError === 'function') window.app.alertError(msg);
    else window.alert(msg);
  }

  function showSuccess(msg) {
    if (window.app && typeof window.app.alertSuccess === 'function') window.app.alertSuccess(msg);
  }

  function csrfToken() {
    return (window.config && (window.config.csrf_token || window.config.csrfToken)) ||
      ($('meta[name="csrf-token"]').attr('content') || '');
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function safeJsonGet(key, fallback = null) {
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

  function normalizeLoc(loc) {
    return String(loc || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function parseTimeCandidate(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number' && Number.isFinite(val)) return val > 9999999999 ? val : val * 1000;
    const text = String(val).trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) {
      const num = Number(text);
      if (!Number.isFinite(num)) return null;
      return num > 9999999999 ? num : num * 1000;
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function formatAbsoluteTime(ts) {
    const value = parseTimeCandidate(ts);
    if (!value) return '';
    const date = new Date(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function timeAgoText(tsValue) {
    const ts = parseTimeCandidate(tsValue);
    if (!ts || Number.isNaN(ts)) return '刚刚';
    const diff = Math.max(0, Date.now() - ts);
    const minute = 60000, hour = 60 * minute, day = 24 * hour, week = 7 * day, month = 30 * day, year = 365 * day;
    if (diff >= year) return `${Math.floor(diff / year)}年前`;
    if (diff >= month) return `${Math.floor(diff / month)}个月前`;
    if (diff >= week) return `${Math.floor(diff / week)}周前`;
    if (diff >= day) return `${Math.floor(diff / day)}天前`;
    if (diff >= hour) return `${Math.floor(diff / hour)}小时前`;
    if (diff >= minute) return `${Math.max(1, Math.floor(diff / minute))}分钟前`;
    return '刚刚';
  }

  function getPostTimeMeta($post) {
    const $time = $post.find('.timeago').first();
    const candidates = [
      $post.attr('data-timestamp'),
      $time.attr('data-timestamp'),
      $time.attr('datetime'),
      $time.attr('title'),
      $time.attr('data-timeago'),
      $time.attr('data-time')
    ];
    let rawTs = null;
    candidates.some(item => {
      const parsed = parseTimeCandidate(item);
      if (parsed) { rawTs = parsed; return true; }
      return false;
    });
    const visibleText = $.trim($time.text());
    const absolute = formatAbsoluteTime(rawTs);
    return {
      absolute: absolute || visibleText || '刚刚',
      relative: rawTs ? timeAgoText(rawTs) : (visibleText || '刚刚'),
      timestamp: rawTs
    };
  }

  function getFloorNumber($post) {
    const candidates = [
      $post.attr('data-index'),
      $post.attr('data-number'),
      $post.attr('data-post-index'),
      $post.find('[data-index]').first().attr('data-index')
    ];
    for (const item of candidates) {
      if (item === undefined || item === null || item === '') continue;
      const n = parseInt(item, 10);
      if (!Number.isNaN(n)) return n >= 0 ? n + 1 : Math.abs(n);
    }
    const $posts = $('[component="post"]').not('.deleted,.x-post-hidden');
    const idx = $posts.index($post);
    return idx >= 0 ? idx + 1 : 1;
  }

  function getUserSlug($post) {
    return String($post.attr('data-userslug') || $post.find('[data-userslug]').first().attr('data-userslug') || '').trim();
  }

  function getUsername($post) {
    return $.trim($post.find('[data-username]').first().text()) || getUserSlug($post) || '用户';
  }

  function getUserTopicsUrl($post) {
    const slug = getUserSlug($post);
    return slug ? rel(`/user/${encodeURIComponent(slug)}/topics`) : '';
  }

  function getTopicTitleText() {
    return $.trim($('[component="topic/title"]').first().text());
  }

  function getDefaultTargetLang() {
    return (navigator.language || 'en').split('-')[0] || 'en';
  }

  function normalizeLangCode(code, fallback) {
    const raw = $.trim(String(code || '')).toLowerCase().replace(/_/g, '-');
    if (!raw) return fallback || 'auto';
    const short = raw.split('-')[0];
    if (LANGUAGE_META[raw]) return raw;
    if (LANGUAGE_META[short]) return short;
    return fallback || raw;
  }

  function isSupportedTargetLang(code) {
    return TARGET_LANGUAGE_OPTIONS.indexOf(normalizeLangCode(code, 'en')) !== -1;
  }

  function getLangMeta(code) {
    const normalized = normalizeLangCode(code, 'auto');
    return LANGUAGE_META[normalized] || LANGUAGE_META[normalized.split('-')[0]] || { flag: '🏳️', label: normalized || '未知语言' };
  }

  function loadTranslateSettings() {
    const saved = safeJsonGet(TRANSLATE_SETTINGS_KEY, {}) || {};
    const targetLang = normalizeLangCode(saved.targetLang, getDefaultTargetLang());
    return {
      sourceLang: normalizeLangCode(saved.sourceLang, 'auto') || 'auto',
      targetLang: isSupportedTargetLang(targetLang) ? targetLang : 'en',
      provider: saved.provider === 'ai' ? 'ai' : 'google',
      aiEndpoint: saved.aiEndpoint || '',
      aiModel: saved.aiModel || '',
      aiApiKey: saved.aiApiKey || '',
      aiPrompt: saved.aiPrompt || DEFAULT_PROMPT,
      temperature: Number.isFinite(Number(saved.temperature)) ? Number(saved.temperature) : 0.3
    };
  }

  function saveTranslateSettings(settings) {
    safeJsonSet(TRANSLATE_SETTINGS_KEY, settings);
  }

  state.translateSettings = state.translateSettings || loadTranslateSettings();

  function setTranslateButtonState($btn, mode) {
    if (!$btn || !$btn.length) return;
    const map = { idle: '翻译', loading: '翻译中', translated: '查看原文' };
    $btn.attr('title', map[mode] || map.idle)
      .attr('aria-label', map[mode] || map.idle)
      .toggleClass('is-translated', mode === 'translated')
      .toggleClass('is-loading', mode === 'loading');
  }

  function clearTranslationCaches() {
    state.titleTranslated = false;
    state.titleTranslatedText = '';
    const $title = $('[component="topic/title"]').first();
    const original = $title.data('x-original-title') || state.titleOriginal || getTopicTitleText();
    state.titleOriginal = original;
    if ($title.length && original) $title.text(original);
    setTranslateButtonState($('.x-title-translate').first(), 'idle');
    $('[component="post"]').each(function () {
      const $post = $(this);
      $post.find('.x-translate-box').removeClass('show').empty().removeData('translated');
      setTranslateButtonState($post.find('.x-post-translate').first(), 'idle');
    });
  }

  function normalizeAiEndpoint(url) {
    const clean = $.trim(String(url || ''));
    if (!clean) return '';
    if (/\/(chat\/completions|responses)$/i.test(clean)) return clean;
    return `${clean.replace(/\/+$/, '')}/chat/completions`;
  }

  function buildAiPrompt(settings) {
    return String(settings.aiPrompt || DEFAULT_PROMPT)
      .replace(/{{\s*sourceLang\s*}}/gi, settings.sourceLang || 'auto')
      .replace(/{{\s*targetLang\s*}}/gi, settings.targetLang || getDefaultTargetLang());
  }

  function extractAiText(data) {
    if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      if (typeof content === 'string') return $.trim(content);
      if (Array.isArray(content)) return $.trim(content.map(item => item && (item.text || item.output_text || '')).join(''));
    }
    if (data && typeof data.output_text === 'string') return $.trim(data.output_text);
    if (data && Array.isArray(data.output)) {
      return $.trim(data.output.map(item => {
        if (item && Array.isArray(item.content)) return item.content.map(part => part && (part.text || part.output_text || '')).join('');
        return '';
      }).join(''));
    }
    return '';
  }

  async function translateViaGoogle(text, targetLang, sourceLang) {
    const sl = sourceLang && sourceLang !== 'auto' ? sourceLang : 'auto';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('google translate failed');
    const data = await res.json();
    const parts = Array.isArray(data && data[0]) ? data[0] : [];
    return parts.map(item => item && item[0] ? item[0] : '').join('');
  }

  async function translateViaAI(text) {
    const settings = state.translateSettings || loadTranslateSettings();
    if (!settings.aiEndpoint || !settings.aiModel || !settings.aiApiKey) throw new Error('ai translate not configured');
    const endpoint = normalizeAiEndpoint(settings.aiEndpoint);
    const payload = {
      model: settings.aiModel,
      temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.3,
      messages: [
        { role: 'system', content: buildAiPrompt(settings) },
        { role: 'user', content: text }
      ]
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail || `translate api failed: ${res.status}`);
    }
    const data = await res.json();
    const textOut = extractAiText(data);
    if (!textOut) throw new Error('empty ai translation');
    return textOut;
  }

  function translateCacheKey(text) {
    const settings = state.translateSettings || loadTranslateSettings();
    const provider = settings.provider === 'ai' ? `ai:${settings.aiModel || 'model'}` : 'google';
    return `x-topic-v14-translate:${provider}:${settings.sourceLang}:${settings.targetLang}:${encodeURIComponent($.trim(text)).slice(0, 220)}`;
  }

  async function translateText(text) {
    const clean = $.trim(String(text || ''));
    if (!clean) return '';
    const key = translateCacheKey(clean);
    const cached = safeJsonGet(key);
    if (cached && cached.expiresAt > Date.now() && typeof cached.text === 'string') return cached.text;
    const settings = state.translateSettings || loadTranslateSettings();
    const out = settings.provider === 'ai'
      ? await translateViaAI(clean)
      : await translateViaGoogle(clean, settings.targetLang || getDefaultTargetLang(), settings.sourceLang || 'auto');
    const translated = $.trim(out || '');
    if (translated) safeJsonSet(key, { text: translated, expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000 });
    return translated;
  }

  function updateTranslateLangVisuals() {
    const sourceLang = normalizeLangCode($('#x-setting-source-lang').val(), 'auto');
    const targetLang = normalizeLangCode($('#x-setting-target-lang').val(), 'en');
    const sourceMeta = getLangMeta(sourceLang);
    const targetMeta = getLangMeta(targetLang);
    $('#x-lang-source-preview').html(`<span class="x-flag">${sourceMeta.flag}</span><span>${escapeHtml(sourceMeta.label)}</span>`);
    $('#x-lang-target-preview').html(`<span class="x-flag">${targetMeta.flag}</span><span>${escapeHtml(targetMeta.label)}</span>`);
  }

  function setTranslateProviderUI(provider) {
    const active = provider === 'ai' ? 'ai' : 'google';
    $('#x-translate-provider').val(active);
    $('.x-provider-tab').removeClass('active');
    $(`.x-provider-tab[data-provider="${active}"]`).addClass('active');
    $('#x-ai-settings').toggleClass('show', active === 'ai');
  }

  function renderLanguagePicker(role) {
    const current = role === 'source' ? normalizeLangCode($('#x-setting-source-lang').val(), 'auto') : normalizeLangCode($('#x-setting-target-lang').val(), 'en');
    const list = role === 'source' ? SOURCE_LANGUAGE_OPTIONS : TARGET_LANGUAGE_OPTIONS;
    $('#x-lang-picker-title').text(role === 'source' ? '选择原文语言' : '选择目标语言');
    $('#x-lang-picker-list').html(list.map(code => {
      const meta = getLangMeta(code);
      const active = current === code ? ' active' : '';
      return `<button type="button" class="x-lang-option${active}" data-code="${escapeHtml(code)}"><span class="x-flag">${meta.flag}</span><span class="x-label">${escapeHtml(meta.label)}</span></button>`;
    }).join(''));
  }

  function openLanguagePicker(role) {
    state.langPickerRole = role;
    renderLanguagePicker(role);
    $('#x-lang-picker-mask, #x-lang-picker').addClass('show');
  }

  function closeLanguagePicker() {
    $('#x-lang-picker-mask, #x-lang-picker').removeClass('show');
    state.langPickerRole = '';
  }

  function openTranslateSettingsModal() {
    const settings = state.translateSettings || loadTranslateSettings();
    $('#x-setting-source-lang').val(settings.sourceLang || 'auto');
    $('#x-setting-target-lang').val(settings.targetLang || getDefaultTargetLang());
    $('#x-setting-ai-endpoint').val(settings.aiEndpoint || '');
    $('#x-setting-ai-model').val(settings.aiModel || '');
    $('#x-setting-ai-key').val(settings.aiApiKey || '');
    $('#x-setting-ai-prompt').val(settings.aiPrompt || DEFAULT_PROMPT);
    setTranslateProviderUI(settings.provider || 'google');
    updateTranslateLangVisuals();
    $('#x-translate-settings-mask, #x-translate-settings-modal').addClass('show');
  }

  function closeTranslateSettingsModal() {
    $('#x-translate-settings-mask, #x-translate-settings-modal').removeClass('show');
  }

  function saveTranslateSettingsFromModal() {
    const next = {
      sourceLang: normalizeLangCode($('#x-setting-source-lang').val(), 'auto'),
      targetLang: normalizeLangCode($('#x-setting-target-lang').val(), getDefaultTargetLang()),
      provider: $.trim($('#x-translate-provider').val()) === 'ai' ? 'ai' : 'google',
      aiEndpoint: $.trim($('#x-setting-ai-endpoint').val()),
      aiModel: $.trim($('#x-setting-ai-model').val()),
      aiApiKey: $.trim($('#x-setting-ai-key').val()),
      aiPrompt: $.trim($('#x-setting-ai-prompt').val()) || DEFAULT_PROMPT,
      temperature: 0.3
    };
    state.translateSettings = next;
    saveTranslateSettings(next);
    clearTranslationCaches();
    closeTranslateSettingsModal();
    showSuccess('翻译设置已保存到本地');
  }

  function ensureTitleTranslateButton() {
    const $title = $('[component="topic/title"]').first();
    if (!$title.length || $title.closest('.x-title-translate-wrap').length) return;
    state.titleOriginal = state.titleOriginal || getTopicTitleText();
    $title.data('x-original-title', state.titleOriginal);
    $title.wrap('<span class="x-title-translate-wrap"></span>');
    $title.after('<button type="button" class="x-title-translate" aria-label="翻译" title="翻译"><i class="fa-solid fa-language"></i></button>');
    setTranslateButtonState($('.x-title-translate').first(), 'idle');
  }

  async function toggleTitleTranslate() {
    const $title = $('[component="topic/title"]').first();
    const $btn = $('.x-title-translate').first();
    if (!$title.length) return;
    if (state.titleTranslated) {
      $title.text(state.titleOriginal || $title.data('x-original-title') || getTopicTitleText());
      state.titleTranslated = false;
      setTranslateButtonState($btn, 'idle');
      return;
    }
    try {
      setTranslateButtonState($btn, 'loading');
      state.titleOriginal = state.titleOriginal || $title.data('x-original-title') || getTopicTitleText();
      if (!state.titleTranslatedText) state.titleTranslatedText = await translateText(state.titleOriginal);
      $title.text(state.titleTranslatedText || state.titleOriginal);
      state.titleTranslated = true;
      setTranslateButtonState($btn, 'translated');
    } catch (err) {
      console.warn(err);
      showError('标题翻译失败');
      setTranslateButtonState($btn, 'idle');
    }
  }

  function makeAiSettingsButton() {
    return $('<button type="button" class="x-ai-settings-btn" aria-label="AI翻译设置" title="AI翻译设置"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>AI翻译</span></button>');
  }

  function injectTopicToolbar() {
    const $existing = $('.x-ai-settings-btn').first().detach();
    $('.x-topic-toolbar').remove();
    const $btn = $existing.length ? $existing : makeAiSettingsButton();

    const hostSelectors = [
      '.topic-main-buttons .btn-group',
      'nav.topic-main-buttons .btn-group',
      '.topic-main-buttons',
      'nav.topic-main-buttons',
      '.sticky-tools .thread-tools',
      '.topic-sidebar-tools .thread-tools',
      '[component="topic/tools"]',
      '.thread-tools'
    ];

    let $host = $();
    for (const selector of hostSelectors) {
      const $candidate = $(selector).filter(function () {
        return !$(this).closest('#x-topic-bottom,#x-translate-settings-modal,#x-lang-picker').length;
      }).first();
      if ($candidate.length) { $host = $candidate; break; }
    }

    if ($host.length) {
      const $gearIcon = $host.find('.fa-gear,.fa-cog,.fa-cogs').last();
      const $gearButton = $gearIcon.length ? $gearIcon.closest('a,button,.btn,.dropdown,.btn-group') : $();
      if ($gearButton.length && $gearButton.parent().length) $gearButton.after($btn);
      else $host.append($btn);
      return;
    }

    const $anchor = $('.topic .topic-main-buttons, .topic-info, [component="topic/header"]').first();
    if ($anchor.length) $anchor.after($('<div class="x-ai-settings-inline-host"></div>').append($btn));
  }

  function getSignatureText($post) {
    return $.trim($post.find('[component="post/signature"]').first().text()).replace(/\s+/g, ' ');
  }

  function isAudioHref(href) {
    return /\.(m4a|mp3|wav|ogg|oga|webm|aac)(?:[?#].*)?$/i.test(String(href || ''));
  }

  function isVideoHref(href) {
    return /\.(mp4|mov|webm|mkv)(?:[?#].*)?$/i.test(String(href || ''));
  }

  function isImageHref(href) {
    return /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(String(href || ''));
  }

  function cleanPostTextForTranslate($content) {
    if (!$content || !$content.length) return '';
    const $clone = $content.clone();
    $clone.find('.x-translate-box, .x-post-translate, .x-voice-card, audio, video, img, script, style').remove();
    $clone.find('a[href]').filter(function () {
      const href = $(this).attr('href') || '';
      return isAudioHref(href) || isVideoHref(href) || isImageHref(href);
    }).remove();
    return $.trim($clone.text()).replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^(语音消息|image|图片)$/i, '')
      .trim();
  }

  function isMediaOnlyPost($content) {
    if (!$content || !$content.length) return false;
    const text = cleanPostTextForTranslate($content);
    const mediaCount = $content.find('img,video,audio,.x-voice-card').length + $content.find('a[href]').filter(function () {
      const href = $(this).attr('href') || '';
      return isAudioHref(href) || isVideoHref(href) || isImageHref(href);
    }).length;
    return mediaCount > 0 && !text;
  }

  function getReplyExcerpt($post) {
    const $content = $post.find('[component="post/content"]').first().clone();
    $content.find('.x-translate-box, .x-post-translate').remove();
    let text = $.trim($content.text()).replace(/\s+/g, ' ').replace(/^语音消息$/g, '').trim();
    if (text) return text.slice(0, 72);
    if ($content.find('img').length) return '[图片]';
    if ($content.find('video').length) return '[视频]';
    if ($content.find('a[href]').filter(function () { return isAudioHref($(this).attr('href')); }).length) return '[语音消息]';
    return '回复这条帖子';
  }

  function buildQuotePrefix(data) {
    if (!data || !data.pid) return '';
    const link = rel(`/post/${data.pid}`);
    const excerpt = String(data.excerpt || '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || '引用内容';
    return `> @${data.username} [说](${link}):\n> ${excerpt}\n\n`;
  }

  function decorateMeta($post) {
    if ($post.find('.x-meta-row').length) return;
    const $container = $post.find('.post-container').first();
    const $content = $post.find('[component="post/content"]').first();
    if (!$container.length || !$content.length) return;

    const username = getUsername($post);
    const profileUrl = getUserTopicsUrl($post);
    const signature = getSignatureText($post);
    const timeMeta = getPostTimeMeta($post);
    const floor = getFloorNumber($post);
    const subClass = signature ? '' : ' is-empty';
    const userMain = profileUrl
      ? `<a class="x-user-main x-profile-link" href="${escapeHtml(profileUrl)}" title="查看 ${escapeHtml(username)} 的主题">${escapeHtml(username)}</a>`
      : `<div class="x-user-main">${escapeHtml(username)}</div>`;

    const html = [
      '<div class="x-meta-row">',
      '  <div class="x-meta-left">',
      '    <div class="x-user-stack">',
      `      ${userMain}`,
      `      <div class="x-user-sub${subClass}">${escapeHtml(signature)}</div>`,
      '    </div>',
      '  </div>',
      '  <div class="x-meta-right">',
      `    <div class="x-post-time" title="${escapeHtml(timeMeta.absolute)}">${escapeHtml(timeMeta.relative)}</div>`,
      `    <div class="x-post-floor">${escapeHtml(String(floor))}楼</div>`,
      '  </div>',
      '</div>'
    ].join('');

    $container.prepend($(html));
  }

  function decorateAvatar($post) {
    const $avatarWrap = $post.find('.post-container-parent > .bg-body').first();
    if (!$avatarWrap.length) return;
    $avatarWrap.addClass('x-avatar-wrap');

    const profileUrl = getUserTopicsUrl($post);
    if (profileUrl && !$avatarWrap.find('.x-avatar-link').length) {
      const $avatar = $avatarWrap.find('.avatar,img.avatar').first();
      if ($avatar.length) {
        const $link = $(`<a class="x-avatar-link x-profile-link" href="${escapeHtml(profileUrl)}" title="查看用户主题"></a>`);
        $avatar.before($link);
        $link.append($avatar);
      }
    }

    const $statusEl = $post.find('[component="user/status"]').first();
    let statusClass = 'offline';
    if ($statusEl.hasClass('online')) statusClass = 'online';
    else if ($statusEl.hasClass('dnd')) statusClass = 'dnd';
    else if ($statusEl.hasClass('away')) statusClass = 'away';
    if (!$avatarWrap.find('.x-status-dot').length) $avatarWrap.append(`<span class="x-status-dot ${statusClass}"></span>`);

    const userSlug = getUserSlug($post);
    if (!userSlug || $avatarWrap.find('.x-flag').length) return;
    $.get(rel(`/api/user/${encodeURIComponent(userSlug)}`)).done(data => {
      const profile = data && (data.user || data) ? (data.user || data) : {};
      const loc = profile.language_flag || profile.location || profile.country || profile.nationality || '';
      const flag = COUNTRY_MAP[normalizeLoc(loc)] || COUNTRY_MAP[String(loc || '').trim()];
      if (flag && !$avatarWrap.find('.x-flag').length) $avatarWrap.append(`<span class="x-flag">${flag}</span>`);
    }).fail(() => {});
  }

  function detectUpvoteState($votesWrap, $upvoteBtn) {
    const raw = $upvoteBtn[0];
    return !!($upvoteBtn.hasClass('upvoted') || $upvoteBtn.attr('aria-pressed') === 'true' ||
      $upvoteBtn.attr('data-upvoted') === 'true' || $upvoteBtn.data('upvoted') === true ||
      $upvoteBtn.hasClass('text-danger') || ($votesWrap.attr('data-upvoted') === 'true') ||
      (raw && raw.dataset && raw.dataset.upvoted === 'true'));
  }

  function syncLikeState($post) {
    const $votesWrap = $post.find('.votes').first();
    const $upvoteBtn = $votesWrap.find('[component="post/upvote"]').first();
    const $voteCount = $votesWrap.find('[component="post/vote-count"]').first();
    if (!$votesWrap.length || !$upvoteBtn.length || !$voteCount.length) return;
    const isUpvoted = detectUpvoteState($votesWrap, $upvoteBtn);
    const rawVotes = parseInt($voteCount.attr('data-votes') || $.trim($voteCount.text()) || '0', 10);
    const votes = Number.isNaN(rawVotes) ? 0 : rawVotes;
    const snapshot = `${isUpvoted ? 1 : 0}:${votes}`;
    if ($post.data('x-like-snapshot') === snapshot) return;
    $post.data('x-like-snapshot', snapshot);

    $votesWrap.addClass('x-like-pill').toggleClass('upvoted', !!isUpvoted);
    $upvoteBtn.addClass('x-like-trigger').removeClass('btn btn-ghost btn-sm');
    $voteCount.addClass('x-vote-count').removeClass('btn btn-ghost btn-sm px-2 mx-1')
      .attr({ href: 'javascript:void(0)', tabindex: '-1', 'aria-disabled': 'true' });
    const nextIcon = isUpvoted ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    if ($.trim($upvoteBtn.html()) !== nextIcon) $upvoteBtn.html(nextIcon);
    if ($.trim($voteCount.text()) !== String(votes)) $voteCount.text(String(votes));
  }

  function bindLikeRefresh($post) {
    const $upvoteBtn = $post.find('[component="post/upvote"]').first();
    if (!$upvoteBtn.length || $upvoteBtn.data('x-like-bound')) return;
    $upvoteBtn.data('x-like-bound', true);
    const refreshLater = () => [0, 80, 180, 360, 720].forEach(delay => window.setTimeout(() => syncLikeState($post), delay));
    $upvoteBtn.on('click.xLikeRefresh', refreshLater);
  }

  function bindMoreButton($post) {
    const $moreAnchor = $post.find('[component="post/tools"] > a').first();
    if (!$moreAnchor.length) return;
    $moreAnchor.removeClass('btn btn-sm btn-ghost').addClass('x-btn x-more-btn');
    $moreAnchor.html('<i class="fa-solid fa-ellipsis"></i>');
  }

  function setReplyTarget(data) {
    state.replyTo = data || null;
    const $target = $('#x-reply-target');
    if (!state.replyTo) {
      $target.removeClass('show');
      $('#x-target-title').text('');
      $('#x-target-text').text('');
      return;
    }
    $('#x-target-title').text(`引用 @${state.replyTo.username}`);
    $('#x-target-text').text(state.replyTo.excerpt || '引用这条帖子');
    $target.addClass('show');
  }

  function bindQuoteButton($post) {
    if ($post.data('x-quote-bound')) return;
    $post.data('x-quote-bound', true);
    const $quoteOriginal = $post.find('[component="post/quote"]').first();
    if (!$quoteOriginal.length) return;
    const username = getUsername($post);
    const pid = parseInt($post.attr('data-pid') || '0', 10);
    const excerpt = getReplyExcerpt($post);
    const $custom = $('<button type="button" class="x-btn x-quote-btn"><i class="fa-solid fa-reply"></i><span class="x-label">引用</span></button>');
    $quoteOriginal.replaceWith($custom);
    $custom.on('click.xQuote', function (e) {
      e.preventDefault();
      setReplyTarget({ pid, username, excerpt });
      openReplyPanel();
    });
  }

  function shouldIgnoreTextNodeParent(node) {
    const el = node && node.parentElement;
    if (!el) return true;
    return !!$(el).closest('img,video,audio,script,style,.x-voice-card,.x-translate-box,.x-post-translate,.emoji,.avatar').length ||
      !!$(el).closest('a[href]').filter(function () {
        const href = $(this).attr('href') || '';
        return isAudioHref(href) || isVideoHref(href) || isImageHref(href);
      }).length;
  }

  function insertTranslateButtonAfterText($content, $btn) {
    const root = $content[0];
    if (!root || !document.createTreeWalker) {
      $content.prepend($btn);
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || shouldIgnoreTextNodeParent(node)) return NodeFilter.FILTER_REJECT;
        const value = $.trim(String(node.nodeValue || '').replace(/\s+/g, ' '));
        if (!value || /^(语音消息|image|图片)$/i.test(value)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const candidates = [];
    while (walker.nextNode()) candidates.push(walker.currentNode);
    const target = candidates[candidates.length - 1];
    if (target && target.parentNode) {
      const spacer = document.createTextNode(' ');
      target.parentNode.insertBefore(spacer, target.nextSibling);
      target.parentNode.insertBefore($btn[0], spacer.nextSibling);
    } else {
      $content.prepend($btn);
    }
  }

  function ensureInlineTranslate($post) {
    const $content = $post.find('[component="post/content"]').first();
    if (!$content.length) return;

    $content.find('.x-post-translate').remove();
    const text = cleanPostTextForTranslate($content);
    if (!text || text.length < 2 || isMediaOnlyPost($content)) {
      $content.find('.x-translate-box').remove();
      return;
    }

    const $btn = $('<button type="button" class="x-post-translate" aria-label="翻译" title="翻译"><i class="fa-solid fa-language" aria-hidden="true"></i></button>');
    insertTranslateButtonAfterText($content, $btn);

    if (!$content.find('.x-translate-box').length) $content.append('<div class="x-translate-box"></div>');
    setTranslateButtonState($btn, 'idle');
  }

  function bindPostTranslate($post) {
    ensureInlineTranslate($post);
    const $btn = $post.find('.x-post-translate').first();
    const $content = $post.find('[component="post/content"]').first();
    const $box = $post.find('.x-translate-box').first();
    if (!$btn.length || !$content.length || !$box.length || $btn.data('x-translate-bound')) return;
    $btn.data('x-translate-bound', true);
    $btn.on('click.xPostTranslate', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const translated = $box.data('translated');
      if ($box.hasClass('show')) {
        $box.removeClass('show');
        setTranslateButtonState($btn, 'idle');
        return;
      }
      try {
        setTranslateButtonState($btn, 'loading');
        if (!translated) {
          const original = cleanPostTextForTranslate($content);
          const text = await translateText(original);
          $box.text(text || '');
          $box.data('translated', text || '');
        }
        $box.addClass('show');
        setTranslateButtonState($btn, 'translated');
      } catch (err) {
        console.warn(err);
        showError('帖子翻译失败');
        setTranslateButtonState($btn, 'idle');
      }
    });
  }

  function parseDurationFromUrl(url) {
    try {
      const parsed = new URL(String(url || ''), location.origin);
      const raw = parsed.searchParams.get('haa8dur') || parsed.searchParams.get('dur') || parsed.searchParams.get('duration');
      const value = Number(raw || 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
      const match = String(url || '').match(/[?&](?:haa8dur|dur|duration)=(\d+(?:\.\d+)?)/i);
      return match ? Number(match[1]) || 0 : 0;
    }
  }

  function parseDurationFromText(text) {
    const raw = String(text || '');
    const match = raw.match(/(?:^|\D)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\D|$)/);
    if (!match) return 0;
    const a = Number(match[1]) || 0;
    const b = Number(match[2]) || 0;
    const c = Number(match[3]) || 0;
    return match[3] ? (a * 3600 + b * 60 + c) : (a * 60 + b);
  }

  function formatDuration(sec) {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function getWaveBarsHtml() {
    return WAVE_HEIGHTS.map(height => `<i style="height:${height}px"></i>`).join('');
  }

  function getAudioDuration(audio) {
    if (!audio) return 0;
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    if (audio.seekable && audio.seekable.length) {
      try { const end = audio.seekable.end(audio.seekable.length - 1); if (Number.isFinite(end) && end > 0) return end; } catch (_) {}
    }
    if (audio.buffered && audio.buffered.length) {
      try { const end = audio.buffered.end(audio.buffered.length - 1); if (Number.isFinite(end) && end > 0) return end; } catch (_) {}
    }
    return 0;
  }

  function resetVoiceCardUi($card, audio) {
    const initialDuration = Number($card.data('x-initial-duration') || 0);
    const duration = getAudioDuration(audio) || initialDuration;
    $card.removeClass('playing');
    $card.find('.x-voice-play i').removeClass('fa-pause').addClass('fa-play');
    $card.find('.x-voice-wave i').removeClass('active');
    $card.find('.x-voice-time').text(formatDuration(duration));
  }

  function updateVoiceCardUi($card, audio) {
    const bars = $card.find('.x-voice-wave i');
    const initialDuration = Number($card.data('x-initial-duration') || 0);
    const duration = getAudioDuration(audio) || initialDuration;
    const ratio = duration ? Math.min(1, audio.currentTime / duration) : 0;
    const activeCount = Math.max(audio.currentTime > 0 ? 1 : 0, Math.ceil(ratio * bars.length));
    bars.removeClass('active');
    if (activeCount > 0) bars.slice(0, activeCount).addClass('active');
    const timeText = !audio.paused && !audio.ended ? formatDuration(audio.currentTime) : formatDuration(duration || 0);
    $card.find('.x-voice-time').text(timeText);
  }

  function stopOtherAudio(currentAudio, $card) {
    if (state.currentAudio && state.currentAudio !== currentAudio) {
      try { state.currentAudio.pause(); } catch (_) {}
    }
    state.currentAudio = currentAudio;
    state.currentAudioCard = $card ? $card[0] : null;
  }

  function createVoicePlayer(src, extraClass, initialSeconds = 0) {
    const initialDuration = Math.max(0, Math.round(Number(initialSeconds) || parseDurationFromUrl(src) || 0));
    const $card = $(`<button type="button" class="x-voice-card ${extraClass || ''}"><span class="x-voice-play"><i class="fa-solid fa-play"></i></span><span class="x-voice-body"><span class="x-voice-wave">${getWaveBarsHtml()}</span><span class="x-voice-time">${formatDuration(initialDuration)}</span></span></button>`);
    $card.data('x-initial-duration', initialDuration);
    const audio = new Audio(src);
    audio.preload = 'metadata';
    let durationTimer = null;
    const syncDuration = function () {
      const duration = getAudioDuration(audio) || initialDuration;
      if (duration > 0) {
        $card.find('.x-voice-time').text(formatDuration(duration));
        if (durationTimer) { window.clearInterval(durationTimer); durationTimer = null; }
      }
      updateVoiceCardUi($card, audio);
    };
    ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'canplaythrough'].forEach(eventName => audio.addEventListener(eventName, syncDuration));
    audio.addEventListener('timeupdate', () => updateVoiceCardUi($card, audio));
    audio.addEventListener('play', () => {
      stopOtherAudio(audio, $card);
      $card.addClass('playing');
      $card.find('.x-voice-play i').removeClass('fa-play').addClass('fa-pause');
      updateVoiceCardUi($card, audio);
    });
    audio.addEventListener('pause', () => {
      if (!audio.ended) {
        $card.removeClass('playing');
        $card.find('.x-voice-play i').removeClass('fa-pause').addClass('fa-play');
        updateVoiceCardUi($card, audio);
      }
    });
    audio.addEventListener('ended', () => { audio.currentTime = 0; resetVoiceCardUi($card, audio); });
    audio.addEventListener('error', () => { $card.find('.x-voice-time').text('--:--'); });
    durationTimer = window.setInterval(syncDuration, 600);
    window.setTimeout(syncDuration, 50);
    window.setTimeout(syncDuration, 800);
    window.setTimeout(syncDuration, 1800);
    $card.on('click.xVoice', async function () {
      if (audio.paused) {
        try { stopOtherAudio(audio, $card); await audio.play(); syncDuration(); } catch (err) { console.warn(err); }
      } else audio.pause();
    });
    $card.data('x-audio', audio);
    return { $card, audio };
  }

  function mountPreviewVoicePlayer(src) {
    const $inner = $('#x-audio-preview .x-audio-preview-inner');
    $inner.empty();
    if (!src) return;
    const player = createVoicePlayer(src, 'x-voice-preview-card', state.pendingVoiceSeconds || parseDurationFromUrl(src));
    $inner.append(player.$card);
  }

  function bindAudioCards($post) {
    $post.find('[component="post/content"] a[href]').each(function () {
      const $link = $(this);
      if ($link.data('x-audio-bound')) return;
      const href = $link.attr('href') || '';
      if (!isAudioHref(href)) return;
      $link.data('x-audio-bound', true);
      const labelDuration = parseDurationFromText($link.text()) || parseDurationFromText($link.closest('p').text());
      const player = createVoicePlayer(href, '', parseDurationFromUrl(href) || labelDuration);
      const $p = $link.closest('p');
      if ($p.length && /^语音消息(?:[·:：\s-]*\d{1,2}:\d{2}(?::\d{2})?)?$/i.test($.trim($p.text()).replace(/\s+/g, ''))) $p.empty().append(player.$card);
      else $link.replaceWith(player.$card);
    });
  }

  function bindMediaLightbox($scope) {
    $scope.find('[component="post/content"] img').each(function () {
      const $img = $(this);
      if ($img.data('x-lightbox-bound')) return;
      $img.data('x-lightbox-bound', true);
      $img.css('cursor', 'zoom-in');
      $img.on('click.xLightbox', function (e) {
        e.preventDefault();
        $('#x-media-lightbox img').attr('src', $img.attr('src'));
        $('#x-media-lightbox').addClass('show');
      });
    });
  }

  function bindInlineVideos($post) {
    $post.find('[component="post/content"] a[href]').each(function () {
      const $link = $(this);
      if ($link.data('x-video-bound')) return;
      const href = $link.attr('href') || '';
      if (!isVideoHref(href)) return;
      $link.data('x-video-bound', true);
      const $video = $(`<video controls preload="metadata" playsinline src="${escapeHtml(href)}"></video>`);
      $link.replaceWith($video);
    });
  }

  function removeEmptyMediaAnchorWithBreaks(anchor) {
    if (!anchor || !anchor.parentNode) return;
    const parent = anchor.parentNode;

    function removeWhitespaceBefore(ref) {
      let prev = ref.previousSibling;
      while (prev && prev.nodeType === 3 && !String(prev.nodeValue || '').trim()) {
        const rm = prev;
        prev = rm.previousSibling;
        rm.parentNode && rm.parentNode.removeChild(rm);
      }
      if (prev && prev.nodeType === 1 && String(prev.tagName || '').toLowerCase() === 'br') {
        const br = prev;
        prev = br.previousSibling;
        br.parentNode && br.parentNode.removeChild(br);
      }
      while (prev && prev.nodeType === 3 && !String(prev.nodeValue || '').trim()) {
        const rm = prev;
        prev = rm.previousSibling;
        rm.parentNode && rm.parentNode.removeChild(rm);
      }
    }

    function removeWhitespaceAfter(ref) {
      let next = ref.nextSibling;
      while (next && next.nodeType === 3 && !String(next.nodeValue || '').trim()) {
        const rm = next;
        next = rm.nextSibling;
        rm.parentNode && rm.parentNode.removeChild(rm);
      }
    }

    removeWhitespaceBefore(anchor);
    removeWhitespaceAfter(anchor);
    parent.removeChild(anchor);
  }

  function trimParagraphTrailingBreaks($content) {
    $content.find('p').each(function () {
      let changed = true;
      while (changed && this.lastChild) {
        changed = false;
        const last = this.lastChild;
        if (last.nodeType === 3 && !String(last.nodeValue || '').trim()) {
          this.removeChild(last);
          changed = true;
        } else if (last.nodeType === 1 && String(last.tagName || '').toLowerCase() === 'br') {
          this.removeChild(last);
          changed = true;
        } else if (last.nodeType === 1 && $(last).is('a') && !$.trim($(last).text()) && !$(last).find('img:not(.haa9-native-media-hidden), video, audio, .x-voice-card').length) {
          this.removeChild(last);
          changed = true;
        }
      }
    });
  }

  function compactHiddenNativeMedia($post) {
    const $content = $post.find('[component="post/content"]').first();
    if (!$content.length) return;

    $content.find('a').filter(function () {
      const $a = $(this);
      const href = $a.attr('href') || '';
      const isHiddenMedia = $a.hasClass('haa9-native-media-hidden') || $a.find('.haa9-native-media-hidden').length;
      const isMediaHref = isAudioHref(href) || isVideoHref(href) || isImageHref(href) || /tiktok\.com/i.test(href);
      return isHiddenMedia && isMediaHref && !$.trim($a.text());
    }).each(function () { removeEmptyMediaAnchorWithBreaks(this); });

    $content.find('.haa9-native-media-hidden').filter(function () {
      return !$(this).closest('a').length;
    }).each(function () { removeEmptyMediaAnchorWithBreaks(this); });

    trimParagraphTrailingBreaks($content);

    $content.find('p').filter(function () {
      const $p = $(this).clone();
      $p.find('.x-post-translate,.x-translate-box,script,style').remove();
      return !$.trim($p.text()) && !$p.find('img:not(.haa9-native-media-hidden),video,audio,.x-voice-card').length;
    }).remove();
  }

  function compactDetailMediaBlocks($post) {
    if (!$post || !$post.length) return;
    compactHiddenNativeMedia($post);

    const $container = $post.find('.post-container').first();
    if ($container.length) {
      $container.css({ gap: '0px', rowGap: '0px', columnGap: '0px' });
      $container.removeClass('gap-1 gap-2 gap-3 gap-4 gap-5');
    }

    $post.toggleClass('x-has-detail-media', !!$post.find('.haa9-detail-content').length);
    $post.find('.haa9-detail-content').each(function () {
      const $block = $(this);
      if (!$block.prev('[component="post/content"]').length) return;
      $block.addClass('x-compact-detail-media');
    });
  }

  function compactAllDetailMedia() {
    $('[component="post"]').each(function () { compactDetailMediaBlocks($(this)); });
  }

  function decoratePost($post) {
    if (!$post.length) return;
    if ($post.hasClass('deleted') || $post.attr('data-deleted') === '1') {
      $post.addClass('x-post-hidden').hide();
      return;
    }
    decorateMeta($post);
    decorateAvatar($post);
    bindAudioCards($post);
    bindInlineVideos($post);
    bindMediaLightbox($post);
    bindPostTranslate($post);
    compactDetailMediaBlocks($post);
    syncLikeState($post);
    bindLikeRefresh($post);
    bindMoreButton($post);
    bindQuoteButton($post);
  }

  function dedupePostsByPid() {
    const seen = new Set();
    $('[component="post"][data-pid]').each(function () {
      const pid = String($(this).attr('data-pid') || '').trim();
      if (!pid) return;
      if (seen.has(pid)) {
        $(this).remove();
        return;
      }
      seen.add(pid);
    });
  }

  function decorateAllPosts() {
    dedupePostsByPid();
    $('[component="post"]').each(function () { decoratePost($(this)); });
    dedupePostsByPid();
  }

  function observePostsIncrementally() {
    const container = document.querySelector('[component="topic"]') || document.querySelector('.posts') || document.body;
    if (!container) return;
    if (state.postObserver) return;
    state.postObserver = new MutationObserver(function (mutations) {
      let touched = false;
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          const $node = $(node);
          if ($node.is('[component="post"]')) { decoratePost($node); touched = true; return; }
          if ($node.is('.haa9-detail-content,.haa9-native-media-hidden') || $node.find('.haa9-detail-content,.haa9-native-media-hidden').length) {
            const $post = $node.closest('[component="post"]');
            if ($post.length) { compactDetailMediaBlocks($post); touched = true; }
          }
          $node.find('[component="post"]').each(function () { decoratePost($(this)); touched = true; });
        });
      });
      if (touched) {
        dedupePostsByPid();
        updatePageProgress();
      }
    });
    state.postObserver.observe(container, { childList: true, subtree: true });
  }

  function autosizeTextarea() {
    const el = document.getElementById('x-reply-text');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(148, Math.min(el.scrollHeight, 320))}px`;
  }

  function setPendingFile(file, kind) {
    if (state.pendingFileUrl) { try { URL.revokeObjectURL(state.pendingFileUrl); } catch (_) {} }
    state.pendingFile = file || null;
    state.pendingFileKind = kind || '';
    state.pendingFileUrl = file ? URL.createObjectURL(file) : '';
    $('#x-image-preview, #x-video-preview').removeClass('show');
    if (!file) {
      $('#x-image-preview img').attr('src', '');
      $('#x-video-preview video').removeAttr('src').each(function () { try { this.load(); } catch (_) {} });
      return;
    }
    if (kind === 'image') {
      $('#x-image-preview img').attr('src', state.pendingFileUrl);
      $('#x-image-preview').addClass('show');
    } else if (kind === 'video') {
      $('#x-video-preview video').attr('src', state.pendingFileUrl);
      $('#x-video-preview').addClass('show');
    }
  }

  function setPendingVoice(blob, seconds = 0) {
    const previousUrl = state.pendingVoiceUrl;
    if (state.currentAudio && previousUrl && state.currentAudio.src === previousUrl) {
      try { state.currentAudio.pause(); } catch (_) {}
      state.currentAudio = null;
      state.currentAudioCard = null;
    }
    if (previousUrl) { try { URL.revokeObjectURL(previousUrl); } catch (_) {} }
    state.pendingVoiceBlob = blob || null;
    state.pendingVoiceSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    state.pendingVoiceUrl = blob ? URL.createObjectURL(blob) : '';
    const $card = $('#x-audio-preview');
    if (!blob) {
      if (state.currentAudio && previousUrl && state.currentAudio.src === previousUrl) { try { state.currentAudio.pause(); } catch (_) {} }
      $card.removeClass('show');
      mountPreviewVoicePlayer('');
      $('#x-voice-meta').text('');
      return;
    }
    $card.addClass('show');
    mountPreviewVoicePlayer(state.pendingVoiceUrl);
    const kb = blob.size ? Math.max(1, Math.round(blob.size / 1024)) : 0;
    $('#x-voice-meta').text(`录音已压缩为 16kbps，可试听后发送${kb ? `（约 ${kb}KB）` : ''}`);
  }

  function resetComposerState() {
    $('#x-reply-text').val('');
    autosizeTextarea();
    setReplyTarget(null);
    setPendingFile(null, '');
    setPendingVoice(null);
    $('#x-record-panel').removeClass('show');
    $('#x-voice-meta').text('');
  }

  function openReplyPanel() {
    $('#x-reply-backdrop, #x-reply-panel').addClass('show');
    autosizeTextarea();
    window.setTimeout(() => $('#x-reply-text').trigger('focus'), 30);
  }

  function closeReplyPanel() {
    $('#x-reply-backdrop, #x-reply-panel').removeClass('show');
    stopRecording(true);
  }

  function getVisiblePosts() {
    return $('[component="post"]').not('.deleted,.x-post-hidden').filter(function () { return $(this).is(':visible'); });
  }

  function getCurrentPostIndex() {
    const $posts = getVisiblePosts();
    if (!$posts.length) return 1;
    const offset = $(window).scrollTop() + 150;
    let current = 1;
    $posts.each(function (index) { if ($(this).offset().top <= offset) current = index + 1; });
    return current;
  }

  function clampPageIndex(index, total) {
    const safeTotal = Math.max(1, parseInt(total || '1', 10) || 1);
    return Math.max(1, Math.min(safeTotal, parseInt(index || '1', 10) || 1));
  }

  function setPagePickerValue(index, total) {
    const safeTotal = Math.max(1, total || getVisiblePosts().length || 1);
    const safe = clampPageIndex(index, safeTotal);
    state.pagePickerValue = safe;
    $('#x-page-number').attr({ min: 1, max: safeTotal }).val(safe);
    $('#x-page-picker-current').text(safe);
    $('#x-page-picker-total, #x-page-total-inline').text(safeTotal);
    const ratio = safeTotal <= 1 ? 0 : (safe - 1) / (safeTotal - 1);
    $('#x-page-slider-progress').css('height', `${ratio * 100}%`);
    const $wrap = $('#x-page-slider-wrap');
    const $handle = $('#x-page-slider-handle');
    if ($wrap.length && $handle.length) {
      const wrapHeight = $wrap.innerHeight() || 0;
      const handleHeight = $handle.outerHeight() || 62;
      const trackStart = PAGE_SLIDER_TRACK_PADDING;
      const trackEnd = Math.max(trackStart, wrapHeight - PAGE_SLIDER_TRACK_PADDING - handleHeight);
      const top = trackStart + (trackEnd - trackStart) * ratio;
      $handle.css('top', `${top}px`);
    }
  }

  function updatePageProgress() {
    const $posts = getVisiblePosts();
    if (!$posts.length) return;
    const total = $posts.length;
    const current = getCurrentPostIndex();
    const percent = total <= 1 ? 0 : (current / total) * 100;
    $('#x-page-pill').text(`${current} / ${total}`).css('--progress', `${percent}%`);
    if ($('#x-page-picker').hasClass('show') && !state.pageDragActive) setPagePickerValue(state.pagePickerValue || current, total);
  }

  function scrollToPostByIndex(index) {
    const $posts = getVisiblePosts();
    if (!$posts.length) return;
    const safe = clampPageIndex(index, $posts.length);
    const $target = $posts.eq(safe - 1);
    if ($target.length) {
      window.scrollTo({ top: Math.max(0, $target.offset().top - 84), behavior: 'smooth' });
      closePagePicker();
      window.setTimeout(updatePageProgress, 120);
    }
  }

  function handlePageSliderMove(clientY) {
    const $wrap = $('#x-page-slider-wrap');
    const total = getVisiblePosts().length || 1;
    if (!$wrap.length) return;
    const rect = $wrap[0].getBoundingClientRect();
    const handleHeight = $('#x-page-slider-handle').outerHeight() || 62;
    const usableStart = PAGE_SLIDER_TRACK_PADDING + handleHeight / 2;
    const usableEnd = rect.height - PAGE_SLIDER_TRACK_PADDING - handleHeight / 2;
    const relative = Math.min(usableEnd, Math.max(usableStart, clientY - rect.top));
    const ratio = usableEnd <= usableStart ? 0 : (relative - usableStart) / (usableEnd - usableStart);
    const next = total <= 1 ? 1 : Math.round(1 + ratio * (total - 1));
    setPagePickerValue(next, total);
  }

  function unbindPageDrag() {
    $(document).off('.xPageDrag');
    state.pageDragActive = false;
    $('#x-page-slider-handle').removeClass('dragging');
  }

  function bindPageSliderDrag() {
    const $handle = $('#x-page-slider-handle');
    const $wrap = $('#x-page-slider-wrap');
    if (!$handle.length || !$wrap.length || $handle.data('x-drag-bound')) return;
    $handle.data('x-drag-bound', true);

    const pointY = function (event) {
      const e = event.originalEvent || event;
      if (e.touches && e.touches[0]) return e.touches[0].clientY;
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
      return e.clientY;
    };
    const move = function (event) {
      if (!state.pageDragActive) return;
      if (event.cancelable !== false) event.preventDefault();
      handlePageSliderMove(pointY(event));
    };
    const stopDrag = function () { unbindPageDrag(); };
    const startDrag = function (event) {
      if (event.cancelable !== false) event.preventDefault();
      state.pageDragActive = true;
      $handle.addClass('dragging');
      const original = event.originalEvent || event;
      if (this.setPointerCapture && original.pointerId !== undefined) { try { this.setPointerCapture(original.pointerId); } catch (_) {} }
      handlePageSliderMove(pointY(event));
      $(document)
        .on('pointermove.xPageDrag mousemove.xPageDrag touchmove.xPageDrag', move)
        .on('pointerup.xPageDrag pointercancel.xPageDrag mouseup.xPageDrag touchend.xPageDrag touchcancel.xPageDrag', stopDrag);
    };

    $handle.on('pointerdown.xPageDrag mousedown.xPageDrag touchstart.xPageDrag', startDrag);
    $wrap.on('pointerdown.xPageTrack mousedown.xPageTrack touchstart.xPageTrack', function (event) {
      if ($(event.target).closest('#x-page-slider-handle').length) return;
      startDrag.call($handle[0], event);
    });
  }

  function openPagePicker() {
    const total = getVisiblePosts().length || 1;
    const current = getCurrentPostIndex();
    setPagePickerValue(current, total);
    $('#x-page-picker-mask, #x-page-picker').addClass('show');
    bindPageSliderDrag();
  }

  function closePagePicker() {
    $('#x-page-picker-mask, #x-page-picker').removeClass('show');
    unbindPageDrag();
  }

  async function translateReplyText() {
    const $input = $('#x-reply-text');
    const $btn = $('#x-reply-translate-btn');
    const raw = $.trim($input.val());
    if (!raw || $btn.hasClass('is-loading')) return;
    $btn.addClass('is-loading').prop('disabled', true);
    try {
      const out = await translateText(raw);
      if (out) {
        $input.val(out);
        autosizeTextarea();
        $input.trigger('focus');
      }
    } catch (err) {
      console.warn(err);
      showError('输入内容翻译失败');
    } finally {
      $btn.removeClass('is-loading').prop('disabled', false);
    }
  }

  function removeInjectedUi() {
    $('#x-topic-bottom,#x-page-picker-mask,#x-page-picker,#x-media-lightbox,#x-translate-settings-mask,#x-translate-settings-modal,#x-lang-picker-mask,#x-lang-picker,#x-hidden-file-input').remove();
  }

  function cleanupOldInjectedUi() {
    const $bottom = $('#x-topic-bottom');
    if ($bottom.length && $bottom.attr(UI_VERSION_ATTR) !== VERSION) removeInjectedUi();
  }

  function injectReplyUI() {
    cleanupOldInjectedUi();
    if ($('#x-topic-bottom').length) return;
    $('body').append(`
      <div id="x-topic-bottom" ${UI_VERSION_ATTR}="${VERSION}">
        <div id="x-reply-backdrop"></div>
        <div id="x-reply-panel">
          <div id="x-reply-target">
            <div class="x-target-main"><div class="x-target-title" id="x-target-title"></div><div class="x-target-text" id="x-target-text"></div></div>
            <button type="button" id="x-clear-reply" aria-label="清除引用"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="x-record-panel"><span id="x-record-dot"></span><span id="x-record-wave">${'<i></i>'.repeat(6)}</span><span id="x-record-time">00:00</span></div>
          <div id="x-preview-stack">
            <div class="x-preview-card" id="x-image-preview"><button type="button" class="x-preview-remove" id="x-remove-image"><i class="fa-solid fa-xmark"></i></button><img src="" alt="图片预览" /></div>
            <div class="x-preview-card" id="x-video-preview"><button type="button" class="x-preview-remove" id="x-remove-video"><i class="fa-solid fa-xmark"></i></button><video controls playsinline preload="metadata"></video></div>
            <div class="x-preview-card" id="x-audio-preview"><button type="button" class="x-preview-remove" id="x-remove-audio"><i class="fa-solid fa-xmark"></i></button><div class="x-audio-preview-inner"></div></div>
          </div>
          <textarea id="x-reply-text" placeholder="友善回复..."></textarea>
          <div id="x-reply-actions">
            <button type="button" class="x-tool-btn" id="x-img-btn" aria-label="上传图片或视频"><i class="fa-solid fa-image"></i></button>
            <button type="button" class="x-tool-btn" id="x-voice-btn" aria-label="录音"><i class="fa-solid fa-microphone"></i></button>
            <button type="button" class="x-tool-btn x-reply-translate-btn" id="x-reply-translate-btn" aria-label="翻译输入内容" title="翻译输入内容"><i class="fa-solid fa-language"></i></button>
            <div id="x-voice-meta"></div><button type="button" id="x-send-btn">发送</button>
          </div>
        </div>
        <div class="x-bottom-inner"><div class="x-page-pill" id="x-page-pill">1 / 1</div><button type="button" class="x-reply-fab" id="x-reply-toggle" aria-label="打开回复框"><i class="fa-solid fa-pen"></i></button></div>
      </div>
      <div id="x-page-picker-mask"></div>
      <div id="x-page-picker">
        <div class="x-page-picker-sheet-title">楼层跳转</div>
        <div class="x-page-picker-body">
          <div class="x-page-picker-left"><div class="x-page-picker-label">当前楼层</div><div class="x-page-picker-value-row"><input type="number" id="x-page-number" min="1" inputmode="numeric" /><div class="x-page-picker-value-total">/ <em id="x-page-total-inline">1</em></div></div><button type="button" id="x-page-use-current">使用当前楼层</button></div>
          <div class="x-page-picker-right"><div class="x-page-picker-slider-wrap" id="x-page-slider-wrap"><span class="x-page-slider-end top"></span><span class="x-page-slider-track"><i id="x-page-slider-progress"></i></span><button type="button" id="x-page-slider-handle" aria-label="拖动楼层"><i class="fa-solid fa-angle-up"></i><i class="fa-solid fa-angle-down"></i></button><span class="x-page-slider-end bottom"></span></div></div>
        </div>
        <div class="x-page-picker-footer-meta"><span id="x-page-picker-current">1</span> / <span id="x-page-picker-total">1</span></div>
        <div class="x-page-picker-bottom-actions"><button type="button" id="x-page-picker-cancel">取消</button><button type="button" id="x-page-go">跳转</button></div>
      </div>
      <div id="x-media-lightbox"><button type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button><img src="" alt="放大图片" /></div>
      <div id="x-translate-settings-mask"></div>
      <div id="x-translate-settings-modal">
        <div class="x-settings-header"><div class="x-settings-title"><i class="fa-solid fa-language"></i><span>AI翻译设置</span></div><button type="button" id="x-settings-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>
        <input type="hidden" id="x-setting-source-lang" value="auto" /><input type="hidden" id="x-setting-target-lang" value="en" />
        <div class="x-settings-preview-row"><button type="button" class="x-settings-preview-chip x-lang-trigger" id="x-lang-source-preview" data-lang-role="source"></button><span class="x-settings-preview-arrow"><i class="fa-solid fa-right-left"></i></span><button type="button" class="x-settings-preview-chip x-lang-trigger" id="x-lang-target-preview" data-lang-role="target"></button></div>
        <div class="x-settings-tip">点击“原文”或“目标”才会展开语言选择</div>
        <input type="hidden" id="x-translate-provider" value="google" />
        <div class="x-provider-tabs"><button type="button" class="x-provider-tab active" data-provider="google">谷歌翻译</button><button type="button" class="x-provider-tab" data-provider="ai">AI翻译</button></div>
        <div id="x-ai-settings"><div class="x-settings-grid"><label class="x-settings-field x-settings-field-full"><span>AI 接口</span><input type="text" id="x-setting-ai-endpoint" placeholder="https://your-api.example.com/v1" /></label><label class="x-settings-field"><span>模型</span><input type="text" id="x-setting-ai-model" placeholder="gpt-4.1-mini / qwen / deepseek" /></label><label class="x-settings-field x-settings-field-full"><span>密钥</span><input type="password" id="x-setting-ai-key" placeholder="API Key" /></label><label class="x-settings-field x-settings-field-full"><span>提示词</span><textarea id="x-setting-ai-prompt" rows="5" placeholder="支持 {{sourceLang}} 和 {{targetLang}} 占位符"></textarea></label></div></div>
        <div class="x-settings-actions"><button type="button" class="x-settings-secondary" id="x-settings-cancel">取消</button><button type="button" class="x-settings-primary" id="x-settings-save">保存</button></div>
      </div>
      <div id="x-lang-picker-mask"></div>
      <div id="x-lang-picker"><div class="x-lang-picker-header"><div class="x-lang-picker-title" id="x-lang-picker-title">选择语言</div><button type="button" class="x-lang-picker-close" id="x-lang-picker-close"><i class="fa-solid fa-xmark"></i></button></div><div id="x-lang-picker-list"></div></div>
      <input type="file" id="x-hidden-file-input" accept="image/*,video/*" capture="environment" style="display:none;" />
    `);

    updateTranslateLangVisuals();
    $('#x-reply-toggle').on('click.xReply', openReplyPanel);
    $('#x-reply-backdrop').on('click.xReply', closeReplyPanel);
    $('#x-clear-reply').on('click.xReply', e => { e.preventDefault(); setReplyTarget(null); });
    $('#x-reply-text').on('input.xReply', autosizeTextarea);
    $('#x-img-btn').on('click.xReply', () => $('#x-hidden-file-input').trigger('click'));
    $('#x-hidden-file-input').on('change.xReply', handleComposerFileChange);
    $('#x-remove-image, #x-remove-video').on('click.xReply', () => setPendingFile(null, ''));
    $('#x-remove-audio').on('click.xReply', () => setPendingVoice(null));
    $('#x-voice-btn').on('click.xReply', toggleRecording);
    $('#x-reply-translate-btn').on('click.xReply', translateReplyText);
    $('#x-send-btn').on('click.xReply', sendReply);
    $('#x-page-pill').on('click.xPage', openPagePicker);
    $('#x-page-picker-mask, #x-page-picker-cancel').on('click.xPage', closePagePicker);
    $('#x-page-go').on('click.xPage', () => scrollToPostByIndex($('#x-page-number').val()));
    $('#x-page-number').on('input.xPage', function () { setPagePickerValue($(this).val(), getVisiblePosts().length || 1); }).on('keydown.xPage', function (e) { if (e.key === 'Enter') scrollToPostByIndex($(this).val()); });
    $('#x-page-use-current').on('click.xPage', () => setPagePickerValue(getCurrentPostIndex(), getVisiblePosts().length || 1));
    bindPageSliderDrag();
    $('#x-media-lightbox, #x-media-lightbox button').on('click.xLightbox', function (e) { e.preventDefault(); $('#x-media-lightbox').removeClass('show'); });
    $('#x-media-lightbox img').on('click.xLightbox', e => e.stopPropagation());
    $('#x-translate-settings-mask, #x-settings-cancel, #x-settings-close').on('click.xSettings', closeTranslateSettingsModal);
    $('#x-settings-save').on('click.xSettings', saveTranslateSettingsFromModal);
    $('.x-provider-tab').on('click.xSettings', function () { setTranslateProviderUI($(this).attr('data-provider')); });
    $('.x-lang-trigger').on('click.xSettings', function () { openLanguagePicker($(this).attr('data-lang-role')); });
    $('#x-lang-picker-mask, #x-lang-picker-close').on('click.xLang', closeLanguagePicker);
    $('#x-lang-picker-list').on('click.xLang', '.x-lang-option', function () {
      const code = $(this).attr('data-code') || 'auto';
      if (state.langPickerRole === 'source') $('#x-setting-source-lang').val(code);
      else $('#x-setting-target-lang').val(code);
      updateTranslateLangVisuals();
      closeLanguagePicker();
    });
  }

  async function canEncode(type) {
    if (state.encodeSupport[type] !== undefined) return state.encodeSupport[type];
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    if (!canvas.toBlob) { state.encodeSupport[type] = false; return false; }
    const ok = await new Promise(resolve => canvas.toBlob(blob => resolve(!!blob && blob.type === type), type, 0.8));
    state.encodeSupport[type] = ok;
    return ok;
  }

  function extForMime(type) {
    if (type === 'image/webp') return '.webp';
    if (type === 'image/png') return '.png';
    return '.jpg';
  }

  async function compressWithLibrary(file, targetType) {
    if (typeof window.imageCompression !== 'function') return null;
    return window.imageCompression(file, {
      maxSizeMB: IMAGE_CONFIG.maxSizeMB,
      maxWidthOrHeight: IMAGE_CONFIG.maxSide,
      useWebWorker: true,
      fileType: targetType,
      initialQuality: IMAGE_CONFIG.quality,
      alwaysKeepResolution: false,
      preserveExif: false
    });
  }

  async function compressWithCanvas(file, targetType) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const width0 = img.naturalWidth || img.width;
      const height0 = img.naturalHeight || img.height;
      const scale = Math.min(1, IMAGE_CONFIG.maxSide / Math.max(width0, height0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width0 * scale));
      canvas.height = Math.max(1, Math.round(height0 * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.toBlob) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const targetBytes = IMAGE_CONFIG.maxSizeMB * 1024 * 1024;
      const qualities = [IMAGE_CONFIG.quality, 0.52, 0.45, 0.38];
      let best = null;
      for (const q of qualities) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, targetType, q));
        if (!blob) continue;
        best = blob;
        if (blob.size <= targetBytes) break;
      }
      return best;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressImage(file) {
    if (!file || !/^image\//i.test(file.type)) return file;
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;
    if (file.size < IMAGE_CONFIG.minCompressBytes) return file;
    const targetType = IMAGE_CONFIG.useWebp && await canEncode('image/webp') ? 'image/webp' : 'image/jpeg';
    try {
      let blob = await compressWithLibrary(file, targetType);
      if (!blob) blob = await compressWithCanvas(file, targetType);
      if (!blob || blob.size >= file.size * 0.95) return file;
      const base = String(file.name || `image-${Date.now()}`).replace(/\.[^.]+$/, '');
      return new File([blob], `${base}${extForMime(targetType)}`, { type: targetType, lastModified: Date.now() });
    } catch (err) {
      console.warn('image compression failed:', err);
      return file;
    }
  }

  async function compressVideo(file) {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return file;
    const inputUrl = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.src = inputUrl; video.muted = true; video.playsInline = true;
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
      const maxWidth = 720;
      const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
      const width = Math.max(2, Math.round(video.videoWidth * scale));
      const height = Math.max(2, Math.round(video.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      const canvasStream = canvas.captureStream(24);
      let videoStream = null;
      try { videoStream = video.captureStream ? video.captureStream() : null; } catch (_) { videoStream = null; }
      const tracks = [].concat(Array.from(canvasStream.getVideoTracks()), videoStream ? Array.from(videoStream.getAudioTracks()) : []);
      const outputStream = new MediaStream(tracks);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
      const chunks = [];
      const recorder = new MediaRecorder(outputStream, { mimeType: mime, videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 });
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      let drawing = true;
      const draw = () => { if (!drawing) return; try { ctx.drawImage(video, 0, 0, width, height); } catch (_) {} if (!video.paused && !video.ended) requestAnimationFrame(draw); };
      const done = new Promise(resolve => { recorder.onstop = () => resolve(); });
      recorder.start(500);
      await video.play();
      draw();
      await new Promise(resolve => { video.onended = resolve; video.onerror = resolve; });
      drawing = false;
      recorder.stop();
      await done;
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), { type: blob.type || 'video/webm' });
    } catch (err) {
      console.warn('video compression failed:', err);
      return file;
    } finally {
      try { URL.revokeObjectURL(inputUrl); } catch (_) {}
    }
  }

  async function handleComposerFileChange(e) {
    const file = e.target.files && e.target.files[0];
    $(e.target).val('');
    if (!file) return;
    setPendingVoice(null);
    $('#x-voice-meta').text('处理文件中...');
    if (/^image\//i.test(file.type)) {
      const next = await compressImage(file);
      setPendingFile(next, 'image');
      $('#x-voice-meta').text(next !== file ? '图片已压缩并准备上传' : '图片已准备上传');
      return;
    }
    if (/^video\//i.test(file.type)) {
      const next = await compressVideo(file);
      setPendingFile(next, 'video');
      $('#x-voice-meta').text(next !== file ? '视频已压缩并准备上传' : '视频已准备上传');
      return;
    }
    $('#x-voice-meta').text('');
    showError('目前只支持图片或视频');
  }

  function stopRecordTimer() {
    if (state.recordTimer) { window.clearInterval(state.recordTimer); state.recordTimer = null; }
  }

  function updateRecordMeta() {
    const sec = Math.floor((Date.now() - state.recordStartAt) / 1000);
    $('#x-record-time').text(formatDuration(sec));
    $('#x-voice-meta').text(`录音中 ${formatDuration(sec)} · 16kbps`);
  }

  function pickAudioMimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    for (const mime of VOICE_CONFIG.fallbackMimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
  }

  function createAudioRecorder(stream) {
    const mimeType = pickAudioMimeType();
    const options = {
      audioBitsPerSecond: VOICE_CONFIG.audioBitsPerSecond
    };
    if (mimeType) options.mimeType = mimeType;
    try {
      return new MediaRecorder(stream, options);
    } catch (err) {
      console.warn('MediaRecorder options failed, retrying without bitrate:', err);
      return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return showError('当前浏览器不支持录音');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setPendingFile(null, '');
      state.recordStream = stream;
      state.recordChunks = [];
      state.recordStartAt = Date.now();
      state.mediaRecorder = createAudioRecorder(stream);
      state.mediaRecorder.ondataavailable = ev => { if (ev.data && ev.data.size) state.recordChunks.push(ev.data); };
      state.mediaRecorder.onstop = () => {
        const seconds = Math.max(1, Math.round((Date.now() - state.recordStartAt) / 1000));
        stream.getTracks().forEach(track => track.stop());
        state.recordStream = null;
        stopRecordTimer();
        $('#x-record-panel').removeClass('show');
        $('#x-voice-btn').removeClass('recording').html('<i class="fa-solid fa-microphone"></i>');
        if (state.recordChunks.length) {
          const type = state.mediaRecorder && state.mediaRecorder.mimeType ? state.mediaRecorder.mimeType : (state.recordChunks[0].type || pickAudioMimeType() || 'audio/webm');
          setPendingVoice(new Blob(state.recordChunks, { type }), seconds);
        }
      };
      state.mediaRecorder.start(250);
      $('#x-record-panel').addClass('show');
      $('#x-voice-btn').addClass('recording').html('<i class="fa-solid fa-stop"></i>');
      updateRecordMeta();
      state.recordTimer = window.setInterval(updateRecordMeta, 400);
    } catch (err) {
      console.warn(err);
      showError('麦克风权限未开启');
    }
  }

  function stopRecording(silent) {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      try { state.mediaRecorder.stop(); } catch (_) {}
    } else {
      if (state.recordStream) { try { state.recordStream.getTracks().forEach(track => track.stop()); } catch (_) {} }
      state.recordStream = null;
      stopRecordTimer();
      $('#x-record-panel').removeClass('show');
      $('#x-voice-btn').removeClass('recording').html('<i class="fa-solid fa-microphone"></i>');
      if (!silent) $('#x-voice-meta').text('');
    }
  }

  function toggleRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') stopRecording(false);
    else startRecording();
  }

  function looksLikeUploadUrl(value) {
    return typeof value === 'string' && !!$.trim(value) && $.trim(value) !== 'false' && (/^(https?:)?\//i.test($.trim(value)) || /^\/assets\//i.test($.trim(value)));
  }

  function extractUploadUrl(payload) {
    const queue = [payload];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (!current || seen.has(current)) continue;
      if (looksLikeUploadUrl(current)) return $.trim(current);
      if (typeof current !== 'object') continue;
      seen.add(current);
      if (Array.isArray(current)) { current.forEach(item => queue.push(item)); continue; }
      ['url', 'path', 'upload_url', 'uploadUrl', 'fileUrl'].forEach(key => { if (looksLikeUploadUrl(current[key])) queue.unshift($.trim(current[key])); });
      Object.keys(current).forEach(key => {
        const value = current[key];
        if (!value) return;
        if (looksLikeUploadUrl(value)) queue.unshift($.trim(value));
        else if (typeof value === 'object') queue.push(value);
      });
    }
    return '';
  }

  function appendDurationParam(url, seconds) {
    const duration = Math.max(1, Math.round(Number(seconds) || 0));
    try {
      const parsed = new URL(url, location.origin);
      parsed.searchParams.set('haa8dur', String(duration));
      return parsed.origin === location.origin ? parsed.pathname + parsed.search + parsed.hash : parsed.toString();
    } catch (_) {
      return url + (String(url).includes('?') ? '&' : '?') + 'haa8dur=' + encodeURIComponent(duration);
    }
  }

  async function uploadToNodeBB(file) {
    const fd = new FormData();
    fd.append('files[]', file);
    if (window.ajaxify && ajaxify.data) {
      fd.append('tid', ajaxify.data.tid || '');
      fd.append('cid', ajaxify.data.cid || '');
    }
    const res = await fetch(rel('/api/post/upload'), {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { 'x-csrf-token': csrfToken(), 'x-requested-with': 'XMLHttpRequest' }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json && (json.error || json.message || (json.status && json.status.message))) || 'upload failed');
    const url = extractUploadUrl(json);
    if (!url) throw new Error('上传成功但未返回文件地址');
    return url;
  }

  async function createReplyViaApi(payload) {
    const tid = window.ajaxify && ajaxify.data ? ajaxify.data.tid : null;
    if (!tid) throw new Error('missing topic id');
    const res = await fetch(rel(`/api/v3/topics/${encodeURIComponent(tid)}`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken(), 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json && json.status && json.status.message) || json.error || `reply failed: ${res.status}`);
    return json && (json.response || json);
  }

  function findPidInPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const keys = ['pid', 'postId', 'post_id'];
    for (const key of keys) {
      const value = payload[key];
      if (value && /^\d+$/.test(String(value))) return String(value);
    }
    if (Array.isArray(payload.posts)) {
      for (const item of payload.posts) {
        const found = findPidInPayload(item);
        if (found) return found;
      }
    }
    for (const key of ['response', 'data', 'post', 'result']) {
      const found = findPidInPayload(payload[key]);
      if (found) return found;
    }
    return '';
  }

  function refreshAfterReply(created) {
    const pid = findPidInPayload(created);
    window.setTimeout(function () {
      dedupePostsByPid();
      if (pid && $('[component="post"][data-pid="' + pid + '"]').length) {
        decorateAllPosts();
        updatePageProgress();
        return;
      }
      if (window.ajaxify && typeof ajaxify.refresh === 'function') ajaxify.refresh();
      else window.location.reload();
    }, 700);
  }

  function getVoiceExt(blob) {
    const type = String(blob && blob.type || '');
    if (/ogg/i.test(type)) return 'ogg';
    if (/mp4|m4a/i.test(type)) return 'm4a';
    return 'webm';
  }

  async function sendReply() {
    if (state.replySending) return;
    const textVal = $.trim($('#x-reply-text').val());
    if (!textVal && !state.pendingFile && !state.pendingVoiceBlob) return showError('请输入内容或添加媒体');
    const $btn = $('#x-send-btn');
    state.replySending = true;
    $btn.prop('disabled', true).text('发送中...');
    try {
      let finalContent = textVal;
      if (state.replyTo && state.replyTo.pid) finalContent = buildQuotePrefix(state.replyTo) + (finalContent || '');
      if (state.pendingFile) {
        const fileUrl = await uploadToNodeBB(state.pendingFile);
        if (state.pendingFileKind === 'image') finalContent += `${finalContent ? '\n' : ''}![image](${fileUrl})`;
        else if (state.pendingFileKind === 'video') finalContent += `${finalContent ? '\n' : ''}${fileUrl}`;
      }
      if (state.pendingVoiceBlob) {
        const ext = getVoiceExt(state.pendingVoiceBlob);
        const voiceFile = new File([state.pendingVoiceBlob], `voice-${Date.now()}.${ext}`, { type: state.pendingVoiceBlob.type || 'audio/webm' });
        const voiceUrl = appendDurationParam(await uploadToNodeBB(voiceFile), state.pendingVoiceSeconds || 1);
        finalContent += `${finalContent ? '\n' : ''}[语音消息](${voiceUrl})`;
      }

      const fingerprint = [currentTopicKey(), state.replyTo && state.replyTo.pid || '', finalContent].join('|');
      if ((state.lastReplyFingerprint === fingerprint && Date.now() - Number(state.lastReplyAt || 0) < 10000) || state.inFlightFingerprint === fingerprint) {
        throw new Error('刚刚已经发送过这条内容，请不要重复提交');
      }
      state.inFlightFingerprint = fingerprint;

      const payload = { content: finalContent };
      if (state.replyTo && state.replyTo.pid) payload.toPid = state.replyTo.pid;
      const created = await createReplyViaApi(payload);
      state.lastReplyFingerprint = fingerprint;
      state.lastReplyAt = Date.now();
      resetComposerState();
      closeReplyPanel();
      showSuccess('发送成功');
      refreshAfterReply(created);
    } catch (err) {
      console.warn(err);
      showError(err && err.message ? err.message : '发送失败');
    } finally {
      state.inFlightFingerprint = '';
      state.replySending = false;
      $btn.prop('disabled', false).text('发送');
    }
  }



  // Expose detail-page translation helpers so category/list pages can share the same settings when this file is loaded globally.
  window.xTranslateText = window.xTranslateText || translateText;
  window.xOpenTranslateSettings = window.xOpenTranslateSettings || openTranslateSettingsModal;

  function bindToolbarEvents() {
    $(document).off('click.xTopicToolbar')
      .on('click.xTopicToolbar', '.x-title-translate', function () { toggleTitleTranslate(); })
      .on('click.xTopicToolbar', '.x-ai-settings-btn', function () { openTranslateSettingsModal(); });
  }

  function bindGlobalEvents() {
    $(window).off('scroll.xTopicProgress resize.xTopicProgress').on('scroll.xTopicProgress resize.xTopicProgress', updatePageProgress);
    $(document).off('keydown.xTopicDetailV14').on('keydown.xTopicDetailV14', function (e) {
      if (e.key === 'Escape') {
        closePagePicker();
        closeTranslateSettingsModal();
        closeLanguagePicker();
        $('#x-media-lightbox').removeClass('show');
      }
    });
  }

  function init() {
    if (!isTopicPage()) {
      if ($('#x-topic-bottom').length) removeInjectedUi();
      return;
    }
    ensureTopicState();
    injectReplyUI();
    injectTopicToolbar();
    ensureTitleTranslateButton();
    decorateAllPosts();
    compactAllDetailMedia();
    [80, 240, 700, 1400].forEach(delay => window.setTimeout(compactAllDetailMedia, delay));
    observePostsIncrementally();
    bindToolbarEvents();
    bindGlobalEvents();
    autosizeTextarea();
    updatePageProgress();
  }

  $(window).off('action:ajaxify.start.xTopicDetailV14').on('action:ajaxify.start.xTopicDetailV14', function () {
    if (state.postObserver) { try { state.postObserver.disconnect(); } catch (_) {} state.postObserver = null; }
    stopRecording(true);
    closePagePicker();
    closeTranslateSettingsModal();
    closeLanguagePicker();
    $('#x-media-lightbox').removeClass('show');
  });

  $(window).off('action:ajaxify.end.xTopicDetailV14 action:posts.loaded.xTopicDetailV14 action:posts.edited.xTopicDetailV14 action:topic.loaded.xTopicDetailV14')
    .on('action:ajaxify.end.xTopicDetailV14 action:posts.loaded.xTopicDetailV14 action:posts.edited.xTopicDetailV14 action:topic.loaded.xTopicDetailV14', function () {
      wait(60).then(init);
    });

  $(function () { init(); });
})(window.jQuery, window, document);
