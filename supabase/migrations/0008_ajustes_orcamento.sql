-- Ajustes do orçamento ao longo do ano: suplementar, reduzir ou remanejar (reduz de uma categoria
-- e suplementa outra). O orçado base fica preservado; cada ajuste é um registro com data e motivo.
-- Um remanejamento são duas linhas com o mesmo lote: −valor na origem e +valor no destino.

create table public.orcamento_ajustes (
  id            bigint generated always as identity primary key,
  orcamento_id  bigint not null references public.orcamentos(id),
  data          date not null,
  valor         numeric(14,2) not null check (valor <> 0),  -- positivo suplementa, negativo reduz
  lote          uuid not null default gen_random_uuid(),
  motivo        text check (char_length(motivo) <= 200),
  criado_em     timestamptz not null default now()
);
create index orcamento_ajustes_orcamento on public.orcamento_ajustes (orcamento_id);
create index orcamento_ajustes_lote on public.orcamento_ajustes (lote);

create trigger orcamento_ajustes_exercicio_aberto before insert or update or delete on public.orcamento_ajustes
  for each row execute function privado.tg_exercicio_aberto();

-- A data do ajuste tem de ser do mesmo ano da linha de orçamento.
create or replace function privado.tg_ajuste_mesmo_ano() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.orcamentos o
                 where o.id = new.orcamento_id and o.ano = extract(year from new.data)::int) then
    raise exception 'A data do ajuste precisa ser do mesmo ano do orçamento.';
  end if;
  return new;
end $$;
create trigger orcamento_ajustes_mesmo_ano before insert or update on public.orcamento_ajustes
  for each row execute function privado.tg_ajuste_mesmo_ano();

alter table public.orcamento_ajustes enable row level security;
create policy "proprietario_total" on public.orcamento_ajustes for all to authenticated
  using (privado.e_proprietario()) with check (privado.e_proprietario());
create trigger orcamento_ajustes_auditoria after insert or update or delete on public.orcamento_ajustes
  for each row execute function privado.tg_auditoria();
revoke all on public.orcamento_ajustes from anon;
revoke truncate, trigger, references on public.orcamento_ajustes from authenticated;

-- Visão do orçamento com os ajustes separados em suplementado e reduzido.
create or replace view public.v_orcamento with (security_invoker = true) as
select o.id, o.ano, o.grupo, o.categoria_id, c.nome as categoria, o.valor_base, o.recebe_suplementacoes,
       case when o.recebe_suplementacoes
            then coalesce((select sum(v.valor) from public.v_lancamentos v where v.ano = o.ano and v.e_suplementacao), 0)
            else 0 end as suplementacoes,
       coalesce((select sum(v.valor) from public.v_lancamentos v
                 where v.ano = o.ano and v.grupo = o.grupo and (o.categoria_id is null or v.categoria_id = o.categoria_id)), 0) as realizado,
       coalesce((select sum(a.valor) from public.orcamento_ajustes a where a.orcamento_id = o.id and a.valor > 0), 0) as ajustes_suplementados,
       coalesce((select -sum(a.valor) from public.orcamento_ajustes a where a.orcamento_id = o.id and a.valor < 0), 0) as ajustes_reduzidos
from public.orcamentos o left join public.categorias c on c.id = o.categoria_id;
revoke all on public.v_orcamento from anon;
