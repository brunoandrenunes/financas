-- =====================================================================
-- Finanças pessoais — estrutura do banco
-- Regras de negócio: ver ESPECIFICACAO.md
-- Usuário único: o acesso é liberado só para quem está na tabela
-- "proprietario" (preenchida quando o Bruno criar o login).
-- =====================================================================

-- ---------- Proprietário (controle de acesso) ----------
create table public.proprietario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create or replace function public.e_proprietario()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.proprietario p where p.user_id = auth.uid());
$$;

-- ---------- Utilitário: atualizado_em ----------
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------- Exercícios (anos) ----------
create table public.exercicios (
  ano          int primary key check (ano between 2000 and 2100),
  status       text not null default 'aberto' check (status in ('aberto','fechado')),
  fechado_em   timestamptz,
  observacao   text,
  criado_em    timestamptz not null default now()
);

-- Composição do saldo inicial de cada exercício
create table public.saldo_inicial_itens (
  id         bigint generated always as identity primary key,
  ano        int not null references public.exercicios(ano),
  descricao  text not null,
  valor      numeric(14,2) not null,
  observacao text
);

-- ---------- Plano de categorias ----------
create table public.categorias (
  id            bigint generated always as identity primary key,
  grupo         text not null check (grupo in ('Receita','Despesa','Investimento','Obra')),
  categoria     text not null,
  subcategoria  text not null,
  ativa         boolean not null default true,
  -- receitas desta categoria aumentam automaticamente o orçado das linhas
  -- de orçamento marcadas com recebe_suplementacoes (ex.: Diárias → Outros)
  suplementa_automaticamente boolean not null default false,
  criado_em     timestamptz not null default now(),
  unique (grupo, categoria, subcategoria)
);

