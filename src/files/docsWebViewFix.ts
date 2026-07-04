/**
 * Fixes a clipped title in the cozy-bar (the top bar cozy injects into every web
 * app via cozy-bar) when a docs editor is opened on a narrow (foldable cover)
 * viewport.
 *
 * The bar has a fixed ~48px height and shows the document title as an `<h6>` (MUI
 * Typography). A long title (e.g. the auto-generated `New Docs <timestamp>`) wraps
 * onto two lines (~55px) and, because the bar centres its content, the top of the
 * first line overflows ABOVE the fixed bar and is clipped by the viewport edge.
 * Growing the bar does not help (the overflow is upward), so we force the title
 * onto a single ellipsised line instead — which fits the bar height and cannot
 * clip.
 *
 * Injected into the Docs WebView (`injectedJavaScript`): it targets the cozy-bar
 * title `<h6>` structurally (works for any title, not only the auto-generated
 * name), sets `white-space: nowrap; text-overflow: ellipsis`, and clears
 * `min-width` up the flex ancestor chain so the ellipsis actually takes effect. A
 * MutationObserver re-applies it if the bar re-renders; a per-element marker keeps
 * repeat passes cheap. Safe no-op when no cozy-bar is present (non-docs pages).
 */
export const DOCS_HEADER_FIX = `
(function () {
  function fix() {
    var bar = document.querySelector('.coz-bar-wrapper');
    if (!bar) return;
    var titles = bar.querySelectorAll('h6');
    for (var i = 0; i < titles.length; i++) {
      var title = titles[i];
      if (title.getAttribute('data-twk-title-fix')) continue;
      title.setAttribute('data-twk-title-fix', '1');
      title.style.setProperty('white-space', 'nowrap', 'important');
      title.style.setProperty('overflow', 'hidden', 'important');
      title.style.setProperty('text-overflow', 'ellipsis', 'important');
      // Flex items only shrink below their content width when min-width is 0.
      var el = title;
      for (var d = 0; d < 8 && el && el !== bar.parentElement; d++) {
        el.style.setProperty('min-width', '0', 'important');
        el = el.parentElement;
      }
    }
  }
  fix();
  try { new MutationObserver(fix).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();
true;
`
