/* Reusable localized end-task confirmation; never initiates the destructive operation. */
(() => {
  let active = null;
  window.QGDConfirmEndTask = () => {
    if (active) return active;
    const panel = document.getElementById('endTaskConfirmPanel');
    if (!panel) return Promise.resolve(false);
    const confirm = panel.querySelector('[data-end-confirm]');
    const cancel = panel.querySelector('button.secondary[data-end-cancel]');
    const closes = panel.querySelectorAll('[data-end-cancel], [data-end-backdrop]');
    const previouslyFocused = document.activeElement;
    const controller = new AbortController();
    const { signal } = controller;
    active = new Promise(resolve => {
      const settle = accepted => {
        panel.hidden = true;
        controller.abort();
        active = null;
        if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }
        resolve(accepted);
      };
      confirm.addEventListener('click', () => settle(true), {signal});
      closes.forEach(el => el.addEventListener('click', () => settle(false), {signal}));
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          settle(false);
        } else if (event.key === 'Tab') {
          const tabbable = [...panel.querySelectorAll('button:not([disabled])')];
          const index = tabbable.indexOf(document.activeElement);
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            tabbable[tabbable.length - 1]?.focus();
          } else if (!event.shiftKey && index === tabbable.length - 1) {
            event.preventDefault();
            tabbable[0]?.focus();
          }
        }
      }, {signal});
      panel.hidden = false;
      cancel.focus();
    });
    return active;
  };
})();