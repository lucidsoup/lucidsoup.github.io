/* A fake Stripe, a fake KV and a fake bucket.

   The point of these is that the worker can be driven through a whole sale —
   onboard an artist, take a payment, receive the webhook, download the file,
   run out of downloads — with nothing reaching the network and no keys
   existing. What they do NOT do is tell you Stripe's real API agrees with
   this; only a test charge against a test key does that, and the README says
   so in as many words. */

export function fakeKV() {
    const map = new Map();
    return {
        _map: map,
        async get(k) { return map.has(k) ? map.get(k) : null; },
        async put(k, v) { map.set(k, v); },
        async delete(k) { map.delete(k); },
        async list({ prefix = '', cursor, limit = 100 } = {}) {
            const keys = [...map.keys()].filter((k) => k.startsWith(prefix)).sort();
            const start = cursor ? Number(cursor) : 0;
            const slice = keys.slice(start, start + limit);
            const next = start + limit;
            return {
                keys: slice.map((name) => ({ name })),
                list_complete: next >= keys.length,
                cursor: String(next),
            };
        },
    };
}

export function fakeBucket(files = {}) {
    return {
        async get(key) {
            if (!(key in files)) return null;
            const bytes = new TextEncoder().encode(files[key]);
            return {
                body: new Blob([bytes]).stream(),
                size: bytes.length,
            };
        },
    };
}

/* A fake Stripe that answers the handful of endpoints this uses, records
   every call so a test can assert on what was sent, and can be told to fail. */
export function fakeStripe({ site = 'https://site.test', fail = null } = {}) {
    const calls = [];
    const accounts = new Map();
    let n = 0;

    async function respond(status, obj) {
        return new Response(JSON.stringify(obj), {
            status, headers: { 'content-type': 'application/json' },
        });
    }

    const impl = async (url, init = {}) => {
        const u = String(url);

        // The catalogue, served from the "site".
        if (u.startsWith(site)) {
            const path = u.slice(site.length);
            if (impl.files && path in impl.files) {
                return new Response(JSON.stringify(impl.files[path]), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response('not found', { status: 404 });
        }

        const body = {};
        if (init.body) {
            for (const pair of String(init.body).split('&')) {
                const i = pair.indexOf('=');
                if (i < 0) continue;
                body[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
            }
        }
        const call = {
            url: u, method: init.method || 'GET', body,
            account: (init.headers || {})['stripe-account'] || null,
            auth: (init.headers || {}).authorization || '',
        };
        calls.push(call);

        if (fail && fail(call)) {
            return respond(402, { error: { message: 'fake stripe refused', code: 'card_declined' } });
        }

        if (u.endsWith('/v1/accounts') && call.method === 'POST') {
            const id = 'acct_fake' + (++n);
            accounts.set(id, { id, charges_enabled: false, payouts_enabled: false,
                               requirements: { currently_due: ['external_account'] } });
            return respond(200, { id });
        }
        if (u.includes('/v1/accounts/') && call.method === 'GET') {
            const id = u.split('/v1/accounts/')[1];
            const a = accounts.get(id);
            if (!a) return respond(404, { error: { message: 'no such account' } });
            return respond(200, a);
        }
        if (u.endsWith('/v1/account_links')) {
            return respond(200, { url: 'https://connect.stripe.test/setup/' + body.account });
        }
        if (u.endsWith('/v1/checkout/sessions') && call.method === 'POST') {
            const id = 'cs_fake' + (++n);
            return respond(200, { id, url: 'https://checkout.stripe.test/pay/' + id });
        }
        return respond(404, { error: { message: 'fake stripe has no route for ' + u } });
    };

    impl.calls = calls;
    impl.accounts = accounts;
    impl.files = {};
    // Let a test say "this artist finished onboarding".
    impl.enable = (id) => {
        accounts.set(id, { id, charges_enabled: true, payouts_enabled: true,
                           requirements: { currently_due: [] } });
    };
    return impl;
}
