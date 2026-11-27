(function () {
    'use strict';

    var LANES = ['craft', 'psych', 'process'];
    var KINDS = ['film', 'series', 'short', 'doc'];
    var KIND_LABEL = { film: 'Film', series: 'Series', short: 'Short', doc: 'Documentary' };

    var data = null, items = [];
    var state = { q: '', lanes: [], kinds: [], sort: 'year-desc' };

    var elQ = document.getElementById('q');
    var elSort = document.getElementById('sort');
    var elList = document.getElementById('list');
    var elCount = document.getElementById('count');

    /* The whole collection is in memory, so searching is a filter over an
       array rather than a request. One pass, every keystroke, 112 items —
       there is no need for an index and no excuse for a spinner. */
    function haystack(it) {
        if (it._h) return it._h;
        it._h = [it.title, it.year, it.by || '', it.dp || '',
                 (it.tags || []).join(' '), it.why || '', (it.lanes || []).join(' '), it.kind]
                .join(' ').toLowerCase();
        return it._h;
    }

    function matches(it) {
        if (state.lanes.length && !state.lanes.some(function (l) { return (it.lanes || []).indexOf(l) >= 0; })) return false;
        if (state.kinds.length && state.kinds.indexOf(it.kind) < 0) return false;
        if (!state.q) return true;
        // Every word has to appear somewhere, in any order — so "doyle neon"
        // and "neon doyle" find the same thing.
        return state.q.split(/\s+/).every(function (w) { return haystack(it).indexOf(w) >= 0; });
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // Show the searcher where the match was, without letting the terms
    // themselves become markup.
    function hilite(s) {
        var out = esc(s);
        if (!state.q) return out;
        state.q.split(/\s+/).filter(Boolean).forEach(function (w) {
            var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
            out = out.replace(re, '\u0001$1\u0002');
        });
        return out.split('\u0001').join('<mark>').split('\u0002').join('</mark>');
    }

    function card(it) {
        var credits = [];
        if (it.by) credits.push('<span class="role">dir</span> ' + hilite(it.by));
        if (it.dp) credits.push('<span class="role">dp</span> ' + hilite(it.dp));
        return '<article class="item">' +
            '<h3>' + hilite(it.title) + '<span class="yr">' + it.year + '</span></h3>' +
            (credits.length ? '<p class="credits">' + credits.join(' &middot; ') + '</p>' : '') +
            (it.why ? '<p class="why">' + hilite(it.why) + '</p>' : '') +
            '<p class="meta">' +
              '<span class="kind">' + esc(KIND_LABEL[it.kind] || it.kind) + '</span>' +
              (it.lanes || []).map(function (l) {
                  return '<span class="lane ' + esc(l) + '">' + esc(l) + '</span>'; }).join('') +
              (it.tags || []).map(function (t) {
                  return '<button type="button" class="tag btn" data-tag="' + esc(t) + '">' + hilite(t) + '</button>'; }).join('') +
            '</p></article>';
    }

    function render() {
        var found = items.filter(matches);
        found.sort(function (a, b) {
            if (state.sort === 'title') return a.title.localeCompare(b.title);
            if (state.sort === 'year-asc') return a.year - b.year || a.title.localeCompare(b.title);
            return b.year - a.year || a.title.localeCompare(b.title);
        });

        elCount.innerHTML = found.length === items.length
            ? '<b>' + items.length + '</b> titles'
            : '<b>' + found.length + '</b> of ' + items.length +
              (state.q ? ' matching &ldquo;' + esc(state.q) + '&rdquo;' : '');

        elList.innerHTML = found.length
            ? found.map(card).join('')
            : '<div class="empty"><b>Nothing matches that.</b><br>' +
              'Try a director, a technique, or a word from a note &mdash; ' +
              '<em>slit-scan</em>, <em>technicolor</em>, <em>stop-motion</em>.</div>';

        // Deep-linkable, so a search can be sent to someone.
        var p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.lanes.length) p.set('lane', state.lanes.join(','));
        if (state.kinds.length) p.set('kind', state.kinds.join(','));
        if (state.sort !== 'year-desc') p.set('sort', state.sort);
        var qs = p.toString();
        history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    }

    function chip(label, cls, on, toggle) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip ' + cls;
        b.textContent = label;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', function () {
            toggle();
            b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
            render();
        });
        return b;
    }

    function buildChips() {
        var lanes = document.getElementById('lanes');
        LANES.forEach(function (l) {
            lanes.appendChild(chip((data.lanes && data.lanes[l] ? l : l), 'lane-' + l,
                state.lanes.indexOf(l) >= 0, function () {
                    var i = state.lanes.indexOf(l);
                    if (i >= 0) state.lanes.splice(i, 1); else state.lanes.push(l);
                }));
        });
        var kinds = document.getElementById('kinds');
        KINDS.forEach(function (k) {
            kinds.appendChild(chip(KIND_LABEL[k], 'kind-' + k,
                state.kinds.indexOf(k) >= 0, function () {
                    var i = state.kinds.indexOf(k);
                    if (i >= 0) state.kinds.splice(i, 1); else state.kinds.push(k);
                }));
        });
    }

    function fromUrl() {
        var p = new URLSearchParams(location.search);
        state.q = (p.get('q') || '').toLowerCase().trim();
        state.lanes = (p.get('lane') || '').split(',').filter(function (x) { return LANES.indexOf(x) >= 0; });
        state.kinds = (p.get('kind') || '').split(',').filter(function (x) { return KINDS.indexOf(x) >= 0; });
        var s = p.get('sort');
        if (s === 'year-asc' || s === 'title') state.sort = s;
        elQ.value = state.q;
        elSort.value = state.sort;
    }

    elQ.addEventListener('input', function () {
        state.q = elQ.value.toLowerCase().trim();
        render();
    });
    elSort.addEventListener('change', function () { state.sort = elSort.value; render(); });

    // Click a tag to search for it. The tags are the index.
    elList.addEventListener('click', function (e) {
        var b = e.target.closest('.tag.btn');
        if (!b) return;
        elQ.value = b.dataset.tag;
        state.q = b.dataset.tag.toLowerCase();
        render();
        elQ.focus();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === '/' && document.activeElement !== elQ) { e.preventDefault(); elQ.focus(); elQ.select(); }
        if (e.key === 'Escape' && document.activeElement === elQ && elQ.value) {
            elQ.value = ''; state.q = ''; render();
        }
    });

    fetch('/watch.json')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
            data = d;
            items = d.items || [];
            document.getElementById('note').textContent = d.note || '';
            // fromUrl first: buildChips reads the state to decide which
            // chips start pressed, and building them from an empty state
            // left a restored filter applied but invisible.
            fromUrl();
            buildChips();
            render();
        })
        .catch(function (e) {
            elList.innerHTML = '<div class="empty"><b>The list would not load.</b><br>' +
                esc(String(e.message || e)) + '</div>';
        });
})();
