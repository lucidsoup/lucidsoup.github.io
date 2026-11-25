/* The checkout, driven through a whole sale and then attacked.

   Run: node checkout/test/suite.mjs

   What this proves: the routes work, the price cannot be set by the buyer,
   the webhook will not accept anything it should not, a download link is
   single-order, expiring, counted and unguessable, and an unpaid or replayed
   webhook cannot mint one.

   What this does not prove: that the real Stripe API agrees. Everything here
   runs against a fake. The README says what to do before taking real money.
*/
import { handle, resetCatalogueCache, priceCentsOf } from '../worker.mjs';
import { kvStore } from '../store.mjs';
import { verifyWebhook, hmacHex, form, parseSignatureHeader } from '../stripe.mjs';
import { fakeKV, fakeBucket, fakeStripe } from './fake.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
async function throws(fn, re, m) {
    try { await fn(); ok(false, m + ' — did not throw'); }
    catch (e) { ok(re.test(e.message), m + ' — ' + e.message); }
}

const SITE = 'https://site.test';
const SELF = 'https://pay.test';
const WEBHOOK_SECRET = 'whsec_testtesttest';
const ADMIN = 'admin-token-xyz';

const ITEMS = { items: [
    { id: 'mindbloom', title: 'Mindbloom', subtitle: 'effects rack', price: '$15',
      available: true, artistId: 'lucidsoup', file: 'mindbloom.zip' },
    { id: 'hydra', title: 'Hydra', price: '$24.50', available: true, artistId: 'ada' },
    { id: 'kelp', title: 'Kelp', price: '$10', available: false, artistId: 'lucidsoup' },
    { id: 'free', title: 'Freebie', price: '', available: true, artistId: 'lucidsoup' },
    { id: 'orphan', title: 'Orphan', price: '$9', available: true, artistId: 'nobody' },
] };
const ARTISTS = { artists: [
    { id: 'lucidsoup', name: 'LucidSoup', email: 'a@site.test' },
    { id: 'ada', name: 'Ada', email: 'ada@site.test' },
] };
const CONFIG = { chargeMode: 'destination', currency: 'usd', platformFeePercent: 10 };

function rig({ files = { 'mindbloom.zip': 'PK-fake-zip-bytes' }, stripeFail = null } = {}) {
    const f = fakeStripe({ site: SITE, fail: stripeFail });
    f.files = { '/items.json': ITEMS, '/artists.json': ARTISTS, '/checkout.json': CONFIG };
    const kv = fakeKV();
    const env = {
        STRIPE_SECRET_KEY: 'sk_test_fake',
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        ADMIN_TOKEN: ADMIN,
        SITE_BASE: SITE,
        SELF_BASE: SELF,
        ALLOWED_ORIGINS: SITE,
        BUILDS: fakeBucket(files),
        ORDERS: kv,
        DOWNLOAD_HOURS: 72,
        MAX_DOWNLOADS: 3,
        CATALOGUE_TTL_MS: 0,
    };
    let clock = 1700000000000;
    const deps = {
        fetch: f, store: kvStore(kv), crypto: globalThis.crypto,
        now: () => clock,
    };
    resetCatalogueCache();
    return {
        env, deps, stripe: f, kv,
        tick: (ms) => { clock += ms; },
        req: (path, init = {}) => new Request(SELF + path, {
            headers: { origin: SITE, ...(init.headers || {}) }, ...init,
        }),
        call: (path, init) => handle(rigReq(SELF, SITE, path, init), env, deps),
    };
}
function rigReq(self, site, path, init = {}) {
    return new Request(self + path, {
        ...init,
        headers: { origin: site, ...(init.headers || {}) },
    });
}

async function signedWebhook(payload, { secret = WEBHOOK_SECRET, t = Math.floor(1700000000000 / 1000) } = {}) {
    const raw = JSON.stringify(payload);
    const sig = await hmacHex(secret, `${t}.${raw}`);
    return { raw, header: `t=${t},v1=${sig}` };
}

/* ---------------- the pieces ---------------- */
{
    ok(form({ a: 1, b: { c: 2 } }) === 'a=1&b%5Bc%5D=2', 'form(): nested keys use bracket notation');
    ok(form({ line_items: [{ quantity: 1 }] }) === 'line_items%5B0%5D%5Bquantity%5D=1',
       'form(): arrays are indexed, which is what Stripe wants');
    ok(form({ a: undefined, b: 'x' }) === 'b=x', 'form(): undefined is dropped, not sent as "undefined"');

    const p = parseSignatureHeader('t=123,v1=abc,v1=def,v0=zzz');
    ok(p.t === '123' && p.v1.length === 2, 'signature header: every v1 is kept, v0 ignored');

    ok(priceCentsOf({ price: '$15' }) === 1500, 'price: "$15" is 1500 cents');
    ok(priceCentsOf({ price: 'From $2,500' }) === 250000, 'price: commas and words do not confuse it');
    ok(priceCentsOf({ price: '$24.50' }) === 2450, 'price: cents survive');
    ok(priceCentsOf({ price: '', priceCents: 999 }) === 999, 'price: priceCents wins when set');
    ok(priceCentsOf({ price: 'free' }) === 0, 'price: no number means not for sale');
}

