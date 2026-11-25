/* ===========================================================================
   worker.mjs — the checkout.

   The site is static. This is the small piece that cannot be, because three
   things in a checkout are impossible in a page:

     1. Knowing the price. If the browser sends the amount, somebody sends
        one cent. Prices are read here, from the catalogue, every time.
     2. Knowing a payment happened. Only Stripe can say that, and only
        through a signed webhook.
     3. Gating a file. A link a page can build is a link anyone can build.

   Everything else — the catalogue, the artwork, the simulations — stays in
   the static site where it belongs. This handles money and files and nothing
   else.

   It is written as one `handle(request, env)` with no Workers-specific
   globals, so the same code runs under the test harness against a fake
   Stripe and an in-memory bucket. index.mjs is the four-line Workers entry.

   WHAT HAS BEEN TESTED AND WHAT HAS NOT. Every route, the signature check,
   the price lookup, the token lifecycle and the download gate are covered by
   checkout/test/suite.mjs, against a fake Stripe. Nothing here has been run
   against the real Stripe API or deployed to Cloudflare, because that needs
   an account and keys nobody should hand to a program. The README says what
   to do about that before taking a real payment.
   =========================================================================== */

import { Stripe, verifyWebhook } from './stripe.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body, status = 200, extra = {}) {
    return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function bad(message, status = 400) { return json({ error: message }, status); }

/* CORS. The store is served from the site's origin and this from the
   worker's, so the browser will preflight. Only the origins named in config
   are allowed: a checkout that answers everybody is a checkout anybody can
   drive from their own page. */
function corsHeaders(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('origin') || '';
    if (!allowed.length || !allowed.includes(origin)) return null;
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
    };
}

function randomToken(bytes = 24, crypto = globalThis.crypto) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------- the catalogue ----------------
   Read from the live site rather than copied here, so there is one list of
   what things cost and it is the one the shop shows. Cached briefly: a
   checkout should not depend on a cold fetch, and a price change should not
   take an hour to apply. */
let catalogueCache = { at: 0, items: null, artists: null, config: null };

async function catalogue(env, fetchImpl = globalThis.fetch, now = Date.now()) {
    const ttl = Number(env.CATALOGUE_TTL_MS || 60000);
    if (catalogueCache.items && now - catalogueCache.at < ttl) return catalogueCache;
    const base = (env.SITE_BASE || '').replace(/\/+$/, '');
    if (!base) throw new Error('SITE_BASE is not set');
    const [items, artists, config] = await Promise.all([
        fetchImpl(base + '/items.json').then((r) => r.json()),
        fetchImpl(base + '/artists.json').then((r) => r.json()).catch(() => ({ artists: [] })),
        fetchImpl(base + '/checkout.json').then((r) => r.json()).catch(() => ({})),
    ]);
    catalogueCache = {
        at: now,
        items: Array.isArray(items) ? items : items.items || [],
        artists: artists.artists || [],
        config: config || {},
    };
    return catalogueCache;
}

export function resetCatalogueCache() { catalogueCache = { at: 0, items: null, artists: null, config: null }; }

/* The amount, in cents, decided here and nowhere else. An item may carry
   priceCents directly; otherwise it is read out of the human price string,
   which is what that field has always been. No number means it is not for
   sale through this checkout, which is a refusal rather than a guess. */
export function priceCentsOf(item) {
    if (Number.isInteger(item.priceCents) && item.priceCents > 0) return item.priceCents;
    const m = String(item.price || '').replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
    if (!m) return 0;
    return Math.round(parseFloat(m[0]) * 100);
}

function artistOf(cat, item) {
    const id = item.artistId || (item.seller && item.seller.id) || '';
    return cat.artists.find((a) => a.id === id) || null;
}

/* ---------------- routes ---------------- */

async function handleConfig(request, env, deps) {
    const cat = await catalogue(env, deps.fetch, deps.now());
    const out = cat.artists.map((a) => ({ id: a.id, name: a.name, payable: !!a.stripeReady }));
    return json({ ok: true, chargeMode: cat.config.chargeMode || 'destination', artists: out });
}

