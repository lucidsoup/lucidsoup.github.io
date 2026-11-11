/* Injects the two things every page should have and none of them should have
   to write out: a way back to the soup, and a way past the chrome.

   The way back used to point at the gallery, because the gallery was the only
   index. It points at the bowl on the front page now: the labyrinth is a place
   you can go, not the hallway every page has to be reached through. */
(function () {
    'use strict';
    try {
        if (window.top !== window.self) return;              // framed
    } catch (e) { return; }                                   // cross-origin frame

    /* ---- the way back ---------------------------------------------------
       Skipped on a page that already has its own, and on the gallery, whose
       HUD carries one. */
    function addReturn() {
        if (document.body.hasAttribute('data-lucid-no-return')) return;
        if (/\/gallery\.html$/.test(location.pathname)) return;
        if (document.querySelector('.lucid-return')) return;
        var a = document.createElement('a');
        a.className = 'lucid-return';
        a.href = '/';
        a.textContent = 'the soup';
        a.setAttribute('aria-label', 'Back to the soup');
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

    /* ---- the way past it ------------------------------------------------
       This one runs everywhere, including the two pages that opt out of the
       way back, because a keyboard on the front page has the most chrome to
       walk past, not the least.

       Most of this site predates <main>, so the target is whatever the page
       actually uses as its content root, in the order a page is likely to
       have one. tabindex="-1" is what lets focus land on a div at all; it
       does not put the div in the tab order. */
    function addSkip() {
        if (document.querySelector('.lucid-skip')) return;
        var target = document.querySelector(
            'main, [role="main"], #content-wrapper, #content, #main');
        if (!target) {
            var h = document.querySelector('h1');
            target = (h && h.closest('section, article, header, div')) ||
                     document.querySelector('section, article');
        }
        if (!target) return;                       // nothing worth skipping to
        if (!target.id) target.id = 'lucid-main';
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');

        var s = document.createElement('a');
        s.className = 'lucid-skip';
        s.href = '#' + target.id;
        s.textContent = 'skip to content';
        // Clicking a fragment moves the scroll but not always the focus, and
        // the focus is the whole point of the link.
        s.addEventListener('click', function () {
            setTimeout(function () { target.focus({ preventScroll: false }); }, 0);
        });
        document.body.insertBefore(s, document.body.firstChild);
    }

    function go() { addReturn(); addSkip(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go);
    } else {
        go();
    }
})();
