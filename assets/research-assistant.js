(() => {
  'use strict';

  const widget = document.querySelector('.research-widget');
  if (!widget) return;
  const panel = widget.querySelector('.research-guide');
  const launcher = widget.querySelector('.research-launcher');
  const close = panel.querySelector('[data-close]');
  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const log = panel.querySelector('[role="log"]');
  const conversation = panel.querySelector('.research-guide__conversation');
  const status = panel.querySelector('[role="status"]');
  const buttons = [...panel.querySelectorAll('.research-guide__suggestions button, .research-guide__actions button')];
  const history = [];
  let pending = false;

  function updateViewport() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    widget.style.setProperty('--research-viewport-height', `${viewport.height}px`);
    widget.style.setProperty('--research-keyboard-offset', `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`);
  }

  function openPanel() {
    updateViewport();
    panel.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute('aria-expanded', 'true');
    input.focus({ preventScroll: true });
  }

  function closePanel() {
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus({ preventScroll: true });
  }

  function appendMessage(role, text, sources = []) {
    const message = document.createElement('div');
    message.className = `research-guide__message research-guide__message--${role}`;
    const author = document.createElement('strong');
    author.textContent = role === 'user' ? 'You' : 'Research guide · AI';
    const content = document.createElement('p');
    content.textContent = text;
    message.append(author, content);
    if (sources.length) {
      const list = document.createElement('ul');
      list.className = 'research-guide__sources';
      list.setAttribute('aria-label', 'Sources');
      sources.forEach(source => {
        if (!source || typeof source.url !== 'string' || typeof source.title !== 'string') return;
        let url;
        try { url = new URL(source.url); } catch { return; }
        if (url.protocol !== 'https:' || url.username || url.password) return;
        if (!['drfalco.github.io', 'doi.org'].includes(url.hostname)) return;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = url.href;
        link.textContent = source.title;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        list.append(item);
      });
      if (list.childElementCount) message.append(list);
    }
    log.append(message);
    conversation.scrollTop = conversation.scrollHeight;
    return message;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (pending || !question || question.length > 1000 || !form.reportValidity()) return;
    pending = true;
    buttons.forEach(button => { button.disabled = true; });
    input.readOnly = true;
    log.setAttribute('aria-busy', 'true');
    status.textContent = 'Reading the research notes…';
    const userMessage = appendMessage('user', question);
    input.value = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch(panel.dataset.endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history.slice(-4), { role: 'user', content: question }] }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 429
          ? 'The guide has reached its usage limit. Please try again later, or use the publications and email links.'
          : 'The guide is temporarily unavailable. Please try again later, or use the publications and email links.');
      }
      const data = await response.json();
      if (typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 3000 || !Array.isArray(data.sources)) {
        throw new Error('The guide could not read the reply. Please try again.');
      }
      appendMessage('assistant', data.reply, data.sources);
      history.push({ role: 'user', content: question }, { role: 'assistant', content: data.reply });
      if (history.length > 4) history.splice(0, history.length - 4);
      status.textContent = '';
    } catch (error) {
      userMessage.remove();
      input.value = question;
      status.textContent = error.name === 'AbortError'
        ? 'The guide took too long to reply. Please try again later.'
        : error instanceof TypeError
          ? 'The guide could not connect. Please try again later, or use the publications and email links.'
          : error.message;
    } finally {
      clearTimeout(timeout);
      pending = false;
      input.readOnly = false;
      buttons.forEach(button => { button.disabled = false; });
      log.setAttribute('aria-busy', 'false');
      if (!panel.hidden) input.focus({ preventScroll: true });
    }
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  panel.querySelectorAll('[data-question]').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.question;
      form.requestSubmit();
    });
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    if (pending) return;
    history.length = 0;
    log.replaceChildren();
    input.value = '';
    status.textContent = 'Conversation cleared.';
    input.focus();
  });
  launcher.addEventListener('click', openPanel);
  close.addEventListener('click', closePanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !panel.hidden) {
      event.preventDefault();
      closePanel();
    }
  });
  const openFromHash = () => {
    if (['#research-assistant', '#research-guide-preview'].includes(location.hash)) openPanel();
  };
  window.addEventListener('hashchange', openFromHash);
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  widget.hidden = false;
  document.body.classList.add('research-chat-ready');
  openFromHash();
})();
