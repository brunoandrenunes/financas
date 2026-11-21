import { createClient } from "@supabase/supabase-js";

// Busca cotações (Yahoo Finance) e a PTAX do Banco Central para a área de investimentos.
// Roda no servidor porque o navegador só pode conversar com o próprio site e com o Supabase.
// Só atende quem está logado; não guarda nada: quem grava no banco é a própria tela.

const SIMBOLO = /^[A-Z0-9]{1,12}(\.SA)?$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function cotacao(simbolo: string): Promise<number | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${simbolo}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const preco = (await r.json())?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof preco === "number" && preco > 0 ? preco : null;
  } catch {
    return null;
  }
}

async function ptax(de: string, ate: string) {
  const mdY = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;
  const url = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
    + `?@dataInicial='${mdY(de)}'&@dataFinalCotacao='${mdY(ate)}'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Banco Central fora do ar");
  const v: { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }[] = (await r.json()).value ?? [];
  // Em dias com mais de um boletim, vale o último (fechamento).
  const porDia = new Map<string, { data: string; compra: number; venda: number }>();
  for (const x of v) porDia.set(x.dataHoraCotacao.slice(0, 10), { data: x.dataHoraCotacao.slice(0, 10), compra: x.cotacaoCompra, venda: x.cotacaoVenda });
  return [...porDia.values()];
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ erro: "Não autenticado" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u.user) return Response.json({ erro: "Não autenticado" }, { status: 401 });

  let corpo: { simbolos?: unknown; ptaxDe?: unknown };
  try { corpo = await req.json(); } catch { return Response.json({ erro: "Pedido inválido" }, { status: 400 }); }
  const simbolos = Array.isArray(corpo.simbolos) ? corpo.simbolos.filter((s): s is string => typeof s === "string" && SIMBOLO.test(s)).slice(0, 40) : [];
  const ptaxDe = typeof corpo.ptaxDe === "string" && DATA.test(corpo.ptaxDe) ? corpo.ptaxDe : null;

  const precos = await Promise.all(simbolos.map(cotacao));
  const cotacoes = Object.fromEntries(simbolos.map((s, i) => [s, precos[i]]));
  let taxas: Awaited<ReturnType<typeof ptax>> = [];
  let erroPtax: string | null = null;
  if (ptaxDe) {
    try { taxas = await ptax(ptaxDe, new Date().toISOString().slice(0, 10)); } catch (e) { erroPtax = String((e as Error).message); }
  }
  return Response.json({ cotacoes, ptax: taxas, erroPtax });
}
