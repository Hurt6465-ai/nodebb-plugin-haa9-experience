/* =========================================================
   NodeBB Unified Translate Tools v14.0
   - shared Google/AI translation settings
   - category toolbar on all category pages
   - native topic-title translation for non-HAA9 boards
   ========================================================= */
(() => {
  'use strict';

  const SETTINGS_KEY = 'x-topic-translate-settings';
  const CACHE_MS = 3 * 24 * 60 * 60 * 1000;
  const DEFAULT_PROMPT = '你是专业论坛翻译助手。请把用户提供的内容从 {{sourceLang}} 翻译为 {{targetLang}}。保留原有语气、换行、链接、Markdown、代码块、用户名、表情和列表结构。只输出译文，不要解释。';
  const LANGS = [
    ['auto', '自动检测'], ['zh', '中文'], ['en', 'English'], ['my', 'မြန်မာ'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'],
    ['ja', '日本語'], ['ko', '한국어'], ['ms', 'Bahasa Melayu'], ['id', 'Bahasa Indonesia'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['ru', 'Русский']
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    return path.startsWith(base) ? path : base + path;
  }

  function safeJsonGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function safeJsonSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function normalizeLang(value, fallback) {
    const raw = norm(value).toLowerCase().replace(/_/g, '-');
    return raw ? raw.split('-')[0] : fallback;
  }

  function getSettings() {
    const saved = safeJsonGet(SETTINGS_KEY, {}) || {};
    return {
      sourceLang: normalizeLang(saved.sourceLang || saved.source || saved.from || 'auto', 'auto'),
      targetLang: normalizeLang(saved.targetLang || saved.target || saved.to || navigator.language || 'zh', 'zh'),
      provider: saved.provider === 'ai' ? 'ai' : 'google',
      aiEndpoint: saved.aiEndpoint || '',
      aiModel: saved.aiModel || '',
      aiApiKey: saved.aiApiKey || '',
      aiPrompt: saved.aiPrompt || DEFAULT_PROMPT,
      temperature: Number.isFinite(Number(saved.temperature)) ? Number(saved.temperature) : 0.3
    };
  }

  function saveSettings(settings) { safeJsonSet(SETTINGS_KEY, settings); }

  function cacheKey(text, settings) {
    const provider = settings.provider === 'ai' ? `ai:${settings.aiModel || 'model'}` : 'google';
    return `x-unified-translate:${provider}:${settings.sourceLang}:${settings.targetLang}:${encodeURIComponent(norm(text)).slice(0, 220)}`;
  }

  function extractAiText(data) {
    if (!data) return '';
    if (typeof data.output_text === 'string') return data.output_text;
    if (Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.map(part => part && (part.text || part.output_text || '')).join('');
    }
    if (Array.isArray(data.output)) {
      return data.output.map(item => Array.isArray(item.content) ? item.content.map(part => part && (part.text || part.output_text || '')).join('') : '').join('');
    }
    return '';
  }

  async function translateViaGoogle(text, settings) {
    const sl = settings.sourceLang && settings.sourceLang !== 'auto' ? settings.sourceLang : 'auto';
    const tl = settings.targetLang || 'zh';
    const url = 'https://translate.googleapis.com/translate_a/single?' + new URLSearchParams({ client: 'gtx', sl, tl, dt: 't', q: text }).toString();
    const res = await fetch(url, { method: 'GET', credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) throw new Error(`translate ${res.status}`);
    const data = await res.json();
    const parts = Array.isArray(data && data[0]) ? data[0] : [];
    return parts.map(item => item && item[0] ? item[0] : '').join('');
  }

  async function translateViaAi(text, settings) {
    if (!settings.aiEndpoint || !settings.aiModel || !settings.aiApiKey) throw new Error('AI 翻译未配置');
    const endpoint = /\/(chat\/completions|responses)$/i.test(settings.aiEndpoint) ? settings.aiEndpoint : `${String(settings.aiEndpoint).replace(/\/+$/, '')}/chat/completions`;
    const prompt = String(settings.aiPrompt || DEFAULT_PROMPT)
      .replace(/{{\s*sourceLang\s*}}/gi, settings.sourceLang || 'auto')
      .replace(/{{\s*targetLang\s*}}/gi, settings.targetLang || 'zh');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
      body: JSON.stringify({ model: settings.aiModel, temperature: settings.temperature, messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }] })
    });
    if (!res.ok) throw new Error(`AI 翻译失败 ${res.status}`);
    return extractAiText(await res.json());
  }

  async function xTranslateText(text) {
    const clean = norm(text);
    if (!clean) return '';
    const settings = getSettings();
    const key = cacheKey(clean, settings);
    const cached = safeJsonGet(key);
    if (cached && cached.expiresAt > Date.now() && typeof cached.text === 'string') return cached.text;
    const out = settings.provider === 'ai' ? await translateViaAi(clean, settings) : await translateViaGoogle(clean, settings);
    const translated = String(out || '').trim();
    if (translated) safeJsonSet(key, { text: translated, expiresAt: Date.now() + CACHE_MS });
    return translated;
  }

  function langOptions(current, includeAuto = true) {
    return LANGS.filter(([code]) => includeAuto || code !== 'auto').map(([code, label]) => `<option value="${code}"${normalizeLang(current, '') === code ? ' selected' : ''}>${label}</option>`).join('');
  }

  function ensureSettingsModal() {
    if ($('#x-unified-translate-modal')) return;
    const settings = getSettings();
    const mask = document.createElement('div');
    mask.id = 'x-unified-translate-mask';
    const modal = document.createElement('div');
    modal.id = 'x-unified-translate-modal';
    modal.innerHTML = `
      <div class="x-settings-header"><div class="x-settings-title"><i class="fa-solid fa-language"></i><span>AI翻译设置</span></div><button type="button" id="x-unified-translate-close"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="x-settings-grid">
        <label><span>原文语言</span><select id="x-unified-source-lang">${langOptions(settings.sourceLang, true)}</select></label>
        <label><span>目标语言</span><select id="x-unified-target-lang">${langOptions(settings.targetLang, false)}</select></label>
        <label><span>翻译服务</span><select id="x-unified-provider"><option value="google">谷歌翻译</option><option value="ai">AI翻译</option></select></label>
        <span></span>
        <div id="x-unified-ai-fields" class="full">
          <label class="full"><span>AI 接口</span><input type="text" id="x-unified-ai-endpoint" placeholder="https://your-api.example.com/v1" /></label>
          <label><span>模型</span><input type="text" id="x-unified-ai-model" placeholder="gpt-4.1-mini / qwen / deepseek" /></label>
          <label class="full"><span>密钥</span><input type="password" id="x-unified-ai-key" placeholder="API Key" /></label>
          <label class="full"><span>提示词</span><textarea id="x-unified-ai-prompt" rows="5"></textarea></label>
        </div>
      </div>
      <div class="x-settings-actions"><button type="button" id="x-unified-translate-cancel">取消</button><button type="button" id="x-unified-translate-save">保存</button></div>`;
    document.body.append(mask, modal);
    $('#x-unified-provider').value = settings.provider;
    $('#x-unified-ai-endpoint').value = settings.aiEndpoint;
    $('#x-unified-ai-model').value = settings.aiModel;
    $('#x-unified-ai-key').value = settings.aiApiKey;
    $('#x-unified-ai-prompt').value = settings.aiPrompt || DEFAULT_PROMPT;
    const syncProvider = () => $('#x-unified-ai-fields').classList.toggle('show', $('#x-unified-provider').value === 'ai');
    $('#x-unified-provider').addEventListener('change', syncProvider);
    syncProvider();
    const close = () => { mask.classList.remove('show'); modal.classList.remove('show'); };
    mask.addEventListener('click', close);
    $('#x-unified-translate-close').addEventListener('click', close);
    $('#x-unified-translate-cancel').addEventListener('click', close);
    $('#x-unified-translate-save').addEventListener('click', () => {
      saveSettings({
        sourceLang: normalizeLang($('#x-unified-source-lang').value, 'auto'),
        targetLang: normalizeLang($('#x-unified-target-lang').value, 'zh'),
        provider: $('#x-unified-provider').value === 'ai' ? 'ai' : 'google',
        aiEndpoint: norm($('#x-unified-ai-endpoint').value),
        aiModel: norm($('#x-unified-ai-model').value),
        aiApiKey: norm($('#x-unified-ai-key').value),
        aiPrompt: $('#x-unified-ai-prompt').value.trim() || DEFAULT_PROMPT,
        temperature: 0.3
      });
      close();
      if (window.app && typeof app.alertSuccess === 'function') app.alertSuccess('翻译设置已保存到本地');
    });
  }

  function xOpenTranslateSettings() {
    ensureSettingsModal();
    const settings = getSettings();
    $('#x-unified-source-lang').value = settings.sourceLang;
    $('#x-unified-target-lang').value = settings.targetLang;
    $('#x-unified-provider').value = settings.provider;
    $('#x-unified-ai-endpoint').value = settings.aiEndpoint;
    $('#x-unified-ai-model').value = settings.aiModel;
    $('#x-unified-ai-key').value = settings.aiApiKey;
    $('#x-unified-ai-prompt').value = settings.aiPrompt || DEFAULT_PROMPT;
    $('#x-unified-ai-fields').classList.toggle('show', settings.provider === 'ai');
    $('#x-unified-translate-mask').classList.add('show');
    $('#x-unified-translate-modal').classList.add('show');
  }

  function isCategoryRoute() {
    return !document.body.classList.contains('page-topic') && (document.body.classList.contains('page-category') || /\/category\/\d+(?:\/|$)/.test(location.pathname));
  }

  function clickNativeComposer() {
    const selectors = ['[component="category/post"]', '[component="category/new-topic"]', '[component="composer/new_topic"]', 'button[component="composer"]', 'a[href*="/compose"]'];
    const native = selectors.map(sel => $(sel)).find(Boolean);
    if (native) { native.click(); return true; }
    const cid = Number((window.ajaxify && ajaxify.data && (ajaxify.data.cid || (ajaxify.data.category && ajaxify.data.category.cid))) || 0);
    if (window.require) {
      try { window.require(['composer'], composer => composer && composer.newTopic && composer.newTopic(cid)); return true; } catch (_) {}
    }
    return false;
  }

  function findNativeCategoryToolbar() {
    const direct = $('[component="category/sort"], [component="category/controls"], [component="category/toolbar"]');
    if (direct) return direct.closest('.btn-group, .d-flex, .category-tools, .sticky-tools, .btn-toolbar, [component="category/toolbar"]') || direct.parentElement;
    return $('.category-tools, .sticky-tools, .topic-list-header .btn-toolbar, .category .btn-toolbar');
  }

  function xEnsureCategoryToolbar(options = {}) {
    if (!isCategoryRoute()) { xRemoveCategoryToolbar(); return; }
    const nativeToolbar = findNativeCategoryToolbar();
    if (!nativeToolbar) return;
    $('#haa9-category-toolbar')?.remove();
    let button = $('#haa9-category-ai-settings');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'haa9-category-ai-settings';
      button.className = 'x-ai-settings-btn haa9-category-settings-btn';
      button.innerHTML = '<i class="fa-solid fa-sliders" aria-hidden="true"></i><span>AI</span>';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); xOpenTranslateSettings(); });
      nativeToolbar.appendChild(button);
    }
    xBindNativeTitleTranslation(document);
  }

  function xRemoveCategoryToolbar() { $('#haa9-category-toolbar')?.remove(); $('#haa9-category-ai-settings')?.remove(); }

  function cleanTitleText(text) {
    return norm(String(text || '').replace(/https?:\/\/\S+/g, ''));
  }

  function makeInlineTranslateButton(getText, box) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'haa9-text-translate-btn haa9-list-translate-btn';
    btn.title = '翻译';
    btn.setAttribute('aria-label', '翻译');
    btn.innerHTML = '<i class="fa-solid fa-language" aria-hidden="true"></i><span>翻译</span>';
    btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const raw = cleanTitleText(getText());
      if (!raw) return;
      if (box.classList.contains('is-show') && box.dataset.loaded === '1') {
        box.classList.remove('is-show');
        btn.classList.remove('is-active');
        return;
      }
      btn.classList.add('is-loading', 'is-active');
      box.classList.add('is-show');
      if (box.dataset.loaded !== '1') {
        box.textContent = '翻译中...';
        try {
          const out = await xTranslateText(raw);
          box.textContent = out || '';
          box.dataset.loaded = out ? '1' : '0';
        } catch (error) {
          console.warn('native title translate failed:', error);
          box.textContent = '翻译失败';
        }
      }
      btn.classList.remove('is-loading');
    });
    return btn;
  }

  function xBindNativeTitleTranslation(root = document) {
    if (!isCategoryRoute() && !document.body.classList.contains('page-user')) return;
    const candidates = $$('li[component="category/topic"] h3[component="topic/header"] a, li[component="category/topic"] [component="topic/title"] a, li[component="category/topic"] .topic-title a, .topic-row a[href*="/topic/"], .topic-list-item a[href*="/topic/"]', root);
    candidates.forEach(link => {
      if (!link || link.dataset.xNativeTranslateReady === '1') return;
      if (link.closest('[data-haa9-ready="1"], .haa9-content, #haa9-root, #haa9-category-toolbar')) return;
      const raw = cleanTitleText(link.textContent);
      if (!raw || raw.length < 2) return;
      link.dataset.xNativeTranslateReady = '1';
      const line = document.createElement('span');
      line.className = 'haa9-native-title-line';
      link.parentNode.insertBefore(line, link);
      line.appendChild(link);
      const box = document.createElement('div');
      box.className = 'haa9-native-title-translate-box haa9-list-translate-box';
      line.appendChild(makeInlineTranslateButton(() => link.textContent || raw, box));
      line.insertAdjacentElement('afterend', box);
    });
  }

  function boot() {
    if (document.body.classList.contains('page-topic')) { xRemoveCategoryToolbar(); return; }
    if (isCategoryRoute()) xEnsureCategoryToolbar();
    xBindNativeTitleTranslation(document);
  }

  window.xTranslateText = window.xTranslateText || xTranslateText;
  window.xOpenTranslateSettings = window.xOpenTranslateSettings || xOpenTranslateSettings;
  window.xEnsureCategoryToolbar = window.xEnsureCategoryToolbar || xEnsureCategoryToolbar;
  window.xRemoveCategoryToolbar = window.xRemoveCategoryToolbar || xRemoveCategoryToolbar;
  window.xBindNativeTitleTranslation = window.xBindNativeTitleTranslation || xBindNativeTitleTranslation;

  if (window.jQuery) window.jQuery(window).on('action:ajaxify.end action:topics.loaded action:category.loaded action:user.loaded', () => setTimeout(boot, 80));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [250, 900, 1800].forEach(ms => setTimeout(boot, ms));
})();
