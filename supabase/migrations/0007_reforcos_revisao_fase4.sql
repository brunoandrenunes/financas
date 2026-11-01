-- 0007 — Ajustes da revisão da Fase 4.
-- Conferência: recusa data anterior à última do ano e arredonda cada saldo antes de somar.
-- Exclusão de conferência (com o rendimento dela) e de movimento do recebível.
-- Fechamento informa como transportou o saldo; reabertura respeita o ano seguinte.

create or replace function public.registrar_conferencia(p_data date, p_saldos jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_calc numeric; v_total numeric; v_conf bigint; v_lanc bigint; v_sub bigint; v_ult date;
begin
  if p_saldos is null or jsonb_array_length(p_saldos) = 0 then
    raise exception 'Informe o saldo de pelo menos uma conta.';
  end if;
  select max(data) into v_ult from public.conferencias
   where extract(year from data) = extract(year from p_data);
  if v_ult is not null and p_data < v_ult then
    raise exception 'Já existe conferência em % (posterior a esta data). Exclua-a antes de registrar uma conferência anterior.', to_char(v_ult, 'DD/MM/YYYY');
  end if;
  v_calc := public.saldo_em(p_data);
  select sum(round((x->>'saldo')::numeric, 2)) into v_total from jsonb_array_elements(p_saldos) x;

  insert into public.conferencias (data, saldo_calculado, total_informado)
  values (p_data, v_calc, v_total) returning id into v_conf;

  insert into public.conferencia_saldos (conferencia_id, conta_id, saldo)
  select v_conf, (x->>'conta_id')::bigint, round((x->>'saldo')::numeric, 2) from jsonb_array_elements(p_saldos) x;

  if v_total - v_calc <> 0 then
    select s.id into v_sub from public.subcategorias s join public.categorias c on c.id = s.categoria_id
     where c.grupo = 'Receita' and c.nome = 'Rendimentos' and s.nome = 'Rendimentos';
    if v_sub is null then raise exception 'Subcategoria Receita | Rendimentos | Rendimentos não encontrada.'; end if;
    insert into public.lancamentos (data, valor, descricao, origem, subcategoria_id)
    values (p_data, v_total - v_calc, 'Apurado na conferência de saldos', 'conferencia', v_sub)
    returning id into v_lanc;
    update public.conferencias set lancamento_id = v_lanc where id = v_conf;
  end if;
  return v_conf;
end $$;

-- Exclui a conferência, os saldos dela e o lançamento de rendimento que ela gerou.
create or replace function public.excluir_conferencia(p_id bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_lanc bigint;
begin
  select lancamento_id into v_lanc from public.conferencias where id = p_id;
  if not found then raise exception 'Conferência não encontrada.'; end if;
  delete from public.conferencia_saldos where conferencia_id = p_id;
  delete from public.conferencias where id = p_id;
  if v_lanc is not null then delete from public.lancamentos where id = v_lanc; end if;
end $$;

drop function public.fechar_exercicio(int);
create function public.fechar_exercicio(p_ano int)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_final numeric; v_conf bigint; v_soma numeric;
begin
  if not exists (select 1 from public.exercicios where ano = p_ano and status = 'aberto') then
    raise exception 'O exercício % não está aberto.', p_ano;
  end if;
  if exists (select 1 from public.exercicios where ano = p_ano + 1 and status = 'fechado') then
    raise exception 'O exercício % está fechado. Reabra % antes de fechar %.', p_ano + 1, p_ano + 1, p_ano;
  end if;
  if not exists (select 1 from public.exercicios where ano = p_ano + 1) then
    perform public.abrir_exercicio(p_ano + 1);
  end if;
  v_final := public.saldo_em(make_date(p_ano, 12, 31));
  select id into v_conf from public.conferencias where data = make_date(p_ano, 12, 31) order by id desc limit 1;
  select sum(saldo) into v_soma from public.conferencia_saldos where conferencia_id = v_conf;

  delete from public.saldo_inicial_itens where ano = p_ano + 1;
  update public.exercicios set status = 'fechado', fechado_em = now() where ano = p_ano;
  if v_conf is not null and v_soma = v_final then
    insert into public.saldo_inicial_itens (ano, descricao, valor, conta_id)
    select p_ano + 1, c.instituicao || ' · ' || c.nome, s.saldo, c.id
      from public.conferencia_saldos s join public.contas c on c.id = s.conta_id
     where s.conferencia_id = v_conf and s.saldo <> 0;
    return 'por conta, a partir da conferência de 31/12';
  end if;
  insert into public.saldo_inicial_itens (ano, descricao, valor, observacao)
  values (p_ano + 1, 'Saldo transportado de ' || p_ano, v_final,
          'Sem conferência de 31/12 conciliada: saldo único.');
  return case when v_conf is null then 'em valor único (não há conferência em 31/12)'
              else 'em valor único (a conferência de 31/12 não bate com o saldo calculado)' end;
end $$;

create or replace function public.reabrir_exercicio(p_ano int)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.exercicios where ano = p_ano + 1 and status = 'fechado') then
    raise exception 'Reabra primeiro o exercício %.', p_ano + 1;
  end if;
  update public.exercicios set status = 'aberto', fechado_em = null where ano = p_ano and status = 'fechado';
  if not found then raise exception 'O exercício % não está fechado.', p_ano; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['registrar_conferencia(date,jsonb)','excluir_conferencia(bigint)','fechar_exercicio(int)','reabrir_exercicio(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
