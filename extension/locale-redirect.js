/* Choose the saved language, otherwise follow the browser UI language. */
(() => {
  const KEY = 'quguangouUILanguageV1';
  document.documentElement.style.visibility = 'hidden';
  const browserLocale = (() => {
    try { return chrome.i18n.getUILanguage() || navigator.language || 'zh-CN'; }
    catch { return navigator.language || 'zh-CN'; }
  })();
  const fallback = /^(zh[-_](?:TW|HK|MO|Hant))/i.test(browserLocale)
    ? 'zh-TW'
    : /^ja(?:[-_]|$)/i.test(browserLocale) ? 'ja'
    : /^ko(?:[-_]|$)/i.test(browserLocale) ? 'ko'
    : /^fr(?:[-_]|$)/i.test(browserLocale) ? 'fr'
    : /^es(?:[-_]|$)/i.test(browserLocale) ? 'es'
    : /^ms(?:[-_]|$)/i.test(browserLocale) ? 'ms'
    : /^vi(?:[-_]|$)/i.test(browserLocale) ? 'vi'
    : /^id(?:[-_]|$)/i.test(browserLocale) ? 'id'
    : /^en(?:[-_]|$)/i.test(browserLocale) ? 'en'
    : /^zh(?:[-_]|$)/i.test(browserLocale) ? 'zh-CN'
    : 'en';
  const routes = {
    'zh-CN':'popup.html','zh-TW':'l10n/zh-TW/popup.html',
    en:'l10n/en/popup.html',ja:'l10n/ja/popup.html',
    ko:'l10n/ko/popup.html',fr:'l10n/fr/popup.html',
    es:'l10n/es/popup.html',
    ms:'l10n/ms/popup.html',vi:'l10n/vi/popup.html',
    id:'l10n/id/popup.html'
  };
  (async () => {
    let selected = fallback;
    try {
      const saved = await chrome.storage.local.get(KEY);
      if (Object.hasOwn(routes, saved?.[KEY])) selected = saved[KEY];
    } catch (error) { console.warn('[quguangou] Language preference unavailable', error); }
    if (selected !== 'zh-CN') {
      location.replace(chrome.runtime.getURL(routes[selected]));
    } else {
      document.documentElement.style.visibility = '';
    }
  })();
})();
