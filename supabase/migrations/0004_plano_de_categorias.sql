-- =====================================================================
-- Plano de categorias em dois níveis (categoria → subcategoria),
-- tipos de conta (corrente / investimento / a receber) e recebíveis.
-- Pedido do Bruno em 31/10/2026: integridade como no Excel e cadastros editáveis.
-- =====================================================================

-- ---------- Novas tabelas de classificação ----------
create table public.cat_nova (
  id        bigint generated always as identity primary key,
  grupo     text not null check (grupo in ('Receita','Despesa','Investimento','Obra')),
  nome      text not null check (btrim(nome) <> ''),
  ativa     boolean not null default true,
  suplementa_automaticamente boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (grupo, nome),
  unique (id, grupo)
);

create table public.subcategorias (
  id           bigint generated always as identity primary key,
  categoria_id bigint not null references public.cat_nova(id),
  nome         text not null check (btrim(nome) <> ''),
  ativa        boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (categoria_id, nome)
);

insert into public.cat_nova (grupo, nome, suplementa_automaticamente)
select grupo, categoria, bool_or(suplementa_automaticamente)
from public.categorias group by grupo, categoria order by grupo, categoria;

insert into public.subcategorias (categoria_id, nome)
select n.id, c.subcategoria
from public.categorias c join public.cat_nova n on n.grupo = c.grupo and n.nome = c.categoria
order by n.id, c.subcategoria;

-- ---------- Religar lançamentos e orçamentos ----------
drop view public.v_saldo_mensal;
drop view public.v_orcamento;
drop view public.v_lancamentos;

alter table public.lancamentos add column subcategoria_id bigint references public.subcategorias(id);
alter table public.lancamentos disable trigger lancamentos_exercicio_aberto;
alter table public.lancamentos disable trigger lancamentos_atualizado_em;
alter table public.lancamentos disable trigger lancamentos_auditoria;
update public.lancamentos l set subcategoria_id = s.id
from public.categorias c
join public.cat_nova n on n.grupo = c.grupo and n.nome = c.categoria
join public.subcategorias s on s.categoria_id = n.id and s.nome = c.subcategoria
where c.id = l.categoria_id;
alter table public.lancamentos enable trigger lancamentos_exercicio_aberto;
alter table public.lancamentos enable trigger lancamentos_atualizado_em;
alter table public.lancamentos enable trigger lancamentos_auditoria;
alter table public.lancamentos alter column subcategoria_id set not null;
alter table public.lancamentos drop column categoria_id;
create index lancamentos_subcategoria_idx on public.lancamentos (subcategoria_id);

alter table public.orcamentos disable trigger orcamentos_trava;
alter table public.orcamentos disable trigger orcamentos_atualizado_em;
alter table public.orcamentos disable trigger orcamentos_auditoria;
alter table public.orcamentos add column categoria_id bigint;
update public.orcamentos o set categoria_id = n.id
from public.cat_nova n where n.grupo = o.grupo and n.nome = o.categoria;
alter table public.orcamentos enable trigger orcamentos_trava;
alter table public.orcamentos enable trigger orcamentos_atualizado_em;
alter table public.orcamentos enable trigger orcamentos_auditoria;
drop index public.orcamentos_unico;
alter table public.orcamentos drop column categoria;
alter table public.orcamentos add constraint orcamentos_categoria_do_grupo
  foreign key (categoria_id, grupo) references public.cat_nova(id, grupo);
create unique index orcamentos_unico on public.orcamentos (ano, grupo, coalesce(categoria_id, 0));

drop table public.categorias;
alter table public.cat_nova rename to categorias;
alter table public.categorias rename constraint cat_nova_pkey to categorias_pkey;

-- ---------- Regras de integridade do plano ----------
create or replace function privado.tg_categoria_protegida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.grupo, new.suplementa_automaticamente) is distinct from (old.grupo, old.suplementa_automaticamente)
     and exists (select 1 from public.lancamentos l join public.subcategorias s on s.id = l.subcategoria_id
                 where s.categoria_id = old.id) then
    raise exception 'Categoria já usada em lançamentos: não é possível mudar o grupo nem a regra de suplementação. Crie uma nova categoria.';
  end if;
  return new;
end $$;
create trigger categorias_protegida before update on public.categorias
  for each row execute function privado.tg_categoria_protegida();

create or replace function privado.tg_subcategoria_protegida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.categoria_id is distinct from old.categoria_id
     and exists (select 1 from public.lancamentos l where l.subcategoria_id = old.id) then
    raise exception 'Subcategoria já usada em lançamentos: não pode mudar de categoria. Crie uma nova e reclassifique os lançamentos do ano aberto.';
  end if;
  return new;
end $$;
create trigger subcategorias_protegida before update on public.subcategorias
  for each row execute function privado.tg_subcategoria_protegida();

-- Lançamento novo (ou reclassificado) só em subcategoria e categoria ativas
create or replace function privado.tg_lancamento_classificacao() returns trigger
language plpgsql set search_path = '' as $$
declare r record;
begin
  if tg_op = 'INSERT' or new.subcategoria_id is distinct from old.subcategoria_id then
    select s.ativa as sub_ativa, c.ativa as cat_ativa, c.grupo into r
    from public.subcategorias s join public.categorias c on c.id = s.categoria_id where s.id = new.subcategoria_id;
    if not (r.sub_ativa and r.cat_ativa) then
      raise exception 'Categoria ou subcategoria desativada: escolha outra classificação.';
    end if;
  else
    select c.grupo into r from public.subcategorias s join public.categorias c on c.id = s.categoria_id where s.id = new.subcategoria_id;
  end if;
  if new.suplementa_orcamento and r.grupo <> 'Receita' then
    raise exception 'Só receitas podem suplementar o orçamento.';
  end if;
  return new;