/* Start a purchase. The browser sends an item id and nothing that matters. */
async function handleCheckout(request, env, deps) {
    let body;
    try { body = await request.json(); } catch (e) { return bad('expected JSON'); }
    const itemId = String(body.item || '');
    if (!itemId) return bad('no item');

    const cat = await catalogue(env, deps.fetch, deps.now());
    const item = cat.items.find((i) => i.id === itemId);
    if (!item) return bad('no such item', 404);
    if (item.available === false) return bad('that one is not on sale yet', 409);

    const cents = priceCentsOf(item);
    if (cents <= 0) return bad('that one has no price set', 409);

    const artist = artistOf(cat, item);
    if (!artist) return bad('that item has no artist on the roster', 409);

    let acct = await deps.store.artistAccount(artist.id);
    if (!acct) return bad('that artist has not started setting up payouts yet', 409);
    if (!acct.chargesEnabled) {
        /* The cached flag is stale the moment an artist finishes onboarding,
           and nothing about that moment reaches us unless the account.updated
           webhook is wired up. Rather than have a sale refused because nobody
           happened to look at the admin page, ask Stripe — this costs one
           call and only on the path that was about to refuse anyway. */
        const probe = new Stripe(env.STRIPE_SECRET_KEY, { fetch: deps.fetch });
        const live = await probe.getAccount(acct.id);
        acct = {
            id: acct.id,
            chargesEnabled: !!live.charges_enabled,
            payoutsEnabled: !!live.payouts_enabled,
            requirementsDue: (live.requirements && live.requirements.currently_due) || [],
        };
        await deps.store.putArtistAccount(artist.id, acct);
        if (!acct.chargesEnabled) {
            return bad('that artist has not finished setting up payouts yet', 409);
        }
    }

    const mode = cat.config.chargeMode === 'direct' ? 'direct' : 'destination';
    const pct = Number(cat.config.platformFeePercent || 0);
    const feeCents = Math.max(0, Math.round(cents * (pct / 100)));

    const orderId = randomToken(12, deps.crypto);
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { fetch: deps.fetch });
    const site = (env.SITE_BASE || '').replace(/\/+$/, '');

    const session = await stripe.checkoutSession({
        mode,
        account: acct.id,
        feeCents,
        customerEmail: typeof body.email === 'string' ? body.email.slice(0, 200) : undefined,
        lineItem: {
            quantity: 1,
            price_data: {
                currency: (cat.config.currency || 'usd').toLowerCase(),
                unit_amount: cents,
                product_data: {
                    name: item.title || itemId,
                    description: (item.subtitle || '') + (item.format ? ' · ' + item.format : ''),
                },
            },
        },
        successUrl: `${site}/thanks.html?order=${orderId}&session={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${site}/store.html?cancelled=${encodeURIComponent(itemId)}`,
        metadata: { orderId, itemId, artistId: artist.id },
    });

    await deps.store.putOrder(orderId, {
        orderId, itemId, artistId: artist.id,
        amountCents: cents, feeCents, currency: (cat.config.currency || 'usd').toLowerCase(),
        chargeMode: mode,
        sessionId: session.id,
        stripeAccount: acct.id,
        status: 'pending',
        createdAt: deps.now(),
    });

    return json({ ok: true, url: session.url, orderId });
}

/* Stripe telling us a payment happened. This is the only thing in the system
   that is allowed to say so. */
