/* global socket, app */
'use strict';

(() => {
  const API = `${(window.config && window.config.relative_path) || ''}/api/admin/plugins/haa9-experience/settings`;

  async function request(url, options = {}) {
    const res = await fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': window.config && (window.config.csrf_token || window.config.csrfToken) || '',
        'x-requested-with': 'XMLHttpRequest'
      }
    }, options));
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  function setForm(data) {
    Object.keys(data || {}).forEach(key => {
      const el = document.querySelector(`[name="${key}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = data[key] === true || data[key] === 'on' || data[key] === 'true' || data[key] === '1';
      else el.value = data[key];
    });
  }

  function getForm(form) {
    const out = {};
    Array.from(form.elements).forEach(el => {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : el.value;
    });
    return out;
  }

  async function init() {
    const form = document.getElementById('haa9-settings-form');
    if (!form) return;
    try {
      setForm(await request(API));
    } catch (error) {
      console.warn('[HAA9 ACP] settings load failed:', error);
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await request(API, { method: 'POST', body: JSON.stringify(getForm(form)) });
        if (app && app.alertSuccess) app.alertSuccess('[[haa9-experience:admin.saved]]');
      } catch (error) {
        if (app && app.alertError) app.alertError('[[haa9-experience:admin.save_failed]]');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  window.addEventListener('action:ajaxify.end', init);
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
