/**
 * Inline script run in <head> before first paint so the saved theme and the
 * reduce-transparency override apply without a flash. Keys must match theme-provider.tsx.
 */
export const THEME_KEY = 'athleit-theme';
export const REDUCE_TRANSPARENCY_KEY = 'athleit-reduce-transparency';

export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')d.dataset.theme=t;if(localStorage.getItem('${REDUCE_TRANSPARENCY_KEY}')==='true')d.dataset.reduceTransparency='true';}catch(e){}})();`;
