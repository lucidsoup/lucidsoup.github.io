/* ===========================================================================
   stripe.mjs — the only part of this that talks to Stripe.

   Written against Stripe's REST API with fetch rather than the npm SDK, for
   three reasons: it runs unchanged on Cloudflare Workers, on Node and in the
   tests; it has no dependencies to audit or to have compromised under us; and
   the webhook signature check — the one piece of this whole system that
   actually holds money shut — is twenty lines you can read rather than a call
   into something you cannot.

   Everything here takes an explicit `fetch`, so the tests hand it a fake
   Stripe and nothing reaches the network.
   =========================================================================== */

const API = 'https://api.stripe.com/v1';

/* Stripe takes form-encoded bodies with bracket notation for nesting:
   payment_intent_data[transfer_data][destination]=acct_123. */
export function form(obj, prefix) {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) {
            v.forEach((item, i) => {
                if (item && typeof item === 'object') parts.push(form(item, `${key}[${i}]`));
                else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
            });
        } else if (v && typeof v === 'object') {
            parts.push(form(v, key));
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.filter(Boolean).join('&');
}

export class Stripe {
    constructor(secretKey, { fetch: f = globalThis.fetch } = {}) {
        if (!secretKey) throw new Error('stripe: no secret key');
        this.key = secretKey;
        this.fetch = f;
    }

    async call(method, path, body, { account, idempotencyKey } = {}) {
        const headers = {
            authorization: 'Bearer ' + this.key,
            'content-type': 'application/x-www-form-urlencoded',
            // Pinned on purpose: an API version that moves under a running
            // store changes shapes nobody re-read.
            'stripe-version': '2024-06-20',
        };
        // Direct charges are created *on the artist's account*, which is what
        // this header means and the only difference between the two modes.
        if (account) headers['stripe-account'] = account;
        if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

        const res = await this.fetch(API + path, {
            method,
            headers,
            body: body === undefined ? undefined : form(body),
        });
        const text = await res.text();
        let json;
        try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
        if (!res.ok) {
            const err = new Error((json.error && json.error.message) || `stripe ${res.status}`);
            err.status = res.status;
            err.code = json.error && json.error.code;
            err.type = json.error && json.error.type;
            throw err;
        }
        return json;
    }

    /* ---- Connect onboarding ---- */

    createAccount({ email, country = 'US' }) {
        return this.call('POST', '/accounts', {
            type: 'express',
            country,
            email: email || undefined,
            capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
            business_type: 'individual',
        });
    }

    accountLink({ account, refreshUrl, returnUrl }) {
        return this.call('POST', '/account_links', {
            account,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });
    }

    getAccount(id) { return this.call('GET', '/accounts/' + encodeURIComponent(id)); }

    loginLink(account) {
        return this.call('POST', `/accounts/${encodeURIComponent(account)}/login_links`);
    }

    /* ---- the sale ----
       Two charge models, because which one you want is a real decision and
       not a detail:

       destination — the charge is made on the platform, the artist's share is
         transferred to them automatically, and the PLATFORM is merchant of
         record: your name on the statement, your dispute liability, your
         sales tax problem.

       direct — the charge is made on the artist's account: their name on the
         statement, their liability, their tax. The platform takes
         application_fee_amount off the top.

       Both are implemented. checkout.json picks. */
    checkoutSession({
        mode = 'destination', account, lineItem, successUrl, cancelUrl,
        feeCents = 0, metadata = {}, customerEmail,
    }) {
        const base = {
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            customer_email: customerEmail || undefined,
            line_items: [lineItem],
            metadata,
            payment_intent_data: { metadata },
        };
        if (mode === 'direct') {
            if (feeCents > 0) base.payment_intent_data.application_fee_amount = feeCents;
            return this.call('POST', '/checkout/sessions', base, { account });
        }
        base.payment_intent_data.transfer_data = { destination: account };
        if (feeCents > 0) base.payment_intent_data.application_fee_amount = feeCents;
        return this.call('POST', '/checkout/sessions', base);
    }

    getSession(id, { account } = {}) {
        return this.call('GET', '/checkout/sessions/' + encodeURIComponent(id), undefined, { account });
    }
}

/* ===========================================================================
   Webhook signatures.

   Stripe signs with HMAC-SHA256 over "<timestamp>.<raw body>" and sends it as
   `t=…,v1=…` in Stripe-Signature. Three things have to be true and all three
   are checked here: the body must hash to the signature, the signature must
   be compared in constant time, and the timestamp must be recent — without
   that last one a captured webhook can be replayed forever.

   Web Crypto, so this is the same code on Workers and on Node 18+.
   =========================================================================== */

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export function parseSignatureHeader(header) {
    const out = { t: null, v1: [] };
    String(header || '').split(',').forEach((part) => {
        const i = part.indexOf('=');
        if (i < 0) return;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k === 't') out.t = v;
        else if (k === 'v1') out.v1.push(v);
    });
    return out;
}

export async function hmacHex(secret, message, crypto = globalThis.crypto) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyWebhook(rawBody, sigHeader, secret, {
    toleranceSeconds = 300, now = Date.now(), crypto = globalThis.crypto,
} = {}) {
    if (!secret) throw new Error('webhook: no signing secret configured');
    const { t, v1 } = parseSignatureHeader(sigHeader);
    if (!t || !v1.length) throw new Error('webhook: malformed Stripe-Signature');

    const age = Math.abs(Math.floor(now / 1000) - Number(t));
    if (!Number.isFinite(age) || age > toleranceSeconds) {
        throw new Error('webhook: timestamp outside tolerance — refusing a possible replay');
    }
    const expected = await hmacHex(secret, `${t}.${rawBody}`, crypto);
    if (!v1.some((candidate) => timingSafeEqual(candidate, expected))) {
        throw new Error('webhook: signature does not match');
    }
    return JSON.parse(rawBody);
}
