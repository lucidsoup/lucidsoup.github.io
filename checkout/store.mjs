/* ===========================================================================
   store.mjs — where orders and artist accounts are kept.

   One tiny interface over Cloudflare KV, so the worker never touches a
   binding directly and the tests can hand it a Map. Orders are small JSON
   blobs; there is no query language here and there does not need to be,
   because the only questions this store is ever asked are "what is this
   order", "what order does this token belong to" and "list them".

   Note the index: KV can list by prefix, so orders are written under
   `order:<id>` and that prefix is the whole ledger. If this ever grows past
   a few thousand sales, move it to D1 and keep the same four methods.
   =========================================================================== */

export function kvStore(kv) {
    if (!kv) throw new Error('store: no KV binding');
    const get = async (k) => {
        const v = await kv.get(k);
        return v ? JSON.parse(v) : null;
    };
    return {
        async getOrder(id) { return get('order:' + id); },
        async putOrder(id, order) { await kv.put('order:' + id, JSON.stringify(order)); },

        /* The token points at the order rather than containing it, so
           revoking a link is deleting one key and the sale is still on
           record. Expiry is enforced in the worker as well as here: KV's own
           TTL is a convenience, not the rule. */
        async putToken(token, orderId, ttlSeconds) {
            await kv.put('token:' + token, orderId,
                ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined);
        },
        async getToken(token) { return kv.get('token:' + token); },
        async deleteToken(token) { await kv.delete('token:' + token); },

        async artistAccount(artistId) { return get('artist:' + artistId); },
        async putArtistAccount(artistId, acct) {
            await kv.put('artist:' + artistId, JSON.stringify(acct));
            // The reverse index, so an account.updated webhook — which knows
            // the Stripe account and nothing else — can find whose it is.
            if (acct && acct.id) await kv.put('acct:' + acct.id, artistId);
        },
        async artistByAccount(accountId) { return kv.get('acct:' + accountId); },

        async listOrders(limit = 1000) {
            const out = [];
            let cursor;
            do {
                const page = await kv.list({ prefix: 'order:', cursor, limit: 100 });
                for (const k of page.keys) {
                    const v = await kv.get(k.name);
                    if (v) out.push(JSON.parse(v));
                    if (out.length >= limit) return out;
                }
                cursor = page.list_complete ? null : page.cursor;
            } while (cursor);
            return out;
        },
    };
}
