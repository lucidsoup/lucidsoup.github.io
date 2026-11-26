-- A bundle is a product that is other products. `products.kind` had a check
-- constraint listing every kind the shop knows, and a bundle is not a plugin,
-- a tool or a rack, so it needed its own rather than being filed under one it
-- is not. The checkout function needed no change: it rejects `physical` and
-- takes anything else.
alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind = any (array['physical','sample_pack','plugin','tool','firmware','max_device','drambo_rack','bundle']));
