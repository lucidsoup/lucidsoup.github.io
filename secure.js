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
       Enforce HTTPS is on now, so GitHub answers plain http with a 301 to
       https at the edge and this rarely fires. It is kept because it costs a
       few bytes, because it still works if that setting is ever turned back
       off, and because it covers the site wherever else it is served from.

       Neither this nor the 301 closes the first request. That one still
       leaves the browser in cleartext, and anyone on the wire can answer it
       with their own page rather than the redirect. Only HSTS closes it, and
       GitHub Pages does not send Strict-Transport-Security on a custom
       domain — measured, not assumed. Closing it means a proxy in front that
       can set headers. */
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
