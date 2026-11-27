    (function portfolio() {
        'use strict';
        var body = document.getElementById('portfolio-body');
        if (!body) return;

        function esc(v) {
            return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
                return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
            });
        }

        // Where a work actually plays. A direct URL opens in the lightbox the site
        // already has; a Vimeo or YouTube id opens on their site instead, because
        // embedding either would drag a third-party player into the page.
        function target(work) {
            if (work.full) return { kind: 'file', href: work.full };
            if (work.vimeo) return { kind: 'link', href: 'https://vimeo.com/' + encodeURIComponent(work.vimeo) };
            if (work.youtube) return { kind: 'link', href: 'https://youtu.be/' + encodeURIComponent(work.youtube) };
            return null;
        }

        function card(work) {
            var dest = target(work);
            var media = work.preview
                ? '<video muted playsinline loop preload="metadata"' +
                  (work.poster ? ' poster="' + esc(work.poster) + '"' : '') + '>' +
                      '<source src="' + esc(work.preview) + '" type="video/mp4">' +
                  '</video>'
                : (work.poster
                    ? '<img src="' + esc(work.poster) + '" alt="" loading="lazy">'
                    : '<div class="card-empty">✦</div>');

            return '<div class="portfolio-item' + (work.portrait ? ' portrait' : '') + '"' +
                       (dest && dest.kind === 'file' ? ' data-src="' + esc(dest.href) + '"' : '') +
                       (dest && dest.kind === 'link' ? ' data-href="' + esc(dest.href) + '"' : '') + '>' +
                       media +
                       (dest ? '<div class="play-icon"></div>' : '') +
                       '<div class="overlay"><div class="overlay-text">' +
                           '<h4>' + esc(work.title || 'Untitled') + '</h4>' +
                           (work.blurb ? '<p>' + esc(work.blurb) + '</p>' : '') +
                       '</div></div>' +
                   '</div>';
        }

        function render(data) {
            var works = (data.works || []).filter(function (w) { return w && (w.preview || w.poster || w.full || w.vimeo || w.youtube); });
            if (!works.length) {
                body.innerHTML = '<div class="pane-empty">No work published yet.</div>';
                return;
            }
            var cats = data.categories || [];
            var html = '';
            cats.forEach(function (cat) {
                var mine = works.filter(function (w) { return w.category === cat.id; });
                if (!mine.length) return;
                html += '<div class="portfolio-category"><h3>' + esc(cat.name) + '</h3>' +
                        '<div class="portfolio-grid">' + mine.map(card).join('') + '</div></div>';
            });
            var known = cats.map(function (c) { return c.id; });
            var rest = works.filter(function (w) { return known.indexOf(w.category) === -1; });
            if (rest.length) {
                html += '<div class="portfolio-category"><h3>Other</h3>' +
                        '<div class="portfolio-grid">' + rest.map(card).join('') + '</div></div>';
            }
            body.innerHTML = html;
            // The page's own hover / tap / lightbox wiring binds off this event.
            window.dispatchEvent(new CustomEvent('lucid:portfolio-ready', { detail: { works: works } }));
        }

        window.lucidMedia()
            .then(render)
            .catch(function (err) {
                console.warn('[Portfolio] could not load media.json:', err.message);
                var sec = document.getElementById('portfolio');
                if (sec) sec.style.display = 'none';
            });
    })();
    
