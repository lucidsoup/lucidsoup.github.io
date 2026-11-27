/* ===========================================================================
   secure.js — the two protections this host cannot be asked to provide.

   Loaded first, and deliberately not deferred: both jobs below have to happen
   before the page is worth anything to an attacker, not after it has painted.
   It is small enough that the blocking cost is a round trip already spent on
   the stylesheet next to it.

   Neither of these is the real fix. Both exist because GitHub Pages serves no
   custom headers, so the headers that would do this properly — Strict-
   Transport-Security and Content-Security-Policy: frame-ancestors — have
   nowhere to go. A <meta> CSP cannot carry frame-ancestors: the specification
   says user agents must ignore it there, so writing it in one would look like
   a defence and be nothing.
   =========================================================================== */
(function () {
    'use strict';

    var loc = window.location;
    var local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' ||
                loc.hostname === '::1' || loc.hostname === '[::1]' || loc.hostname === '';

    /* ---- 1. plain HTTP → HTTPS -------------------------------------------
       As of writing, http://www.lucidsoup.com/ answers 200 in cleartext with
       no redirect and no HSTS, because "Enforce HTTPS" is off in
       Settings → Pages. That includes /store/admin.html, which is where an
       editor types their passphrase and where a fourteen-day session token
       lives in localStorage afterwards.

       This closes the window from the second request onwards. It cannot close
       the first one: that request still leaves the browser in the clear, and
       whoever is on the wire can answer it with their own page instead of
       this file and never run this line. Switching on Enforce HTTPS is what
       actually fixes it, and then HSTS stops even the first request. */
    if (loc.protocol === 'http:' && !local) {
        loc.replace('https://' + loc.host + loc.pathname + loc.search + loc.hash);
        return;
    }

    /* ---- 2. frame-busting, where a page asks for it ----------------------
       Opt in with <html data-no-frame>. Only the two editor pages do: an
       editor stays signed in for a fortnight, so a page that can frame theirs
       can line a click up over a control and take it. Nothing else here is
       worth framing, and the shader pages are the sort of thing somebody may
       legitimately want to embed, so this is not blanket.

       Hide first, then try to escape. The order matters: navigating away can
       be refused silently by a sandboxed frame, and if it is, a visible page
       is still a clickable one. So the document goes away whether or not the
       escape works, and says why. */
    var html = document.documentElement;
    if (html.hasAttribute('data-no-frame')) {
        var framed;
        try {
            framed = window.top !== window.self;
        } catch (e) {
            // Reading window.top across origins throws; that it threw is
            // itself the answer.
            framed = true;
        }
        if (framed) {
            html.style.display = 'none';
            try {
                window.top.location = window.self.location.href;
            } catch (e2) { /* sandboxed: nothing to do but stay hidden */ }
            document.addEventListener('DOMContentLoaded', function () {
                var href = loc.href;
                document.body.textContent = '';
                var p = document.createElement('p');
                p.style.cssText = 'font:14px system-ui,sans-serif;color:#ebe8ff;' +
                    'background:#05010c;margin:0;padding:24px;line-height:1.6';
                p.appendChild(document.createTextNode('This page will not run inside another site. Open it directly: '));
                var a = document.createElement('a');
                a.href = href;
                a.target = '_top';
                a.rel = 'noopener';
                a.style.color = '#00ffd5';
                a.appendChild(document.createTextNode(href));
                p.appendChild(a);
                document.body.appendChild(p);
                html.style.display = '';
            });
        }
    }
})();
