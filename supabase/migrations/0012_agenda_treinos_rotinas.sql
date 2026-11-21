-- Área pessoal, etapa 2: treinos, rotinas (hábitos marcados por dia), metas personalizadas e a
-- configuração da agenda (endereço secreto do Google Agenda, lido só pela rota do servidor).

create table public.treinos (
  id             bigint generated always as identity primary key,
  data           date not null,
  tipo           text not null check (char_length(tipo) between 1 and 60),
  numero         integer check (numero > 0),
  duracao_min    smallint check (duracao_min between 1 and 600),
  observacao     text check (char_length(observacao) <= 2000),
  origem         text not null default 'manual' check (origem in ('manual','notion')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz
);
create index treinos_data on public.treinos (data);

create table public.rotinas (
  id         bigint generated always as identity primary key,
  nome       text not null check (char_length(nome) between 1 and 80),
  -- dias da semana em que a rotina vale: 0 = domingo ... 6 = sábado
  dias       smallint[] not null default '{0,1,2,3,4,5,6}'
             check (cardinality(dias) between 1 and 7 and dias <@ '{0,1,2,3,4,5,6}'::smallint[]),
  ativa      boolean not null default true,
  ordem      integer,
  criado_em  timestamptz not null default now()
);

create table public.rotina_marcas (
  rotina_id  bigint not null references public.rotinas (id) on delete cascade,
  data       date not null,
  primary key (rotina_id, data)
);

-- Configurações da área pessoal. 'agenda_ics' guarda [{nome, url}] dos calendários do Google
-- (endereço secreto iCal). Fica fora da auditoria para o endereço não se espalhar.
create table public.pes_config (
  chave          text primary key check (chave in ('agenda_ics','treino_ciclo')),
  valor          jsonb not null check (jsonb_typeof(valor) = 'array' and jsonb_array_length(valor) <= 10),
  atualizado_em  timestamptz not null default now()
);

-- Metas personalizadas: valor atual informado à mão e unidade (ex.: "km", "R$").
alter table public.metas
  add column atual   numeric(14,2) check (atual >= 0),
  add column unidade text check (char_length(unidade) <= 20);

do $$
declare t text;
begin
  foreach t in array array['treinos','rotinas','rotina_marcas','pes_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "proprietario_total" on public.%I for all to authenticated using (privado.e_proprietario()) with check (privado.e_proprietario())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;

create trigger treinos_auditoria after insert or update or delete on public.treinos
  for each row execute function privado.tg_auditoria();
create trigger rotinas_auditoria after insert or update or delete on public.rotinas
  for each row execute function privado.tg_auditoria();
