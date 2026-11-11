-- RelayMap migration 8: private source storage.
--
-- Run only where Supabase Storage exists. The local PostgreSQL harness does not
-- bootstrap the storage schema, so this migration is a no-op there and the
-- limitation is recorded in the production documentation.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'storage'
  ) then
    raise notice 'storage schema absent: skipping RelayMap bucket policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'relaymap-sources',
    'relaymap-sources',
    false,
    10485760,
    array[
      'text/plain','text/markdown','text/csv','application/json',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "members read relaymap source objects" on storage.objects';
  execute $p$
    create policy "members read relaymap source objects" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'relaymap-sources'
        and private.can_read_project(((storage.foldername(name))[2])::uuid)
      )
  $p$;

  execute 'drop policy if exists "contributors upload relaymap source objects" on storage.objects';
  execute $p$
    create policy "contributors upload relaymap source objects" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'relaymap-sources'
        and private.can_contribute_project(((storage.foldername(name))[2])::uuid)
        and exists (
          select 1 from public.projects p
          where p.id = ((storage.foldername(name))[2])::uuid
            and p.organization_id = ((storage.foldername(name))[1])::uuid
        )
      )
  $p$;

  execute 'drop policy if exists "project leads delete relaymap source objects" on storage.objects';
  execute $p$
    create policy "project leads delete relaymap source objects" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'relaymap-sources'
        and private.project_role(((storage.foldername(name))[2])::uuid) = 'lead'
      )
  $p$;
end;
$$;

commit;
