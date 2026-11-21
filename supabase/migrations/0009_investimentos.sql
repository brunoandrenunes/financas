-- Área de investimentos (carteira da filha). Separada das finanças pessoais: não entra em
-- lançamentos, DRE, saldo nem orçamento. Os cálculos de posição, custo em R$ e IR são feitos
-- na tela a partir dos movimentos; o banco guarda só os fatos.

create table public.inv_corretoras (
  id          bigint generated always as identity primary key,
  nome        text not null unique check (char_length(nome) between 1 and 60),
  moeda       text not null check (moeda in ('USD','BRL')),
  ativa       boolean not null default true,
  observacao  text check (char_length(observacao) <= 300),
  criado_em   timestamptz not null default now()
);

create table public.inv_ativos (
  id          bigint generated always as identity primary key,
  codigo      text not null unique check (codigo ~ '^[A-Z0-9]{1,12}$'),
  nome        text not null check (char_length(nome) between 1 and 120),
  tipo        text not null check (tipo in ('ETF','ETN','Ação','FII')),
  moeda       text not null check (moeda in ('USD','BRL')),
  criado_em   timestamptz not null default now()
);

-- valor: na moeda da corretora, sempre positivo (o tipo diz se entra ou sai), exceto saldo
-- inicial de caixa, que pode ser negativo. valor_brl: reais pagos no câmbio (com IOF),
-- reais recebidos na remessa de volta, ou custo declarado no IR (saldo inicial).
create table public.inv_movimentos (
  id               bigint generated always as identity primary key,
  corretora_id     bigint not null references public.inv_corretoras(id),
  ativo_id         bigint references public.inv_ativos(id),
  data             date not null,             -- data do pregão (ou do crédito)
  data_liquidacao  date,
  tipo             text not null check (tipo in ('saldo_inicial','compra','venda','dividendo','jcp','rendimento',
                                                  'imposto_retido','taxa','cambio_entrada','cambio_saida')),
  quantidade       numeric(20,8) check (quantidade > 0),
  preco            numeric(18,6) check (preco >= 0),
  valor            numeric(14,2) not null,
  valor_brl        numeric(14,2),
  iof              numeric(14,2) check (iof >= 0),
  documento        text check (char_length(documento) <= 200),
  observacao       text check (char_length(observacao) <= 300),
  criado_em        timestamptz not null default now(),
  check (valor >= 0 or tipo = 'saldo_inicial'),
  check (tipo not in ('compra','venda') or (ativo_id is not null and quantidade is not null)),
  check (tipo not in ('cambio_entrada','cambio_saida','taxa') or ativo_id is null),
  check (tipo <> 'cambio_entrada' or valor_brl is not null),
  check (tipo not in ('dividendo','jcp','rendimento','imposto_retido') or ativo_id is not null)
);
create index inv_movimentos_data on public.inv_movimentos (data);
create index inv_movimentos_corretora on public.inv_movimentos (corretora_id);

-- Cotação oficial do dólar (Banco Central) por dia útil.
create table public.inv_ptax (
  data    date primary key,
  compra  numeric(10,4) not null check (compra > 0),
  venda   numeric(10,4) not null check (venda > 0)
);

-- Última cotação conhecida de cada ativo.
create table public.inv_cotacoes (
  ativo_id       bigint primary key references public.inv_ativos(id),
  preco          numeric(18,6) not null check (preco > 0),
  atualizado_em  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['inv_corretoras','inv_ativos','inv_movimentos','inv_ptax','inv_cotacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "proprietario_total" on public.%I for all to authenticated using (privado.e_proprietario()) with check (privado.e_proprietario())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
  -- Cotações mudam todo dia: auditoria só nos cadastros e movimentos.
  foreach t in array array['inv_corretoras','inv_ativos','inv_movimentos'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.tg_auditoria()', t||'_auditoria', t);
  end loop;
end $$;