-- ---------- Lançamentos (regime de caixa) ----------
create table public.lancamentos (
  id                   bigint generated always as identity primary key,
  data                 date not null,
  categoria_id         bigint not null references public.categorias(id),
  valor                numeric(14,2) not null check (valor <> 0),   -- negativo = estorno/reembolso
  descricao            text,
  composicao           text,                                         -- ex.: "547,51+65,98"
  suplementa_orcamento boolean not null default false,               -- marcação manual (ex.: FGTS)
  origem               text not null default 'manual' check (origem in ('manual','migracao','conferencia','importacao')),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index lancamentos_data_idx on public.lancamentos (data);
create index lancamentos_categoria_idx on public.lancamentos (categoria_id);
create trigger lancamentos_atualizado_em before update on public.lancamentos
  for each row execute function public.tg_atualizado_em();

-- ---------- Orçamento anual ----------
create table public.orcamentos (
  id                     bigint generated always as identity primary key,
  ano                    int not null references public.exercicios(ano),
  grupo                  text not null check (grupo in ('Despesa','Investimento','Obra')),
  categoria              text,             -- null = orçamento do grupo inteiro (ex.: Obra)
  valor_base             numeric(14,2) not null default 0 check (valor_base >= 0),
  recebe_suplementacoes  boolean not null default false,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create unique index orcamentos_unico on public.orcamentos (ano, grupo, coalesce(categoria, '*'));
create trigger orcamentos_atualizado_em before update on public.orcamentos
  for each row execute function public.tg_atualizado_em();

-- ---------- Contas e conferência de saldos ----------
create table public.contas (
  id          bigint generated always as identity primary key,
  instituicao text not null,
  nome        text not null,
  observacao  text,
  ordem       int not null default 0,
  ativa       boolean not null default true,
  unique (instituicao, nome)
);

create table public.conferencias (
  id               bigint generated always as identity primary key,
  data             date not null,
  saldo_calculado  numeric(14,2) not null,
  total_informado  numeric(14,2) not null,
  rendimento       numeric(14,2) generated always as (total_informado - saldo_calculado) stored,
  lancamento_id    bigint references public.lancamentos(id) on delete set null,
  criado_em        timestamptz not null default now()
);

create table public.conferencia_saldos (
  conferencia_id bigint not null references public.conferencias(id) on delete cascade,
  conta_id       bigint not null references public.contas(id),
  saldo          numeric(14,2) not null,
  primary key (conferencia_id, conta_id)
);

-- ---------- Trava de exercício fechado ----------
create or replace function public.tg_exercicio_aberto()
returns trigger language plpgsql set search_path = '' as $$
declare
  anos int[];
begin
  if tg_op in ('UPDATE','DELETE') then anos := array[extract(year from old.data)::int]; end if;
  if tg_op in ('INSERT','UPDATE') then anos := coalesce(anos, '{}') || extract(year from new.data)::int; end if;
  if exists (select 1 from public.exercicios e where e.ano = any(anos) and e.status = 'fechado') then
    raise exception 'O exercício está fechado. Reabra o ano antes de alterar lançamentos.';
  end if;
  return coalesce(new, old);
end $$;
create trigger lancamentos_exercicio_aberto before insert or update or delete on public.lancamentos
  for each row execute function public.tg_exercicio_aberto();

-- ---------- Auditoria (histórico de alterações) ----------
create table public.auditoria (
  id         bigint generated always as identity primary key,
  tabela     text not null,
  operacao   text not null,
  registro   bigint,
  antes      jsonb,
  depois     jsonb,
  user_id    uuid default auth.uid(),
  em         timestamptz not null default now()
);

create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria (tabela, operacao, registro, antes, depois)
  values (tg_table_name, tg_op,
          coalesce((to_jsonb(new)->>'id')::bigint, (to_jsonb(old)->>'id')::bigint),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger lancamentos_auditoria after insert or update or delete on public.lancamentos
  for each row execute function public.tg_auditoria();
create trigger orcamentos_auditoria after insert or update or delete on public.orcamentos
  for each row execute function public.tg_auditoria();
create trigger exercicios_auditoria after update on public.exercicios
  for each row execute function public.tg_auditoria();

-- ---------- Visões de consulta ----------
create view public.v_lancamentos with (security_invoker = true) as
select l.id, l.data,
       extract(year from l.data)::int  as ano,
       extract(month from l.data)::int as mes,
       c.grupo, c.categoria, c.subcategoria,
       l.valor,
       case when c.grupo = 'Receita' then l.valor else -l.valor end as efeito_saldo,
       l.descricao, l.composicao, l.suplementa_orcamento, l.origem,
       (c.grupo = 'Receita' and (c.suplementa_automaticamente or l.suplementa_orcamento)) as e_suplementacao,
       l.categoria_id, l.criado_em, l.atualizado_em
from public.lancamentos l
join public.categorias c on c.id = l.categoria_id;

create view public.v_orcamento with (security_invoker = true) as
select o.id, o.ano, o.grupo, o.categoria, o.valor_base, o.recebe_suplementacoes,
       case when o.recebe_suplementacoes then coalesce((
         select sum(v.valor) from public.v_lancamentos v
         where v.ano = o.ano and v.e_suplementacao), 0) else 0 end as suplementacoes,
       coalesce((
         select sum(v.valor) from public.v_lancamentos v
         where v.ano = o.ano and v.grupo = o.grupo
           and (o.categoria is null or v.categoria = o.categoria)), 0) as realizado
from public.orcamentos o;

create view public.v_saldo_mensal with (security_invoker = true) as
with ini as (
  select e.ano, coalesce(sum(s.valor), 0) as saldo_inicial
  from public.exercicios e left join public.saldo_inicial_itens s on s.ano = e.ano
  group by e.ano
), meses as (
  select ini.ano, m.mes, ini.saldo_inicial from ini cross join generate_series(1, 12) as m(mes)
), mov as (
  select ano, mes,
         sum(valor) filter (where grupo = 'Receita')      as receitas,
         sum(valor) filter (where grupo = 'Despesa')      as despesas,
         sum(valor) filter (where grupo = 'Investimento') as investimentos,
         sum(valor) filter (where grupo = 'Obra')         as obra
  from public.v_lancamentos group by ano, mes
)
select m.ano, m.mes,
       coalesce(mov.receitas,0) as receitas, coalesce(mov.despesas,0) as despesas,
       coalesce(mov.investimentos,0) as investimentos, coalesce(mov.obra,0) as obra,
       coalesce(mov.receitas,0) - coalesce(mov.despesas,0) as resultado,
       coalesce(mov.receitas,0) - coalesce(mov.despesas,0) - coalesce(mov.investimentos,0) - coalesce(mov.obra,0) as variacao_saldo,
       m.saldo_inicial + sum(coalesce(mov.receitas,0) - coalesce(mov.despesas,0) - coalesce(mov.investimentos,0) - coalesce(mov.obra,0))
         over (partition by m.ano order by m.mes) as saldo_final
from meses m left join mov on mov.ano = m.ano and mov.mes = m.mes;

-- ---------- Segurança: RLS em tudo, acesso só do proprietário ----------
do $$
declare t text;
begin
  foreach t in array array['proprietario','exercicios','saldo_inicial_itens','categorias','lancamentos',
                           'orcamentos','contas','conferencias','conferencia_saldos','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['exercicios','saldo_inicial_itens','categorias','lancamentos',
                           'orcamentos','contas','conferencias','conferencia_saldos'] loop
    execute format('create policy "proprietario_total" on public.%I for all to authenticated using (public.e_proprietario()) with check (public.e_proprietario())', t);
  end loop;
end $$;

-- auditoria: só leitura (gravada pelos gatilhos)
create policy "proprietario_le" on public.auditoria for select to authenticated using (public.e_proprietario());
-- proprietario: cada um só enxerga a própria linha
create policy "ve_a_si_mesmo" on public.proprietario for select to authenticated using (user_id = auth.uid());

revoke all on all tables in schema public from anon;
revoke execute on function public.e_proprietario() from anon;
