-- A product_files row is a promise that a file exists; the object in storage is
-- the file. The editor refused to make a listing live unless it had file rows,
-- but it counted rows, so a listing could go live pointing at nothing — and
-- every one of the first twenty rows in this shop did exactly that, with byte
-- counts recorded for files that had never been uploaded. Storage was empty.
--
-- This lives in the database rather than in the edge function so that no client
-- can get round it: the storefront only shows Add to cart for an active
-- product, so this is the line between a sale and a 404.
--
-- Checked against three cases when it was applied: a product whose files really
-- are in storage still goes live; a product with no file rows is refused; and a
-- product with a file row whose object is missing — the exact case the old
-- check waved through — is refused.
--
-- Note for whoever changes the editor next: `product.save` in the `admin` edge
-- function still does its own row-counting pre-check, so for this case the
-- Control Room shows its generic "Something went wrong" rather than the message
-- raised below. The save is correctly refused either way. Making the function
-- call public.product_has_real_file() would fix the wording.
create or replace function public.product_has_real_file(p_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.product_files f
    join storage.objects o on o.bucket_id = 'library' and o.name = f.storage_path
    where f.product_id = p_id
  );
$$;

create or replace function public.check_active_product_files()
returns trigger language plpgsql as $$
begin
  if new.status = 'active'
     and new.kind <> 'physical'
     and not public.product_has_real_file(new.id) then
    raise exception
      'Cannot make "%" live: none of its listed files are actually in storage. Upload the file first.',
      coalesce(new.title, new.slug, new.id::text)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists products_active_needs_file on public.products;
create constraint trigger products_active_needs_file
  after insert or update of status on public.products
  deferrable initially immediate
  for each row execute function public.check_active_product_files();
