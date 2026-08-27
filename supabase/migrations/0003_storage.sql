-- Phase 2: Storage bucket for item photos.
--
-- Convention: every uploaded file's path starts with the uploader's own
-- auth.uid() as the first folder segment, e.g. "<user_id>/<uuid>-photo.jpg".
-- The insert/update/delete policies below check that prefix, so a user can
-- only ever write into their own folder — this is enforced independently of
-- (and in addition to) the client-side type/size checks in
-- components/image-uploader.tsx, since client checks are trivially bypassable.

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

-- Public bucket: anyone can read (this is what makes the stored public URL
-- usable directly in <img> tags without an auth header).
create policy "item images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'item-images');

create policy "users can upload item images into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete their own item images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
