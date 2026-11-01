-- Reforços apontados na revisão da Fase 3 (revisor Opus, 31/10/2026)

-- 1. Acesso exige login com verificação em duas etapas (token aal2)
create or replace function privado.e_proprietario() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proprietario p where p.user_id = auth.uid())
     and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

-- 2. Categoria já usada não pode mudar de grupo/nome/regra (preserva o histórico)
create or replace function privado.tg_categoria_protegida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.grupo, new.categoria, new.subcategoria, new.suplementa_automaticamente)
     is distinct from (old.grupo, old.categoria, old.subcategoria, old.suplementa_automaticamente)
     and exists (select 1 from public.lancamentos l where l.categoria_id = old.id) then
    raise exception 'Categoria já usada em lançamentos: crie uma nova e desative esta.';
  end if;
  return new;
end $$;
create trigger categorias_protegida before update on public.categorias
  for each row execute function privado.tg_categoria_protegida();

-- 3 e 4. Trava de exercício: o ano precisa existir e estar aberto
create or replace function public.tg_exercicio_aberto()
returns trigger language plpgsql set search_path = '' as $$
declare
  anos int[];
begin
  if tg_op in ('UPDATE','DELETE') then anos := array[extract(year from old.data)::int]; end if;
  if tg_op in ('INSERT','UPDATE') then anos := coalesce(anos, '{}') || extract(year from new.data)::int; end if;
  if exists (select 1 from unnest(anos) y
             where not exists (select 1 from public.exercicios e where e.ano = y and e.status = 'aberto')) then
    raise exception 'O exercício deste ano está fechado ou ainda não foi aberto.';
  end if;
  return coalesce(new, old);
end $$;
alter function public.tg_exercicio_aberto() set schema privado;

create or replace function privado.tg_trava_ano() returns trigger
language plpgsql set search_path = '' as $$
declare a int[];
begin
  if tg_op <> 'INSERT' then a := array[(to_jsonb(old)->>'ano')::int]; end if;
  if tg_op <> 'DELETE' then a := coalesce(a, '{}') || (to_jsonb(new)->>'ano')::int; end if;
  if exists (select 1 from public.exercicios e where e.ano = any(a) and e.status = 'fechado') then
    raise exception 'O exercício está fechado. Reabra o ano antes de alterar.';
  end if;
  return coalesce(new, old);
end $$;
create trigger orcamentos_trava before insert or update or delete on public.orcamentos
  for each row execute function privado.tg_trava_ano();
create trigger saldo_inicial_trava before insert or update or delete on public.saldo_inicial_itens
  for each row execute function privado.tg_trava_ano();
create trigger conferencias_trava before insert or update or delete on public.conferencias
  for each row execute function privado.tg_exercicio_aberto();

create or replace function privado.tg_trava_conferencia_saldo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.conferencias c join public.exercicios e on e.ano = extract(year from c.data)::int
             where c.id in (old.conferencia_id, new.conferencia_id) and e.status = 'fechado') then
    raise exception 'O exercício está fechado. Reabra o ano antes de alterar.';
  end if;
  return coalesce(new, old);
end $$;
create trigger conferencia_saldos_trava before insert or update or delete on public.conferencia_saldos
  for each row execute function privado.tg_trava_conferencia_saldo();

alter table public.exercicios add constraint exercicios_fechamento_coerente
  check ((status = 'fechado') = (fechado_em is not null));

-- 5. Funções e tabelas criadas no futuro não nascem abertas ao público
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on all functions in schema privado from public, anon;
grant execute on function privado.e_proprietario() to authenticated;

-- 6. Auditoria cobre todas as tabelas
create or replace function privado.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  insert into public.auditoria (tabela, operacao, registro, antes, depois)
  values (tg_table_name, tg_op,
          coalesce(j->>'id', j->>'ano', j->>'conferencia_id')::bigint,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function privado.tg_auditoria() from public, anon, authenticated;
drop trigger exercicios_auditoria on public.exercicios;
create trigger exercicios_auditoria after insert or update or delete on public.exercicios
  for each row execute function privado.tg_auditoria();
do $$
declare t text;
begin
  foreach t in array array['categorias','saldo_inicial_itens','contas','conferencias','conferencia_saldos','proprietario'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.tg_auditoria()', t||'_auditoria', t);
  end loop;
end $$;

-- 7. Só uma linha de orçamento por ano recebe as suplementações
create unique index orcamentos_uma_suplementada on public.orcamentos (ano) where recebe_suplementacoes;

-- 8. Aviso quando um ano não tem saldo inicial cadastrado
create or replace view public.v_saldo_mensal with (security_invoker = true) as
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

-- 10. Proteção extra: a API não usa estes comandos
revoke truncate, trigger, references on all tables in schema public from authenticated;
