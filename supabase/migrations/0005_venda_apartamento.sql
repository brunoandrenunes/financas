-- 0005 — Venda do apartamento com os valores reais (31/10/2026).
-- O saldo inicial de 2026 tem só o que já entrou (líquido da 1ª corretagem).
-- O que falta receber NÃO está no saldo: cada recebimento entra no saldo como
-- movimento patrimonial (abaixo do resultado, não é receita), e a corretagem
-- da 2ª parte sai do mesmo jeito. Tabelas estavam vazias: recriadas.

drop view public.v_recebiveis;
drop view public.v_saldo_mensal;
drop table public.recebimentos;
drop table public.recebiveis;

-- A conta "a receber" deixa de existir: o valor pendente não compõe o saldo.
delete from public.contas where tipo = 'a_receber';
alter table public.contas drop constraint contas_tipo_check;
alter table public.contas add constraint contas_tipo_check check (tipo in ('conta_corrente','investimento'));

-- (descrição do saldo inicial ajustada na carga supabase/seed/0002_venda_apartamento.sql)

-- ---------- Recebíveis ----------
create table public.recebiveis (
  id               bigint generated always as identity primary key,
  descricao        text not null,
  valor_contratado numeric(14,2) not null check (valor_contratado > 0),
  vencimento       date not null,
  recebido_antes   numeric(14,2) not null default 0 check (recebido_antes >= 0),  -- já incluído no saldo inicial
  custo_descricao  text,
  custo_previsto   numeric(14,2) not null default 0 check (custo_previsto >= 0),
  observacao       text,
  criado_em        timestamptz not null default now(),
  check (recebido_antes <= valor_contratado)
);

-- tipo 'recebimento' aumenta o saldo; 'custo' (ex.: corretagem) diminui.
create table public.recebimentos (
  id            bigint generated always as identity primary key,
  recebivel_id  bigint not null references public.recebiveis(id),
  data          date not null,
  tipo          text not null default 'recebimento' check (tipo in ('recebimento','custo')),
  valor         numeric(14,2) not null check (valor > 0),
  conta_id      bigint references public.contas(id),   -- conta de destino (ou de onde saiu o custo)
  observacao    text,
  criado_em     timestamptz not null default now()
);
create trigger recebimentos_exercicio_aberto before insert or update or delete on public.recebimentos
  for each row execute function privado.tg_exercicio_aberto();

-- ---------- Visões ----------
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
), pat as (
  select extract(year from data)::int as ano, extract(month from data)::int as mes,
         sum(case when tipo = 'recebimento' then valor else -valor end) as venda_bens
  from public.recebimentos group by 1, 2
), j as (
  select m.ano, m.mes, m.saldo_inicial, m.tem_saldo_inicial,
         coalesce(mov.receitas,0) as receitas, coalesce(mov.despesas,0) as despesas,
         coalesce(mov.investimentos,0) as investimentos, coalesce(mov.obra,0) as obra,
         coalesce(pat.venda_bens,0) as venda_bens
  from meses m
  left join mov on mov.ano = m.ano and mov.mes = m.mes
  left join pat on pat.ano = m.ano and pat.mes = m.mes
)
select ano, mes, receitas, despesas, investimentos, obra,
       receitas - despesas as resultado,
       venda_bens,
       receitas - despesas - investimentos - obra + venda_bens as variacao_saldo,
       saldo_inicial + sum(receitas - despesas - investimentos - obra + venda_bens)
         over (partition by ano order by mes) as saldo_final,
       tem_saldo_inicial
from j;

create view public.v_recebiveis with (security_invoker = true) as
with m as (
  select recebivel_id,
         coalesce(sum(valor) filter (where tipo = 'recebimento'), 0) as recebido,
         coalesce(sum(valor) filter (where tipo = 'custo'), 0)       as custo_pago
  from public.recebimentos group by recebivel_id
)
select r.id, r.descricao, r.vencimento, r.valor_contratado, r.recebido_antes,
       coalesce(m.recebido, 0) as recebido,
       r.valor_contratado - r.recebido_antes - coalesce(m.recebido, 0) as saldo_a_receber,
       r.custo_descricao, r.custo_previsto,
       coalesce(m.custo_pago, 0) as custo_pago,
       r.custo_previsto - coalesce(m.custo_pago, 0) as custo_a_pagar,
       (r.valor_contratado - r.recebido_antes - coalesce(m.recebido, 0))
         - (r.custo_previsto - coalesce(m.custo_pago, 0)) as liquido_a_entrar
from public.recebiveis r left join m on m.recebivel_id = r.id;

-- ---------- Segurança e auditoria ----------
do $$
declare t text;
begin
  foreach t in array array['recebiveis','recebimentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "proprietario_total" on public.%I for all to authenticated using (privado.e_proprietario()) with check (privado.e_proprietario())', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.tg_auditoria()', t||'_auditoria', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;
revoke all on public.v_saldo_mensal, public.v_recebiveis from anon;

-- Os dados reais do recebível ficam em supabase/seed/0002_venda_apartamento.sql (fora do repositório).
