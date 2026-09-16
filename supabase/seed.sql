-- Synthetic organizations only. User fixtures are isolated in tests/rls.
insert into public.organizations (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Organization Alpha — demonstração'),
  ('20000000-0000-4000-8000-000000000002', 'Organization Beta — demonstração')
on conflict (id) do nothing;
