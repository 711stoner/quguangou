(() => {
 const original=window.QGDLocalizeError;
 window.QGDLocalizeError = input => {
   const en = typeof original==='function' ? original(input) : String(input??'');
   if (window.QGDTranslateUI) {
     const translated=window.QGDTranslateUI(en);
     if (translated!==en)return translated;
   }
   return typeof window.QGDTranslateError==='function' ? window.QGDTranslateError(en) : en;
 };
})();