async function handleWebhook(request, env, deps) {
    const raw = await request.text();
    let event;
    try {
        event = await verifyWebhook(raw, request.headers.get('stripe-signature'),
            env.STRIPE_WEBHOOK_SECRET, { now: deps.now(), crypto: deps.crypto });
    } catch (e) {
        // 400, never 500: a bad signature is a rejected request, not an outage,
        // and Stripe should not retry it forever.
        return bad('webhook rejected: ' + e.message, 400);
    }

    /* Connect tells us when an artist's account changes — finished
       onboarding, lost a capability, had a requirement come due. Keeping the
       stored flag in step with that is what makes "can this person be paid"
       true rather than last-time-somebody-checked. */
    if (event.type === 'account.updated') {
        const acc = event.data.object;
        const artistId = await deps.store.artistByAccount(acc.id);
        if (artistId) {
            await deps.store.putArtistAccount(artistId, {
                id: acc.id,
                chargesEnabled: !!acc.charges_enabled,
                payoutsEnabled: !!acc.payouts_enabled,
                requirementsDue: (acc.requirements && acc.requirements.currently_due) || [],
            });
        }
        return json({ ok: true, artist: artistId || null });
    }

    if (event.type !== 'checkout.session.completed') return json({ ok: true, ignored: event.type });

    const session = event.data.object;
    const meta = session.metadata || {};
    const orderId = meta.orderId;
    if (!orderId) return json({ ok: true, ignored: 'no orderId in metadata' });

    const existing = await deps.store.getOrder(orderId);
    /* Stripe retries. Replaying a delivered order must not mint a second
       download or double anybody's count. Same read-then-write caveat as the
       download counter: two deliveries in the same instant could both pass
       this. Stripe spaces its retries out by seconds and then hours, so in
       practice this holds — and the worst case is one buyer getting two valid
       links to a thing they paid for. */
    if (existing && existing.status === 'paid') return json({ ok: true, duplicate: true });

    const token = randomToken(24, deps.crypto);
    const hours = Number(env.DOWNLOAD_HOURS || 72);
    const order = {
        ...(existing || {}),
        orderId,
        itemId: existing ? existing.itemId : meta.itemId,
        artistId: existing ? existing.artistId : meta.artistId,
        status: 'paid',
        paidAt: deps.now(),
        email: (session.customer_details && session.customer_details.email) || session.customer_email || '',
        amountCents: session.amount_total != null ? session.amount_total : (existing && existing.amountCents),
        paymentIntent: session.payment_intent || '',
        token,
        tokenExpiresAt: deps.now() + hours * 3600 * 1000,
        downloads: 0,
        maxDownloads: Number(env.MAX_DOWNLOADS || 5),
    };
    await deps.store.putOrder(orderId, order);
    await deps.store.putToken(token, orderId);
    return json({ ok: true });
}

/* What the thanks page asks, so a buyer sees their link without us putting
   the token in a URL anybody can share around. It is keyed by the Stripe
   session id, which only the buyer's browser is handed. */
async function handleOrder(request, env, deps, url) {
    const sessionId = url.searchParams.get('session') || '';
    const orderId = url.searchParams.get('order') || '';
    if (!orderId) return bad('no order');
    const order = await deps.store.getOrder(orderId);
    if (!order) return bad('no such order', 404);
    if (order.status !== 'paid') return json({ ok: true, status: order.status });
    if (!sessionId || sessionId !== order.sessionId) return bad('that order is not yours', 403);
    return json({
        ok: true, status: 'paid', itemId: order.itemId,
        download: `${(env.SELF_BASE || '').replace(/\/+$/, '')}/download/${order.token}`,
        expiresAt: order.tokenExpiresAt,
        remaining: Math.max(0, order.maxDownloads - order.downloads),
    });
}

/* The file. Streamed from the bucket by the worker rather than handed out as
   a signed bucket URL, so the count and the expiry are enforced on every
   single request instead of once at minting time. */
async function handleDownload(request, env, deps, token) {
    const orderId = await deps.store.getToken(token);
    if (!orderId) return bad('that link is not valid', 404);
    const order = await deps.store.getOrder(orderId);
    if (!order || order.status !== 'paid') return bad('that link is not valid', 404);
    if (deps.now() > order.tokenExpiresAt) return bad('that link has expired', 410);
    /* The count is read here and written below, and KV has no compare-and-set,
       so two requests landing at the same instant can both see the last go and
       both take it. That is a courtesy limit on sharing a link around, not a
       licence check, and it is not worth a lock: the expiry is the part that
       actually closes the door. Said out loud so nobody later mistakes this
       for a guarantee. */
    if (order.downloads >= order.maxDownloads) return bad('that link has been used up', 429);

    const cat = await catalogue(env, deps.fetch, deps.now());
    const item = cat.items.find((i) => i.id === order.itemId);
    const key = (item && item.file) || `${order.itemId}.zip`;
    const object = await env.BUILDS.get(key);
    if (!object) return bad('the build for that is missing from the bucket', 404);

    await deps.store.putOrder(orderId, { ...order, downloads: order.downloads + 1,
                                         lastDownloadAt: deps.now() });
    return new Response(object.body, {
        headers: {
            'content-type': 'application/zip',
            'content-disposition': `attachment; filename="${key.split('/').pop()}"`,
            'cache-control': 'private, no-store',
        },
    });
}

/* Artist onboarding. The artist goes to Stripe, fills in who they are and
   where their money goes, and comes back. We never see any of it. */