end $$;
create trigger lancamentos_classificacao before insert or update on public.lancamentos
  for each row execute function privado.tg_lancamento_classificacao();

-- ---------- Contas: tipo ----------
alter table public.contas add column tipo text not null default 'investimento'
  check (tipo in ('conta_corrente','investimento','a_receber'));
update public.contas set tipo = 'a_receber' where nome = 'Venda do apartamento — a receber';
update public.contas set ordem = ordem + 3;
insert into public.contas (instituicao, nome, tipo, ordem) values
  ('Nubank','Conta corrente','conta_corrente',1),
  ('Inter','Conta corrente','conta_corrente',2),
  ('Santander','Conta corrente','conta_corrente',3);

-- ---------- Valores a receber (ex.: venda do apartamento) ----------
-- O valor a receber já faz parte do saldo; receber uma parcela só troca o
-- dinheiro de lugar (a receber → conta). Não é receita e não mexe na DRE.
create table public.recebiveis (
  id             bigint generated always as identity primary key,
  conta_id       bigint not null unique references public.contas(id),
  descricao      text not null,
  data_base      date not null,
  valor_na_data_base numeric(14,2) not null check (valor_na_data_base >= 0),
  observacao     text,
  criado_em      timestamptz not null default now()
);

create table public.recebimentos (
  id               bigint generated always as identity primary key,
  recebivel_id     bigint not null references public.recebiveis(id),
  data             date not null,
  valor            numeric(14,2) not null check (valor > 0),
  conta_destino_id bigint references public.contas(id),
  observacao       text,
  criado_em        timestamptz not null default now()
);
create trigger recebimentos_exercicio_aberto before insert or update or delete on public.recebimentos
  for each row execute function privado.tg_exercicio_aberto();

-- ---------- Visões ----------
create view public.v_lancamentos with (security_invoker = true) as
select l.id, l.data,
       extract(year from l.data)::int  as ano,
       extract(month from l.data)::int as mes,
       c.grupo, c.nome as categoria, s.nome as subcategoria,
       l.valor,
       case when c.grupo = 'Receita' then l.valor else -l.valor end as efeito_saldo,
       l.descricao, l.composicao, l.suplementa_orcamento, l.origem,
       (c.grupo = 'Receita' and (c.suplementa_automaticamente or l.suplementa_orcamento)) as e_suplementacao,
       l.subcategoria_id, c.id as categoria_id, l.criado_em, l.atualizado_em
from public.lancamentos l
join public.subcategorias s on s.id = l.subcategoria_id
join public.categorias c on c.id = s.categoria_id;

create view public.v_orcamento with (security_invoker = true) as
select o.id, o.ano, o.grupo, o.categoria_id, c.nome as categoria, o.valor_base, o.recebe_suplementacoes,
       case when o.recebe_suplementacoes then coalesce((
         select sum(v.valor) from public.v_lancamentos v
         where v.ano = o.ano and v.e_suplementacao), 0) else 0 end as suplementacoes,
       coalesce((
         select sum(v.valor) from public.v_lancamentos v
         where v.ano = o.ano and v.grupo = o.grupo
           and (o.categoria_id is null or v.categoria_id = o.categoria_id)), 0) as realizado
from public.orcamentos o left join public.categorias c on c.id = o.categoria_id;

create view public.v_saldo_mensal with (security_invoker = true) as
with ini as (
  select e.ano, coalesce(sum(s.valor), 0) as saldo_inicial, count(s.id) > 0 as tem_saldo_inicial
  from public.exercicios e left join public.saldo_inicial_itens s on s.ano = e.ano
  group by e.ano
), meses as (
  select ini.ano, m.mes, ini.saldo_inicial, ini.tem_saldo_inicial from ini cross join generate_series(1, 12) as m(mes)
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
         over (partition by m.ano order by m.mes) as saldo_final,
       m.tem_saldo_inicial
from meses m left join mov on mov.ano = m.ano and mov.mes = m.mes;

create view public.v_recebiveis with (security_invoker = true) as
select r.id, r.descricao, r.conta_id, r.data_base, r.valor_na_data_base,
       coalesce(sum(m.valor), 0) as recebido,
       r.valor_na_data_base - coalesce(sum(m.valor), 0) as saldo_a_receber
from public.recebiveis r left join public.recebimentos m on m.recebivel_id = r.id and m.data >= r.data_base
group by r.id;

-- ---------- Segurança e auditoria das novas tabelas ----------
do $$
declare t text;
begin
  foreach t in array array['categorias','subcategorias','recebiveis','recebimentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "proprietario_total" on public.%I for all to authenticated using (privado.e_proprietario()) with check (privado.e_proprietario())', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.tg_auditoria()', t||'_auditoria', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;
revoke all on public.v_lancamentos, public.v_orcamento, public.v_saldo_mensal, public.v_recebiveis from anon;
