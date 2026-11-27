-- The public (anon) key held SELECT on 32 columns of `orders` — download_token,
-- email, name, phone, shipping_address, stripe_payment_intent — and on
-- order_items, events, settings and subscribers as well.
--
-- Nothing reached them: RLS is on and those tables have no policy, so every
-- row is denied. But that is one layer deep. The day anyone adds a
-- reasonable-looking policy to orders — "a buyer may see their own order" —
-- the standing column grants mean every matching row hands over its
-- download_token, which is the only thing protecting the paid files, along
-- with the buyer's address and phone number. The grant is doing no work and
-- is one edit away from doing harm.
--
-- The browser never reads these tables. The storefront's only REST call is to
-- products (with variants and product_files embedded); everything about an
-- order goes through an edge function on the service role, which these
-- revokes do not affect. Verified before applying, and the storefront's own
-- catalogue query still answers 200 after.
--
-- RLS stays on as the second layer. products, variants and product_files keep
-- their column-level grants, because the catalogue is meant to be public.
revoke all on table public.orders        from anon, authenticated;
revoke all on table public.order_items   from anon, authenticated;
revoke all on table public.events        from anon, authenticated;
revoke all on table public.settings      from anon, authenticated;
revoke all on table public.subscribers   from anon, authenticated;

-- And so the next table created in this schema does not start out readable by
-- the published key, which is how most of the above happened.
alter default privileges in schema public revoke all on tables from anon, authenticated;
