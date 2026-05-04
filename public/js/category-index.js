/* global ajaxify */
'use strict';

(() => {
  const ROOT_ID = 'haa9-categories-root';

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    return path.indexOf(base) === 0 ? path : base + path;
  }

  function isCategoriesPage() {
    return document.body.classList.contains('page-categories') || /\/categories(?:\/|$|\?)/.test(location.pathname);
  }

  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeCategory(raw) {
    const cid = raw && (raw.cid || raw.id);
    const slug = raw && (raw.slug || raw.name || cid);
    return {
      cid: Number(cid || 0),
      name: String(raw && (raw.name || raw.title) || ''),
      description: String(raw && (raw.descriptionParsed || raw.description || '') || '').replace(/<[^>]+>/g, '').trim(),
      slug: String(slug || ''),
      link: rel(`/category/${encodeURIComponent(cid)}/${encodeURIComponent(String(slug || 'category'))}`),
      icon: String(raw && (raw.icon || raw.class || '') || ''),
      bgColor: String(raw && (raw.bgColor || raw.backgroundColor || '') || ''),
      color: String(raw && (raw.color || '') || ''),
      totalTopicCount: Number(raw && (raw.totalTopicCount || raw.topic_count || raw.topicCount || raw.topics) || 0),
      totalPostCount: Number(raw && (raw.totalPostCount || raw.post_count || raw.postCount || raw.posts) || 0),
      children: Array.isArray(raw && raw.children) ? raw.children.map(normalizeCategory).filter(item => item.cid) : [],
      cover: String(raw && (raw.haa9Cover || raw.cover || raw.image || '') || ''),
      teaser: raw && (raw.teaser || raw.latestTopic || null)
    };
  }

  function categoriesFromAjaxify() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const list = data.categories || data.categoryData || data.children || [];
    return Array.isArray(list) ? list.map(normalizeCategory).filter(item => item.cid) : [];
  }

  function categoryIcon(cat) {
    if (cat.icon && /^fa[srbl]?[\s-]/.test(cat.icon)) return `<i class="${escapeHtml(cat.icon)}"></i>`;
    if (cat.icon && cat.icon.includes('fa-')) return `<i class="fa ${escapeHtml(cat.icon)}"></i>`;
    return '<i class="fa-solid fa-comments"></i>';
  }

  function teaserText(teaser) {
    if (!teaser) return '';
    const title = teaser.title || teaser.topic && teaser.topic.title || teaser.content || teaser.text || '';
    return String(title || '').replace(/<[^>]+>/g, '').trim();
  }

  function card(cat, index) {
    const coverStyle = cat.cover ? ` style="--haa9-cover:url('${escapeHtml(cat.cover)}')"` : '';
    const accent = cat.bgColor || cat.color || (index % 3 === 0 ? '#2563eb' : (index % 3 === 1 ? '#ff4d8d' : '#14b8a6'));
    const children = cat.children.slice(0, 6).map(child => (
      `<a class="haa9-cat-child" href="${escapeHtml(child.link)}"><span>${escapeHtml(child.name)}</span><em>${Number(child.totalTopicCount || 0)}</em></a>`
    )).join('');
    const more = cat.children.length > 6 ? `<span class="haa9-cat-child haa9-cat-more">+${cat.children.length - 6}</span>` : '';
    const latest = teaserText(cat.teaser);
    return `<article class="haa9-cat-card${cat.cover ? ' has-cover' : ''}" data-cid="${cat.cid}" style="--haa9-accent:${escapeHtml(accent)}"${coverStyle}>
      <a class="haa9-cat-cover" href="${escapeHtml(cat.link)}" aria-label="${escapeHtml(cat.name)}"></a>
      <div class="haa9-cat-layer"></div>
      <div class="haa9-cat-content">
        <div class="haa9-cat-top">
          <span class="haa9-cat-icon">${categoryIcon(cat)}</span>
          <a class="haa9-cat-open" href="${escapeHtml(cat.link)}"><i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <h2 class="haa9-cat-title"><a href="${escapeHtml(cat.link)}">${escapeHtml(cat.name)}</a><button type="button" class="haa9-cat-translate" data-text="${escapeHtml(cat.name)}" title="翻译"><i class="fa-solid fa-language"></i></button></h2>
        <p class="haa9-cat-desc">${escapeHtml(cat.description || '进入板块查看更多内容')}</p>
        <div class="haa9-cat-stats"><span>${Number(cat.totalTopicCount || 0)} 主题</span><span>${Number(cat.totalPostCount || 0)} 帖子</span></div>
        ${children || more ? `<div class="haa9-cat-children">${children}${more}</div>` : ''}
        <div class="haa9-cat-latest">${latest ? `最新：${escapeHtml(latest)}` : '暂无最新内容'}</div>
      </div>
    </article>`;
  }

  async function translateText(text) {
    if (window.xTranslateText) return window.xTranslateText(text);
    const settings = JSON.parse(localStorage.getItem('x-topic-translate-settings') || '{}');
    const tl = String(settings.targetLang || navigator.language || 'zh').split('-')[0];
    const url = 'https://translate.googleapis.com/translate_a/single?' + new URLSearchParams({ client: 'gtx', sl: 'auto', tl, dt: 't', q: text }).toString();
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('translate failed');
    const data = await res.json();
    return (Array.isArray(data && data[0]) ? data[0] : []).map(item => item && item[0] ? item[0] : '').join('');
  }

  async function loadCategories() {
    let local = categoriesFromAjaxify();
    try {
      if (window.HAA9Plugin && typeof window.HAA9Plugin.fetchCategoryIndex === 'function') {
        const payload = await window.HAA9Plugin.fetchCategoryIndex();
        const remote = payload && Array.isArray(payload.categories) ? payload.categories.map(normalizeCategory).filter(item => item.cid) : [];
        if (remote.length) local = remote;
      }
    } catch (error) {
      console.warn('[HAA9] category index endpoint failed, using ajaxify data:', error);
    }
    return local;
  }

  function findMountPoint() {
    return document.querySelector('[component="categories"]') || document.querySelector('.categories') || document.querySelector('main') || document.querySelector('#content') || document.body;
  }

  function cleanup() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    document.body.classList.remove('haa9-categories-index-mode');
  }

  async function mount() {
    if (!isCategoriesPage()) return cleanup();
    const mountPoint = findMountPoint();
    if (!mountPoint) return;
    const categories = await loadCategories();
    if (!categories.length) return;

    cleanup();
    document.body.classList.add('haa9-categories-index-mode');
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.innerHTML = `<div class="haa9-cat-hero"><div><p>Explore</p><h1>[[haa9-experience:categories.title]]</h1><span>[[haa9-experience:categories.subtitle]]</span></div><div class="haa9-cat-hero-actions"><button type="button" class="haa9-cat-ai x-ai-settings-btn"><i class="fa-solid fa-sliders"></i><span>AI翻译</span></button><button type="button" class="haa9-cat-new"><i class="fa-solid fa-pen"></i><span>发布</span></button></div></div><div class="haa9-cat-grid">${categories.map(card).join('')}</div>`;
    mountPoint.parentNode.insertBefore(root, mountPoint);
    mountPoint.classList.add('haa9-native-categories-hidden');

    root.addEventListener('click', async event => {
      const translate = event.target.closest('.haa9-cat-translate');
      if (translate) {
        event.preventDefault();
        event.stopPropagation();
        const title = translate.closest('.haa9-cat-title');
        const link = title && title.querySelector('a');
        if (!link) return;
        if (translate.dataset.translated === '1') {
          link.textContent = translate.dataset.original || link.textContent;
          translate.dataset.translated = '0';
          return;
        }
        translate.classList.add('is-loading');
        try {
          translate.dataset.original = link.textContent;
          const out = await translateText(translate.dataset.text || link.textContent);
          if (out) {
            link.textContent = out;
            translate.dataset.translated = '1';
          }
        } catch (error) {
          console.warn('[HAA9] category title translate failed:', error);
        } finally {
          translate.classList.remove('is-loading');
        }
        return;
      }
      const ai = event.target.closest('.haa9-cat-ai');
      if (ai) {
        event.preventDefault();
        document.querySelector('.x-ai-settings-btn')?.click();
        return;
      }
      const post = event.target.closest('.haa9-cat-new');
      if (post) {
        event.preventDefault();
        const nativeButton = document.querySelector('[component="category/new-topic"], [component="composer/new_topic"], button[component="composer"]');
        if (nativeButton) nativeButton.click();
      }
    });
  }

  window.addEventListener('action:ajaxify.end', () => setTimeout(mount, 80));
  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
})();
