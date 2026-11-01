-- 0006 — Funções usadas pelo sistema (Fase 4).
-- Todas rodam com os direitos de quem chama (security invoker): RLS e a exigência
-- de login em duas etapas continuam valendo dentro delas.

-- Saldo inicial por conta (vem da conferência de 31/12 no fechamento).
alter table public.saldo_inicial_itens add column conta_id bigint references public.contas(id);

-- Saldo calculado numa data: saldo inicial do ano + lançamentos + venda de bens até a data.
create or replace function public.saldo_em(p_data date)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce((select sum(valor) from public.saldo_inicial_itens where ano = extract(year from p_data)::int), 0)
       + coalesce((select sum(efeito_saldo) from public.v_lancamentos
                   where ano = extract(year from p_data)::int and data <= p_data), 0)
       + coalesce((select sum(case when tipo = 'recebimento' then valor else -valor end) from public.recebimentos
                   where extract(year from data)::int = extract(year from p_data)::int and data <= p_data), 0);
$$;

-- Conferência atômica: grava os saldos informados e, se houver diferença, lança o rendimento.
-- p_saldos = [{"conta_id": 1, "saldo": 123.45}, ...]
create or replace function public.registrar_conferencia(p_data date, p_saldos jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_calc numeric; v_total numeric; v_conf bigint; v_lanc bigint; v_sub bigint;
begin
  if p_saldos is null or jsonb_array_length(p_saldos) = 0 then
    raise exception 'Informe o saldo de pelo menos uma conta.';
  end if;
  v_calc := public.saldo_em(p_data);
  select sum((x->>'saldo')::numeric) into v_total from jsonb_array_elements(p_saldos) x;

  insert into public.conferencias (data, saldo_calculado, total_informado)
  values (p_data, v_calc, v_total) returning id into v_conf;

  insert into public.conferencia_saldos (conferencia_id, conta_id, saldo)
  select v_conf, (x->>'conta_id')::bigint, round((x->>'saldo')::numeric, 2) from jsonb_array_elements(p_saldos) x;

  if round(v_total - v_calc, 2) <> 0 then
    select s.id into v_sub from public.subcategorias s join public.categorias c on c.id = s.categoria_id
     where c.grupo = 'Receita' and c.nome = 'Rendimentos' and s.nome = 'Rendimentos';
    if v_sub is null then raise exception 'Subcategoria Receita | Rendimentos | Rendimentos não encontrada.'; end if;
    insert into public.lancamentos (data, valor, descricao, origem, subcategoria_id)
    values (p_data, round(v_total - v_calc, 2), 'Apurado na conferência de saldos', 'conferencia', v_sub)
    returning id into v_lanc;
    update public.conferencias set lancamento_id = v_lanc where id = v_conf;
  end if;
  return v_conf;
end $$;

-- Abre um exercício. Saldo inicial provisório = saldo calculado em 31/12 do ano anterior.
-- O orçamento começa zerado, com as mesmas linhas do ano anterior.
create or replace function public.abrir_exercicio(p_ano int)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.exercicios where ano = p_ano) then
    raise exception 'O exercício % já existe.', p_ano;
  end if;
  if not exists (select 1 from public.exercicios where ano = p_ano - 1) then
    raise exception 'O exercício % não existe.', p_ano - 1;
  end if;
  insert into public.exercicios (ano, status) values (p_ano, 'aberto');
  insert into public.saldo_inicial_itens (ano, descricao, valor, observacao)
  values (p_ano, 'Saldo transportado de ' || (p_ano - 1), public.saldo_em(make_date(p_ano - 1, 12, 31)),
          'Provisório: é recalculado ao fechar ' || (p_ano - 1) || '.');
  insert into public.orcamentos (ano, grupo, categoria_id, valor_base, recebe_suplementacoes)
  select p_ano, o.grupo, o.categoria_id, 0, o.recebe_suplementacoes
    from public.orcamentos o where o.ano = p_ano - 1;
end $$;

-- Fecha um exercício: o saldo inicial do ano seguinte passa a ser o saldo final,
-- conta a conta quando houver conferência em 31/12 sem diferença pendente.
create or replace function public.fechar_exercicio(p_ano int)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_final numeric; v_conf bigint; v_soma numeric;
begin
  if not exists (select 1 from public.exercicios where ano = p_ano and status = 'aberto') then
    raise exception 'O exercício % não está aberto.', p_ano;
  end if;
  if not exists (select 1 from public.exercicios where ano = p_ano + 1) then
    perform public.abrir_exercicio(p_ano + 1);
  end if;
  v_final := public.saldo_em(make_date(p_ano, 12, 31));
  select id into v_conf from public.conferencias where data = make_date(p_ano, 12, 31) order by id desc limit 1;
  select sum(saldo) into v_soma from public.conferencia_saldos where conferencia_id = v_conf;

  delete from public.saldo_inicial_itens where ano = p_ano + 1;
  if v_conf is not null and round(v_soma, 2) = round(v_final, 2) then
    insert into public.saldo_inicial_itens (ano, descricao, valor, conta_id)
    select p_ano + 1, c.instituicao || ' · ' || c.nome, s.saldo, c.id
      from public.conferencia_saldos s join public.contas c on c.id = s.conta_id
     where s.conferencia_id = v_conf and s.saldo <> 0;
  else
    insert into public.saldo_inicial_itens (ano, descricao, valor, observacao)
    values (p_ano + 1, 'Saldo transportado de ' || p_ano, v_final,
            'Sem conferência de 31/12 conciliada: saldo único.');
  end if;
  update public.exercicios set status = 'fechado', fechado_em = now() where ano = p_ano;
end $$;

create or replace function public.reabrir_exercicio(p_ano int)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.exercicios set status = 'aberto', fechado_em = null where ano = p_ano and status = 'fechado';
  if not found then raise exception 'O exercício % não está fechado.', p_ano; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['saldo_em(date)','registrar_conferencia(date,jsonb)','abrir_exercicio(int)','fechar_exercicio(int)','reabrir_exercicio(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