/* ---------------- webhook signatures ---------------- */
{
    const { raw, header } = await signedWebhook({ type: 'ping' });
    const ev = await verifyWebhook(raw, header, WEBHOOK_SECRET, { now: 1700000000000 });
    ok(ev.type === 'ping', 'webhook: a correctly signed body verifies');

    await throws(() => verifyWebhook(raw, header, 'whsec_wrong', { now: 1700000000000 }),
                 /does not match/, 'webhook: the wrong secret is refused');
    await throws(() => verifyWebhook(raw + ' ', header, WEBHOOK_SECRET, { now: 1700000000000 }),
                 /does not match/, 'webhook: a tampered body is refused');
    await throws(() => verifyWebhook(raw, header, WEBHOOK_SECRET, { now: 1700000000000 + 900e3 }),
                 /tolerance/, 'webhook: an old signature is refused, so a capture cannot be replayed');
    await throws(() => verifyWebhook(raw, 't=1', WEBHOOK_SECRET, { now: 1700000000000 }),
                 /malformed/, 'webhook: a header with no v1 is refused');
    await throws(() => verifyWebhook(raw, header, '', { now: 1700000000000 }),
                 /no signing secret/, 'webhook: an unconfigured secret fails loudly, not open');
}

/* ---------------- a whole sale ---------------- */
{
    const r = rig();

    // 1. the artist is not set up yet
    let res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    ok(res.status === 409, 'checkout: refused while the artist has no payouts set up (' + res.status + ')');

    // 2. onboard them
    res = await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                                     body: JSON.stringify({ artist: 'lucidsoup' }) });
    let body = await res.json();
    ok(res.status === 200 && /connect\.stripe\.test/.test(body.url),
       'onboard: returns a Stripe-hosted onboarding link');
    const acctId = body.account;
    ok(/^acct_/.test(acctId), 'onboard: an Express account was created (' + acctId + ')');

    res = await r.call('/artist/lucidsoup', { headers: { 'x-admin-token': ADMIN } });
    body = await res.json();
    ok(body.chargesEnabled === false, 'status: not payable until Stripe says so');

    r.stripe.enable(acctId);
    res = await r.call('/artist/lucidsoup', { headers: { 'x-admin-token': ADMIN } });
    body = await res.json();
    ok(body.chargesEnabled === true && body.payoutsEnabled === true,
       'status: payable once Stripe says the account is ready');

    // 3. buy it
    res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    body = await res.json();
    ok(res.status === 200 && /checkout\.stripe\.test/.test(body.url), 'checkout: returns a Stripe URL');
    const orderId = body.orderId;

    const sessionCall = r.stripe.calls.find((c) => c.url.endsWith('/checkout/sessions'));
    ok(sessionCall.body['line_items[0][price_data][unit_amount]'] === '1500',
       'checkout: the amount came from the catalogue, not the browser');
    ok(sessionCall.body['payment_intent_data[transfer_data][destination]'] === acctId,
       'checkout: destination charge sends the money to the artist');
    ok(sessionCall.body['payment_intent_data[application_fee_amount]'] === '150',
       'checkout: the platform fee is 10% of 1500 = 150');
    ok(sessionCall.account === null, 'checkout: destination mode charges on the platform');

    // 4. the webhook
    const order = await r.deps.store.getOrder(orderId);
    const evt = {
        type: 'checkout.session.completed',
        data: { object: { id: order.sessionId, amount_total: 1500, payment_intent: 'pi_1',
                          customer_details: { email: 'buyer@test' },
                          metadata: { orderId, itemId: 'mindbloom', artistId: 'lucidsoup' } } },
    };
    let w = await signedWebhook(evt);
    res = await r.call('/webhook', { method: 'POST', headers: { 'stripe-signature': w.header }, body: w.raw });
    ok(res.status === 200, 'webhook: accepted');
    const paid = await r.deps.store.getOrder(orderId);
    ok(paid.status === 'paid' && paid.token, 'webhook: the order is paid and a token was minted');

    // 5. the thanks page
    res = await r.call(`/order?order=${orderId}&session=${order.sessionId}`);
    body = await res.json();
    ok(body.status === 'paid' && body.download.includes(paid.token),
       'order: the buyer is given their download link');

    res = await r.call(`/order?order=${orderId}&session=cs_someone_else`);
    ok(res.status === 403, 'order: somebody with the order id but not the session is refused');

    // 6. the download, three times, then not
    for (let i = 1; i <= 3; i++) {
        res = await r.call('/download/' + paid.token);
        ok(res.status === 200, `download ${i} of 3: served`);
    }
    res = await r.call('/download/' + paid.token);
    ok(res.status === 429, 'download 4: refused, the link is used up');

    // 7. replay the webhook
    const before = await r.deps.store.getOrder(orderId);
    res = await r.call('/webhook', { method: 'POST', headers: { 'stripe-signature': w.header }, body: w.raw });
    body = await res.json();
    const after = await r.deps.store.getOrder(orderId);
    ok(body.duplicate === true, 'webhook: a retry is recognised as a duplicate');
    ok(after.token === before.token && after.downloads === before.downloads,
       'webhook: and does not mint a second link or reset the count');

    // 8. the ledger
    res = await r.call('/ledger', { headers: { 'x-admin-token': ADMIN } });
    body = await res.json();
    ok(body.artists.lucidsoup.sales === 1 && body.artists.lucidsoup.grossCents === 1500,
       'ledger: the sale is recorded against the artist');
    ok(body.artists.lucidsoup.artistCents === 1350 && body.artists.lucidsoup.feeCents === 150,
       'ledger: and split 1350 to them, 150 to the platform');
}

