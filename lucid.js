/* Injects the shared return-to-the-gallery link. One script tag per page beats
   six hand-written copies that drift apart.

   Skipped in three cases: inside an iframe (DrumSeek is embedded in a section
   and would show the bar inside the frame), on a page that already has its own
   way back, and on the gallery itself. */
(function () {
    'use strict';
    try {
        if (window.top !== window.self) return;              // framed
    } catch (e) { return; }                                   // cross-origin frame
    if (document.body && document.body.hasAttribute('data-lucid-no-return')) return;
    if (/\/gallery\.html$/.test(location.pathname)) return;

    function add() {
        if (document.querySelector('.lucid-return')) return;
        var a = document.createElement('a');
        a.className = 'lucid-return';
        a.href = '/gallery.html';
        a.textContent = 'the gallery';
        a.setAttribute('aria-label', 'Back to the gallery');
        document.body.appendChild(a);
        // Inline style always beats a stylesheet, so the fallback goes on only
        // when lucid.css did not load (its rule makes the link position:fixed).
        // Applied unconditionally, it silently overrode the stylesheet's phone
        // sizing and its hover and focus states on every page.
        if (getComputedStyle(a).position !== 'fixed') {
            a.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483000;' +
                'padding:8px 12px;border:1px solid rgba(139,108,245,.40);border-radius:3px;' +
                'background:rgba(5,5,10,.82);color:#8b6cf5;text-decoration:none;' +
                'font:10px ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase';
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', add);
    } else {
        add();
    }
})();
