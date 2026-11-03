/* In-extension locale switcher. One extension with ten localized interfaces. */
(() => {
  const KEY = 'quguangouUILanguageV1';
  const locales = {
    'zh-CN': {label:'简体中文',short:'简',path:'popup.html'},
    'zh-TW': {label:'繁體中文',short:'繁',path:'l10n/zh-TW/popup.html'},
    en: {label:'English',short:'EN',path:'l10n/en/popup.html'},
    ja: {label:'日本語',short:'JP',path:'l10n/ja/popup.html'},
    ko: {label:'한국어',short:'KO',path:'l10n/ko/popup.html'},
    fr: {label:'Français',short:'FR',path:'l10n/fr/popup.html'},
    es: {label:'Español',short:'ES',path:'l10n/es/popup.html'},
    ms: {label:'Bahasa Melayu',short:'MS',path:'l10n/ms/popup.html'},
    vi: {label:'Tiếng Việt',short:'VI',path:'l10n/vi/popup.html'},
    id: {label:'Bahasa Indonesia',short:'ID',path:'l10n/id/popup.html'}
  };
  const current = Object.hasOwn(locales,document.documentElement.lang)
    ? document.documentElement.lang : 'zh-CN';
  const titles = {
    'zh-CN':'切换语言','zh-TW':'切換語言',en:'Change language',
    ja:'言語を変更',ko:'언어 변경',fr:'Changer de langue',es:'Cambiar idioma',
    ms:'Tukar bahasa',vi:'Đổi ngôn ngữ',id:'Ganti bahasa'
  };
  function openLocale(locale) {
    location.replace(chrome.runtime.getURL(locales[locale].path));
  }
  function init() {
    const header = document.querySelector('header.brand');
    if (!header || header.querySelector('.locale-switcher')) return;
    const container = document.createElement('div');
    container.className = 'locale-switcher';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'locale-trigger';
    trigger.setAttribute('aria-label', titles[current]);
    trigger.setAttribute('title', titles[current]);
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></svg><span class="locale-current"></span>';
    trigger.querySelector('.locale-current').textContent = locales[current].short;
    const menu = document.createElement('div');
    menu.className = 'locale-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    for (const [code, item] of Object.entries(locales)) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'locale-option';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', code === current ? 'true' : 'false');
      option.textContent = item.label + (code === current ? ' ✓' : '');
      option.addEventListener('click', async () => {
        if (code === current) { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); return; }
        trigger.disabled = true;
        try {
          await chrome.storage.local.set({ [KEY]: code });
          openLocale(code);
        } catch (error) {
          trigger.disabled = false;
          console.warn('[quguangou] Could not save language', error);
        }
      });
      menu.appendChild(option);
    }
    const toggle = (open) => {
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const menuOptions = [...menu.querySelectorAll('.locale-option')];
    const focusMenuItem = (index) => {
      if (!menuOptions.length) return;
      const item = menuOptions[(index + menuOptions.length) % menuOptions.length];
      item.focus();
      item.scrollIntoView({block:'nearest'});
    };
    trigger.addEventListener('click', () => {
      const opening = menu.hidden;
      toggle(opening);
      if (opening) focusMenuItem(0);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        toggle(true);
        focusMenuItem(event.key === 'ArrowDown' ? 0 : menuOptions.length - 1);
      }
    });
    menu.addEventListener('keydown', event => {
      const index = menuOptions.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' ||
          event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const next = event.key === 'Home' ? 0
          : event.key === 'End' ? menuOptions.length - 1
          : index + (event.key === 'ArrowDown' ? 1 : -1);
        focusMenuItem(next);
      }
    });
    document.addEventListener('click', (event) => {
      if (!container.contains(event.target)) toggle(false);
    });
    document.addEventListener('keydown', (event) => {
      if (menu.hidden) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        toggle(false);
        trigger.focus();
      } else if (event.key === 'Tab') {
        toggle(false);
      }
    });
    container.append(trigger, menu);
    header.appendChild(container);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();