/* ---------------- what it refuses ---------------- */
{
    const r = rig();
    r.stripe.enable('acct_fake1');

    let res = await r.call('/checkout', { method: 'POST',
        body: JSON.stringify({ item: 'mindbloom', price: 1, priceCents: 1, amount: 1 }) });
    ok(res.status === 409, 'a buyer naming their own price is simply ignored (artist not ready)');

    res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'nope' }) });
    ok(res.status === 404, 'an unknown item is refused');

    res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'kelp' }) });
    ok(res.status === 409, 'an item marked unavailable cannot be bought');

    res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'free' }) });
    ok(res.status === 409, 'an item with no price cannot be bought');

    res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'orphan' }) });
    ok(res.status === 409, 'an item whose artist is not on the roster cannot be bought');

    res = await r.call('/checkout', { method: 'POST', body: 'not json' });
    ok(res.status === 400, 'a body that is not JSON is refused');

    res = await r.call('/download/deadbeef');
    ok(res.status === 404, 'a made-up download token is refused');

    res = await r.call('/onboard', { method: 'POST', body: JSON.stringify({ artist: 'ada' }) });
    ok(res.status === 401, 'onboarding without the admin token is refused');

    res = await r.call('/ledger');
    ok(res.status === 401, 'the ledger without the admin token is refused');

    res = await r.call('/artist/ada');
    ok(res.status === 401, 'artist status without the admin token is refused');

    const bad = await signedWebhook({ type: 'checkout.session.completed', data: { object: {} } },
                                    { secret: 'whsec_not_ours' });
    res = await r.call('/webhook', { method: 'POST',
        headers: { 'stripe-signature': bad.header }, body: bad.raw });
    ok(res.status === 400, 'a webhook signed with the wrong secret is refused');

    res = await r.call('/nope');
    ok(res.status === 404, 'an unknown route is refused');
}

/* ---------------- an artist becoming payable without anybody looking ---- */
{
    const r = rig();
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    const acct = (await r.deps.store.artistAccount('lucidsoup')).id;
    ok((await r.deps.store.artistAccount('lucidsoup')).chargesEnabled === false,
       'account.updated: starts not payable');

    const w = await signedWebhook({
        type: 'account.updated',
        data: { object: { id: acct, charges_enabled: true, payouts_enabled: true,
                          requirements: { currently_due: [] } } },
    });
    const res = await r.call('/webhook', { method: 'POST',
        headers: { 'stripe-signature': w.header }, body: w.raw });
    const body = await res.json();
    ok(body.artist === 'lucidsoup', 'account.updated: the account is traced back to its artist');
    ok((await r.deps.store.artistAccount('lucidsoup')).chargesEnabled === true,
       'account.updated: and they become payable with nobody having checked');

    const unknown = await signedWebhook({
        type: 'account.updated',
        data: { object: { id: 'acct_not_ours', charges_enabled: true } },
    });
    const res2 = await r.call('/webhook', { method: 'POST',
        headers: { 'stripe-signature': unknown.header }, body: unknown.raw });
    ok((await res2.json()).artist === null, 'account.updated: an account we do not know is ignored');
}

