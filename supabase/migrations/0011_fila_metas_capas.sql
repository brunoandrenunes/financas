-- Leituras: ordem da fila "quero ler", metas do ano (genéricas, para servir às outras áreas depois)
-- e um espaço para guardar capas enviadas pelo Bruno.

alter table public.livros add column ordem integer check (ordem > 0);

create table public.metas (
  id          bigint generated always as identity primary key,
  ano         smallint not null check (ano between 2000 and 2100),
  area        text not null check (area in ('leituras','treinos','financas','investimentos','pessoal')),
  indicador   text not null check (char_length(indicador) between 1 and 40),
  titulo      text check (char_length(titulo) <= 120),
  alvo        numeric(14,2) not null check (alvo > 0),
  criado_em   timestamptz not null default now(),
  unique (ano, area, indicador)
);
alter table public.metas enable row level security;
create policy "proprietario_total" on public.metas for all to authenticated
  using (privado.e_proprietario()) with check (privado.e_proprietario());
create trigger metas_auditoria after insert or update or delete on public.metas
  for each row execute function privado.tg_auditoria();
revoke all on public.metas from anon;
revoke truncate, trigger, references on public.metas from authenticated;

-- Capas: leitura pública (capa de livro não é dado sensível; o nome do arquivo é aleatório),
-- mas só o proprietário envia, lista ou apaga. Até 2 MB, só imagem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "capas_proprietario_ver" on storage.objects for select to authenticated
  using (bucket_id = 'capas' and privado.e_proprietario());
create policy "capas_proprietario_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'capas' and privado.e_proprietario());
create policy "capas_proprietario_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'capas' and privado.e_proprietario());