async function handleOnboard(request, env, deps) {
    let body;
    try { body = await request.json(); } catch (e) { return bad('expected JSON'); }
    const artistId = String(body.artist || '');
    if (!artistId) return bad('no artist');
    if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
        return bad('not allowed', 401);
    }
    const cat = await catalogue(env, deps.fetch, deps.now());
    const artist = cat.artists.find((a) => a.id === artistId);
    if (!artist) return bad('no such artist on the roster', 404);

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { fetch: deps.fetch });
    let acct = await deps.store.artistAccount(artistId);
    if (!acct) {
        const created = await stripe.createAccount({ email: artist.email, country: artist.country || 'US' });
        acct = { id: created.id, chargesEnabled: false, payoutsEnabled: false };
        await deps.store.putArtistAccount(artistId, acct);
    }
    const site = (env.SITE_BASE || '').replace(/\/+$/, '');
    const link = await stripe.accountLink({
        account: acct.id,
        refreshUrl: `${site}/admin.html#payouts`,
        returnUrl: `${site}/admin.html#payouts`,
    });
    return json({ ok: true, url: link.url, account: acct.id });
}

/* Whether an artist can actually be paid. Asked of Stripe rather than
   remembered, because "they said they would finish onboarding" is not the
   same as Stripe being willing to send them money. */
async function handleArtistStatus(request, env, deps, artistId) {
    if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
        return bad('not allowed', 401);
    }
    const acct = await deps.store.artistAccount(artistId);
    if (!acct) return json({ ok: true, onboarded: false, chargesEnabled: false });
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { fetch: deps.fetch });
    const live = await stripe.getAccount(acct.id);
    const next = {
        id: acct.id,
        chargesEnabled: !!live.charges_enabled,
        payoutsEnabled: !!live.payouts_enabled,
        requirementsDue: (live.requirements && live.requirements.currently_due) || [],
    };
    await deps.store.putArtistAccount(artistId, next);
    return json({ ok: true, onboarded: true, ...next });
}

/* What each artist is owed and has been paid. Read from the orders we wrote,
   which is a record of what this store sold — Stripe remains the truth about
   money, and the README says so. */
async function handleLedger(request, env, deps) {
    if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
        return bad('not allowed', 401);
    }
    const orders = await deps.store.listOrders();
    const byArtist = {};
    for (const o of orders) {
        if (o.status !== 'paid') continue;
        const a = (byArtist[o.artistId] = byArtist[o.artistId] || { sales: 0, grossCents: 0, feeCents: 0 });
        a.sales++;
        a.grossCents += o.amountCents || 0;
        a.feeCents += o.feeCents || 0;
    }
    for (const id of Object.keys(byArtist)) {
        byArtist[id].artistCents = byArtist[id].grossCents - byArtist[id].feeCents;
    }
    return json({ ok: true, artists: byArtist, orders: orders.length });
}

/* ---------------- the handler ---------------- */

export async function handle(request, env, deps = {}) {
    const d = {
        fetch: deps.fetch || globalThis.fetch,
        now: deps.now || (() => Date.now()),
        crypto: deps.crypto || globalThis.crypto,
        store: deps.store,
    };
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }

    let res;
    try {
        if (path === '/health') res = json({ ok: true, now: d.now() });
        else if (path === '/config' && request.method === 'GET') res = await handleConfig(request, env, d);
        else if (path === '/checkout' && request.method === 'POST') res = await handleCheckout(request, env, d);
        else if (path === '/webhook' && request.method === 'POST') res = await handleWebhook(request, env, d);
        else if (path === '/order' && request.method === 'GET') res = await handleOrder(request, env, d, url);
        else if (path.startsWith('/download/') && request.method === 'GET') {
            res = await handleDownload(request, env, d, decodeURIComponent(path.slice('/download/'.length)));
        } else if (path === '/onboard' && request.method === 'POST') res = await handleOnboard(request, env, d);
        else if (path.startsWith('/artist/') && request.method === 'GET') {
            res = await handleArtistStatus(request, env, d, decodeURIComponent(path.slice('/artist/'.length)));
        } else if (path === '/ledger' && request.method === 'GET') res = await handleLedger(request, env, d);
        else res = bad('no such route', 404);
    } catch (e) {
        // Never echo the message back: Stripe errors can carry account detail
        // and an exception can carry a key. It goes to the log, not the wire.
        console.error('checkout error', path, e && e.stack || e);
        res = json({ error: 'something failed on our side' }, 500);
    }

    if (cors) {
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(cors)) headers.set(k, v);
        res = new Response(res.body, { status: res.status, headers });
    }
    return res;
}
