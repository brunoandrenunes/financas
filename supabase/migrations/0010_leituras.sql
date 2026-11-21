-- Área pessoal · Leituras. Uma linha por leitura (um livro relido entra de novo, com as novas datas).

create table public.livros (
  id              bigint generated always as identity primary key,
  titulo          text not null check (char_length(titulo) between 1 and 300),
  autor           text check (char_length(autor) <= 200),
  generos         text[] not null default '{}',
  paginas         integer check (paginas > 0),
  status          text not null default 'quero_ler' check (status in ('quero_ler','lendo','lido','abandonado')),
  inicio          date,
  fim             date,
  nota            numeric(2,1) check (nota between 0.5 and 5 and nota * 2 = trunc(nota * 2)),  -- aceita meia estrela
  ano_leitura     smallint check (ano_leitura between 1990 and 2100),  -- quando só se sabe o ano (histórico do Skoob)
  capa_url        text check (capa_url ~ '^https://' and char_length(capa_url) <= 500),
  editora         text check (char_length(editora) <= 120),
  isbn            text check (char_length(isbn) <= 20),
  anotacoes       text check (char_length(anotacoes) <= 50000),
  citacoes        text check (char_length(citacoes) <= 50000),
  origem          text not null default 'manual' check (origem in ('manual','notion','skoob')),
  skoob_id        text check (char_length(skoob_id) <= 60),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  check (fim is null or inicio is null or fim >= inicio),
  check (cardinality(generos) <= 10)
);
create index livros_status on public.livros (status);

alter table public.livros enable row level security;
create policy "proprietario_total" on public.livros for all to authenticated
  using (privado.e_proprietario()) with check (privado.e_proprietario());
create trigger livros_auditoria after insert or update or delete on public.livros
  for each row execute function privado.tg_auditoria();
revoke all on public.livros from anon;
revoke truncate, trigger, references on public.livros from authenticated;