/* ---------------- an artist who finishes onboarding mid-sale ---------- */
{
    const r = rig();
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    const acct = (await r.deps.store.artistAccount('lucidsoup')).id;
    // Stripe now says yes, but nothing has told us and no webhook arrived.
    r.stripe.enable(acct);
    const res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    ok(res.status === 200,
       'a stale "not payable" is re-checked with Stripe rather than refusing the sale');
    ok((await r.deps.store.artistAccount('lucidsoup')).chargesEnabled === true,
       'and the record is corrected on the way through');
}

/* ---------------- CORS ---------------- */
{
    const r = rig();
    let res = await handle(new Request(SELF + '/config', { headers: { origin: SITE } }), r.env, r.deps);
    ok(res.headers.get('access-control-allow-origin') === SITE, 'CORS: the site origin is allowed');

    res = await handle(new Request(SELF + '/config', { headers: { origin: 'https://evil.test' } }), r.env, r.deps);
    ok(!res.headers.get('access-control-allow-origin'),
       'CORS: another origin gets no allow header, so a page elsewhere cannot drive this');

    res = await handle(new Request(SELF + '/checkout', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }),
                       r.env, r.deps);
    ok(res.status === 403, 'CORS: and its preflight is refused outright');
}

/* ---------------- expiry ---------------- */
{
    const r = rig();
    r.stripe.enable('acct_fake1');
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    r.stripe.enable((await r.deps.store.artistAccount('lucidsoup')).id);
    let res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    const { orderId } = await res.json();
    const order = await r.deps.store.getOrder(orderId);
    const w = await signedWebhook({
        type: 'checkout.session.completed',
        data: { object: { id: order.sessionId, amount_total: 1500,
                          metadata: { orderId, itemId: 'mindbloom', artistId: 'lucidsoup' } } },
    });
    await r.call('/webhook', { method: 'POST', headers: { 'stripe-signature': w.header }, body: w.raw });
    const paid = await r.deps.store.getOrder(orderId);

    res = await r.call('/download/' + paid.token);
    ok(res.status === 200, 'expiry: the link works inside its window');
    r.tick(73 * 3600 * 1000);
    res = await r.call('/download/' + paid.token);
    ok(res.status === 410, 'expiry: and is gone 73 hours later');
}

/* ---------------- a missing build ---------------- */
{
    const r = rig({ files: {} });
    r.stripe.enable('acct_fake1');
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    r.stripe.enable((await r.deps.store.artistAccount('lucidsoup')).id);
    const res1 = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    const { orderId } = await res1.json();
    const order = await r.deps.store.getOrder(orderId);
    const w = await signedWebhook({
        type: 'checkout.session.completed',
        data: { object: { id: order.sessionId, amount_total: 1500,
                          metadata: { orderId, itemId: 'mindbloom', artistId: 'lucidsoup' } } },
    });
    await r.call('/webhook', { method: 'POST', headers: { 'stripe-signature': w.header }, body: w.raw });
    const paid = await r.deps.store.getOrder(orderId);
    const res = await r.call('/download/' + paid.token);
    ok(res.status === 404, 'a paid order whose file is missing says so rather than serving nothing');
}

/* ---------------- direct charges ---------------- */
{
    const r = rig();
    r.stripe.files['/checkout.json'] = { chargeMode: 'direct', currency: 'usd', platformFeePercent: 10 };
    resetCatalogueCache();
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    const acct = (await r.deps.store.artistAccount('lucidsoup')).id;
    r.stripe.enable(acct);
    await r.call('/artist/lucidsoup', { headers: { 'x-admin-token': ADMIN } });
    await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    const call = r.stripe.calls.filter((c) => c.url.endsWith('/checkout/sessions')).pop();
    ok(call.account === acct, 'direct mode: the charge is created on the artist account');
    ok(!call.body['payment_intent_data[transfer_data][destination]'],
       'direct mode: and there is no transfer, because the money is already theirs');
    ok(call.body['payment_intent_data[application_fee_amount]'] === '150',
       'direct mode: the platform still takes its fee');
}

/* ---------------- Stripe refusing ---------------- */
{
    const r = rig({ stripeFail: (c) => c.url.endsWith('/checkout/sessions') });
    await r.call('/onboard', { method: 'POST', headers: { 'x-admin-token': ADMIN },
                               body: JSON.stringify({ artist: 'lucidsoup' }) });
    r.stripe.enable((await r.deps.store.artistAccount('lucidsoup')).id);
    await r.call('/artist/lucidsoup', { headers: { 'x-admin-token': ADMIN } });
    const res = await r.call('/checkout', { method: 'POST', body: JSON.stringify({ item: 'mindbloom' }) });
    const body = await res.json();
    ok(res.status === 500, 'when Stripe refuses, the checkout fails rather than pretending');
    ok(!/fake stripe refused/.test(JSON.stringify(body)),
       'and the message is not echoed to the buyer, in case it carries detail');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
