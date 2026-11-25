# checkout

The part of the shop that cannot be a static page.

The rest of this site is files on GitHub Pages, and that is the right shape
for it. Three things in a checkout are impossible in a page, though, and all
three are here:

1. **Knowing the price.** If the browser sends the amount, somebody sends one
   cent. The amount is read from `items.json` by this worker, every time.
2. **Knowing a payment happened.** Only Stripe can say that, and only through
   a webhook signed with a secret the page must never hold.
3. **Gating a file.** A link a page can build is a link anyone can build.

It is about 400 lines of JavaScript with no dependencies, running on
Cloudflare Workers' free tier.

## What it does

```
buyer presses BUY
  └─ POST /checkout { item: "mindbloom" }
       ├─ price looked up in items.json          ← not sent by the browser
       ├─ artist looked up in artists.json
       ├─ Stripe Checkout Session created
       └─ order written as "pending"
  └─ buyer pays on Stripe's own page             ← no card data ever touches us
  └─ POST /webhook  (signed by Stripe)
       ├─ signature + timestamp verified
       ├─ order marked paid
       └─ download token minted
  └─ thanks.html asks GET /order
  └─ GET /download/<token>
       ├─ token valid? not expired? not used up?
       └─ file streamed from the private bucket
```

Money splits at the moment of the charge. The artist's share goes to **their**
Stripe account, not yours-then-theirs.

## The one real decision: who is the merchant of record

`checkout.json` has `chargeMode`, and both are implemented.

| | `destination` (default) | `direct` |
|---|---|---|
| Charge created on | your platform account | the artist's account |
| Name on the buyer's statement | yours | the artist's |
| Who owes the sales tax / VAT | **you** | the artist |
| Who eats a chargeback | **you** | the artist |
| Artist needs a full Stripe account | no, Express is enough | yes |

`destination` is simpler and is what most small marketplaces start on. It also
makes you the merchant for everything sold here, which is a real obligation
and not a setting. Switch to `direct` by changing one word in `checkout.json`;
no code changes.

## Deploying it

You need a Stripe account and a Cloudflare account. Neither can be created by
a program and neither should be.

```sh
cd checkout
npm install -g wrangler        # if you do not have it
wrangler login

wrangler kv namespace create ORDERS     # paste the id into wrangler.toml
wrangler r2 bucket create lucidsoup-builds

wrangler secret put STRIPE_SECRET_KEY        # sk_test_… to begin with
wrangler secret put STRIPE_WEBHOOK_SECRET    # from the next step
wrangler secret put ADMIN_TOKEN              # any long random string

wrangler deploy
```

Then in the Stripe dashboard:

1. **Connect → Get started**, platform type "marketplace".
2. **Developers → Webhooks → Add endpoint**, pointing at
   `https://<your-worker>/webhook`. Subscribe to **`checkout.session.completed`**
   and **`account.updated`**. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.
   Without `account.updated` the shop still works — an artist who finishes
   onboarding is re-checked on the next attempted sale — but their items stay
   marked unbuyable until somebody tries, which looks broken.
3. Put the worker's URL into `checkout.json` on the site as `base`.

Builds go in the bucket under the key each item names in its `file` field:

```sh
wrangler r2 object put lucidsoup-builds/mindbloom.zip --file ./Mindbloom-Windows.zip
```

## Testing it

```sh
node checkout/test/suite.mjs      # 66 checks, no network, no keys
```

That covers every route, the signature check, the price lookup, the token
lifecycle, both charge modes, and what it refuses: a buyer naming their own
price, an unknown item, an unavailable one, an item with no price, an item
whose artist is not on the roster, a made-up token, an expired token, a
used-up token, a replayed webhook, a webhook signed with the wrong secret, a
request from another origin, and every admin route without the admin token.

**It does not prove the real Stripe API agrees**, because it runs against a
fake. Nothing here has been run against a live key or deployed. Before taking
a real payment:

- Deploy with `sk_test_…` and buy something with Stripe's test card
  `4242 4242 4242 4242`.
- Check the webhook arrived (Stripe shows deliveries) and that the download
  link works, expires, and runs out.
- Onboard one artist end to end and confirm the split lands where you expect
  in **their** Stripe dashboard, not yours.
- Only then swap in the live key.

## Things that are true and worth knowing

- **One artist per checkout.** A basket spanning two artists needs separate
  charges and transfers, which is a different and more involved shape. Every
  BUY button on the store is for one item, so this has not been built.
- **The ledger here is a record of what this shop sold, not of money.**
  Stripe is the truth about money. `/ledger` is for telling an artist what they
  are owed; reconcile against Stripe before believing it.
- **Refunds are not automated.** Issue them in Stripe. The order record will
  still say paid; the download token is not revoked automatically. Delete the
  token key to kill a link.
- **The admin token is a shared secret in a browser.** It gates onboarding and
  the ledger, not money. Treat it as a password, rotate it if a laptop walks.
- **JUCE.** These plugins are built on JUCE, which is AGPLv3 or commercial.
  Selling builds is the case that needs the commercial licence. That is a
  licensing decision, not a technical one, and this checkout cannot solve it.
