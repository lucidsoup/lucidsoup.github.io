/* Injects the three things every page should have and none of them should
   have to write out: a way back to the soup, a menu of everywhere else, and
   a way past both.

   The way back used to point at the gallery, because the gallery was the only
   index. It points at the bowl on the front page now: the labyrinth is a place
   you can go, not the hallway every page has to be reached through. */
(function () {
    'use strict';
    try {
        if (window.top !== window.self) return;              // framed
    } catch (e) { return; }                                   // cross-origin frame

    /* ---- the corner -----------------------------------------------------
       The way back and the menu button share one row, so that neither has to
       guess where the other is.

       A page with a header bar of its own can mark an element with
       data-lucid-chrome-slot and have the controls put inside it instead: on
       the front page a fixed button in the corner lands on top of the
       masthead, which is the thing a fixed corner is supposed to avoid.
       Everywhere else the corner is the corner. */
    function chromeHost() {
        var slot = document.querySelector('[data-lucid-chrome-slot]');
        if (slot) return slot;
        var c = document.querySelector('.lucid-chrome');
        if (c) return c;
        c = document.createElement('div');
        c.className = 'lucid-chrome';
        document.body.appendChild(c);
        // Inline style always beats a stylesheet, so this goes on only when
        // lucid.css did not load. Applied unconditionally it would silently
        // override the stylesheet's phone sizing and its focus states.
        if (getComputedStyle(c).position !== 'fixed') {
            c.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483000;' +
                'display:flex;gap:8px;align-items:center';
        }
        return c;
    }

    /* The way back. Skipped on a page that already has its own, and on the
       gallery, whose HUD carries one. */
    function addReturn() {
        if (document.body.hasAttribute('data-lucid-no-return')) return;
        if (/\/gallery\.html$/.test(location.pathname)) return;
        if (document.querySelector('.lucid-return')) return;
        var a = document.createElement('a');
        a.className = 'lucid-return';
        a.href = '/';
        a.textContent = 'the soup';
        a.setAttribute('aria-label', 'Back to the soup');
        // Appended, and addReturn runs before addMenu, so the row reads
        // [the soup] [menu] without either of them naming the other.
        chromeHost().appendChild(a);
        if (!chromeHost().style.cssText) return;    // the stylesheet is here
        a.style.cssText = 'padding:8px 12px;border:1px solid rgba(139,108,245,.40);' +
            'border-radius:3px;background:rgba(5,5,10,.82);color:#8b6cf5;' +
            'text-decoration:none;font:10px ui-monospace,Menlo,monospace;' +
            'letter-spacing:.18em;text-transform:uppercase';
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

    /* ---- the menu -------------------------------------------------------
       Until now the only index of this site was the bowl on the front page
       and the Stack, and both of them are places rather than lists: the bowl
       is eleven moving targets you have to be on the front page to use, and
       the Stack is a tower you turn. They are the best part of the site and
       neither is a way to get to the contact page in one go from the SP-404
       converter.

       So this is the plain one. It is in the same corner on every page, it
       says which of them you are looking at, and it is a list of links under
       headings in a navigation landmark — which is the boring answer and the
       one that works with a screen reader, a keyboard, a thumb, and a
       stylesheet that failed to load. No keyboard shortcut opens it: a
       single printing character claimed for a whole document is a trap for
       anyone driving by voice, and Tab reaches it in one step anyway.

       The Stack is still on it. It is the long way round, and it says so. */
    var MENU = [
        ['Look', [
            ['Visuals',            '/#portfolio',        'the reel'],
            ['Shaders',            '/#shader-library',   'live, in the page'],
            ['The Gallery',        '/gallery.html',      'the long way round'],
            ['Watchlist',          '/watch.html',        'films worth stealing from'],
            ['Soup Lab',            '/store/',            'the store \u2014 a demo of every plugin']
        ]],
        ['Run', [
            ['Visual Playground',  '/playground.html',   'audio → visuals'],
            ['SynthSoup',          '/synthsoup/webapp/play/', 'play it in the browser'],
            ['BlackboxFX',         '/blackboxfx/',       'the control surface'],
            ['DrumSeek',           '/#drumseek',         'the sequencer'],
            ['Plugin Host',        '/plugins.html',      'clap · vst3'],
            ['SP-404 Converter',   '/sp404.html',        'samples in, kit out']
        ]],
        ['Read', [
            ['SynthSoup',          '/#synthsoup',        'the synth, and its firmware'],
            ['BlackboxFX',         '/#blackboxfx',       'what the box is'],
            ['About',              '/#about',            ''],
            ['Contact',            '/#contact',          '']
        ]]
    ];

    function esc(t) {
        return String(t).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* Whether a menu entry points at the page already being looked at. The
       hash matters: /#about and /#contact are different destinations that
       share a path, and marking both of them current would be a lie. */
    function isHere(href) {
        var a = document.createElement('a');
        a.href = href;
        if (a.host !== location.host) return false;
        var mine = location.pathname.replace(/\/index\.html$/, '/');
        var theirs = a.pathname.replace(/\/index\.html$/, '/');
        if (mine !== theirs) return false;
        if (a.hash) return a.hash === location.hash;
        return !location.hash || mine !== '/';
    }

    var menuBtn = null, menuPanel = null, menuBuilt = false;

    function buildMenu() {
        if (menuBuilt) return;
        menuBuilt = true;
        // No <nav> element inside: the panel itself is the landmark. A page
        // that styles the bare `nav` selector for its own masthead — and the
        // front page does, as position:fixed across the top — would otherwise
        // capture this one and tear the menu out of its own box. Every rule
        // below is written against .lucid-menu for the same reason.
        var html = '';
        // Most pages carry the way back as a chip beside this button, and
        // repeating it as the first line of the menu would be two controls
        // for one destination. The front page and the gallery suppress that
        // chip, and there the menu is the only place home can be.
        if (!document.querySelector('.lucid-return')) {
            html += '<div class="lucid-menu-group"><ul aria-label="Home"><li><a href="/"' +
                (isHere('/') ? ' aria-current="page"' : '') +
                '><span>The Soup</span><small>the bowl, and everything in it</small></a></li></ul></div>';
        }
        MENU.forEach(function (group, gi) {
            var hid = 'lucid-mg-' + gi;
            html += '<div class="lucid-menu-group">' +
                '<h2 id="' + hid + '">' + esc(group[0]) + '</h2>' +
                '<ul aria-labelledby="' + hid + '">';
            group[1].forEach(function (item) {
                var here = isHere(item[1]);
                html += '<li><a href="' + esc(item[1]) + '"' +
                    (here ? ' aria-current="page"' : '') + '>' +
                    '<span>' + esc(item[0]) + '</span>' +
                    (item[2] ? '<small>' + esc(item[2]) + '</small>' : '') + '</a></li>';
            });
            html += '</ul></div>';
        });
        // The Stack is only offered where it is actually loaded; a menu item
        // that does nothing is worse than one that is not there.
        if (window.lucidStack) {
            html += '<div class="lucid-menu-group lucid-menu-aside">' +
                '<ul aria-label="The long way"><li><button type="button" class="lucid-menu-stack">' +
                '<span>The Stack</span><small>every page, as a tower</small></button></li></ul></div>';
        }
        menuPanel.innerHTML = html;

        var stack = menuPanel.querySelector('.lucid-menu-stack');
        if (stack) {
            stack.addEventListener('click', function () {
                closeMenu(false);
                window.lucidStack.open(menuBtn);
            });
        }
        // A link to a section of the front page from the front page changes
        // nothing but the hash, so nothing closes the menu unless this does.
        menuPanel.addEventListener('click', function (e) {
            if (e.target.closest('a')) closeMenu(false);
        });
    }

    function menuItems() {
        return Array.prototype.slice.call(
            menuPanel.querySelectorAll('a[href], button'));
    }

    /* Where you are can change without the page reloading — the front page
       shows its sections by hash — so this is recomputed every time the menu
       is opened rather than baked in when it was built. */
    function markCurrent() {
        var links = menuPanel.querySelectorAll('a[href]');
        for (var i = 0; i < links.length; i++) {
            if (isHere(links[i].getAttribute('href'))) links[i].setAttribute('aria-current', 'page');
            else links[i].removeAttribute('aria-current');
        }
    }

    /* The button is in the corner on most pages and inside the masthead on
       the front page, so where the panel hangs from is measured rather than
       written down. */
    function placeMenu() {
        if (!menuPanel || menuPanel.hidden) return;
        var r = menuBtn.getBoundingClientRect();
        menuPanel.style.top = Math.round(r.bottom + 8) + 'px';
    }

    function openMenu() {
        buildMenu();
        markCurrent();
        menuPanel.hidden = false;
        placeMenu();
        menuBtn.setAttribute('aria-expanded', 'true');
        document.documentElement.classList.add('lucid-menu-open');
        var first = menuItems()[0];
        if (first) first.focus();
    }

    /* `back` returns focus to the button, which is right when the menu was
       dismissed (Escape, a click on the button) and wrong when it was closed
       by following a link out of it. */
    function closeMenu(back) {
        if (!menuPanel || menuPanel.hidden) return;
        menuPanel.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
        document.documentElement.classList.remove('lucid-menu-open');
        if (back) menuBtn.focus();
    }

    function addMenu() {
        if (document.body.hasAttribute('data-lucid-no-menu')) return;
        if (document.querySelector('.lucid-menu-btn')) return;

        menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'lucid-menu-btn';
        menuBtn.id = 'lucid-menu-btn';
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-controls', 'lucid-menu');
        menuBtn.setAttribute('aria-haspopup', 'true');
        // The word is hidden on phones, where the icon is the whole button,
        // so the name cannot come from the text or it disappears with it.
        menuBtn.setAttribute('aria-label', 'Menu');
        menuBtn.innerHTML = '<span class="lucid-menu-ico" aria-hidden="true">' +
            '<i></i><i></i><i></i></span><span class="lucid-menu-word">menu</span>';

        menuPanel = document.createElement('div');
        menuPanel.className = 'lucid-menu';
        menuPanel.id = 'lucid-menu';
        menuPanel.hidden = true;
        menuPanel.setAttribute('role', 'navigation');
        menuPanel.setAttribute('aria-label', 'Site');

        // One fixed group in the corner, so the way back and the menu cannot
        // land on top of each other however narrow the screen gets.
        var chrome = chromeHost();
        chrome.appendChild(menuBtn);
        if (chrome.style.cssText) {
            // No stylesheet: give the button enough to still be a button.
            menuBtn.style.cssText = 'padding:8px 12px;border:1px solid rgba(139,108,245,.40);' +
                'border-radius:3px;background:rgba(5,5,10,.82);color:#8b6cf5;' +
                'font:10px ui-monospace,Menlo,monospace;letter-spacing:.18em;' +
                'text-transform:uppercase;cursor:pointer';
            menuPanel.style.cssText = 'position:fixed;top:52px;right:12px;z-index:2147483000;' +
                'max-width:min(92vw,340px);background:#07060f;color:#efe9ff;' +
                'border:1px solid rgba(139,108,245,.45);border-radius:4px;padding:10px 14px';
        }
        document.body.appendChild(menuPanel);

        menuBtn.addEventListener('click', function () {
            if (menuPanel.hidden) openMenu(); else closeMenu(true);
        });

        document.addEventListener('keydown', function (e) {
            if (menuPanel.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
            var items = menuItems();
            var at = items.indexOf(document.activeElement);
            if (at < 0) return;
            var to = -1;
            if (e.key === 'ArrowDown') to = (at + 1) % items.length;
            else if (e.key === 'ArrowUp') to = (at - 1 + items.length) % items.length;
            else if (e.key === 'Home') to = 0;
            else if (e.key === 'End') to = items.length - 1;
            if (to >= 0) { e.preventDefault(); items[to].focus(); }
        });

        // Tabbing out of the panel closes it rather than trapping focus: this
        // is a menu, not a dialogue, and nothing behind it is inert.
        document.addEventListener('focusin', function (e) {
            if (menuPanel.hidden) return;
            if (menuPanel.contains(e.target) || menuBtn.contains(e.target)) return;
            closeMenu(false);
        });
        document.addEventListener('pointerdown', function (e) {
            if (menuPanel.hidden) return;
            if (menuPanel.contains(e.target) || menuBtn.contains(e.target)) return;
            closeMenu(false);
        });
        window.addEventListener('hashchange', function () { closeMenu(false); });
        window.addEventListener('resize', placeMenu);
    }

    function go() { addReturn(); addMenu(); addSkip(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go);
    } else {
        go();
    }
})();
