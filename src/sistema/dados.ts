// Leitura e gravação no banco. O motor das telas (motor.js) só conversa com o banco por aqui.
import { supabase } from "@/lib/supabase";

type Linha = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

function falhou(error: { message: string } | null) {
  if (error) throw new Error(traduzir(error.message));
}
// Mensagens do banco que valem a pena explicar melhor.
function traduzir(m: string) {
  if (/duplicate key|unique/i.test(m)) return "Já existe um registro com esses dados.";
  if (/row-level security|permission denied/i.test(m)) return "Sem permissão. Entre de novo com a verificação em duas etapas.";
  return m;
}

// Busca todas as linhas, de 1.000 em 1.000 (limite do Supabase por consulta).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do construtor de consulta varia por tabela
async function todas(tabela: string, colunas = "*", filtro?: (q: any) => any): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase.from(tabela).select(colunas).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    falhou(error);
    out.push(...((data ?? []) as unknown as Linha[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function carregar(anoPedido?: number) {
  const exercicios = await todas("exercicios", "ano,status", (q) => q.order("ano"));
  if (!exercicios.length) throw new Error("Nenhum exercício cadastrado.");
  const abertos = exercicios.filter((e) => e.status === "aberto");
  const ano = anoPedido && exercicios.some((e) => e.ano === anoPedido)
    ? anoPedido
    : num((abertos[0] ?? exercicios[exercicios.length - 1]).ano);

  const [lanc, cats, subs, orc, contas, ini, confs, receb, movs, uso, ajustes] = await Promise.all([
    todas("v_lancamentos", "id,data,grupo,categoria,subcategoria,subcategoria_id,valor,descricao,composicao,suplementa_orcamento,e_suplementacao,origem", (q) => q.eq("ano", ano).order("data").order("id")),
    todas("categorias", "id,grupo,nome,ativa,suplementa_automaticamente", (q) => q.order("id")),
    todas("subcategorias", "id,categoria_id,nome,ativa", (q) => q.order("id")),
    todas("orcamentos", "id,ano,grupo,categoria_id,valor_base,recebe_suplementacoes", (q) => q.in("ano", [ano, ano + 1]).order("id")),
    todas("contas", "id,instituicao,nome,tipo,ativa,ordem,observacao", (q) => q.order("ordem").order("id")),
    todas("saldo_inicial_itens", "ano,descricao,valor", (q) => q.eq("ano", ano).order("id")),
    todas("conferencias", "id,data,saldo_calculado,total_informado,rendimento", (q) => q.order("data").order("id")),
    todas("recebiveis", "*", (q) => q.order("id")),
    todas("recebimentos", "id,recebivel_id,data,tipo,valor,conta_id", (q) => q.order("data").order("id")),
    todas("lancamentos", "subcategoria_id", (q) => q.order("id")),
    todas("orcamento_ajustes", "id,orcamento_id,data,valor,lote,motivo", (q) => q.gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`).order("data").order("id")),
  ]);

  const usoSub: Record<number, number> = {};
  uso.forEach((l) => { const k = num(l.subcategoria_id); usoSub[k] = (usoSub[k] || 0) + 1; });

  const ultima = confs.length ? confs[confs.length - 1] : null;
  let ultimaConf: { data: string; saldos: Record<number, number> } | null = null;
  if (ultima) {
    const s = await todas("conferencia_saldos", "conta_id,saldo", (q) => q.eq("conferencia_id", ultima.id));
    ultimaConf = { data: String(ultima.data), saldos: Object.fromEntries(s.map((x) => [num(x.conta_id), num(x.saldo)])) };
  }

  // Para o alerta "saldo inicial diferente do saldo final do ano anterior".
  let saldoFinalAnterior: number | null = null;
  if (exercicios.some((e) => e.ano === ano - 1)) {
    const { data, error } = await supabase.rpc("saldo_em", { p_data: `${ano - 1}-12-31` });
    falhou(error);
    saldoFinalAnterior = num(data);
  }

  const catById = new Map(cats.map((c) => [num(c.id), c]));
  const mapOrc = (o: Linha) => ({
    id: num(o.id), g: String(o.grupo), cid: o.categoria_id == null ? null : num(o.categoria_id),
    c: o.categoria_id == null ? `${o.grupo} (total)` : String(catById.get(num(o.categoria_id))?.nome ?? "?"),
    b: num(o.valor_base), sup: Boolean(o.recebe_suplementacoes),
  });

  return {
    ano,
    anos: exercicios.map((e) => ({ ano: num(e.ano), status: String(e.status) })),
    fechado: exercicios.find((e) => e.ano === ano)?.status === "fechado",
    saldoInicial: ini.map((s) => [String(s.descricao), num(s.valor)] as [string, number]),
    saldoFinalAnterior,
    rows: lanc.map((r) => ({
      id: num(r.id), d: String(r.data), g: String(r.grupo), c: String(r.categoria), s: String(r.subcategoria),
      sid: num(r.subcategoria_id), v: num(r.valor), desc: (r.descricao as string) || "", comp: (r.composicao as string) || "",
      sup: Boolean(r.suplementa_orcamento), esup: Boolean(r.e_suplementacao), origem: String(r.origem),
    })),
    cats: cats.map((c) => ({
      id: num(c.id), g: String(c.grupo), nome: String(c.nome), ativa: Boolean(c.ativa), supAuto: Boolean(c.suplementa_automaticamente),
      subs: subs.filter((s) => num(s.categoria_id) === num(c.id))
        .map((s) => ({ id: num(s.id), nome: String(s.nome), ativa: Boolean(s.ativa), uso: usoSub[num(s.id)] || 0 })),
    })),
    budget: orc.filter((o) => o.ano === ano).map(mapOrc),
    budgetProx: orc.filter((o) => o.ano === ano + 1).map(mapOrc),
    ajustes: ajustes.map((a) => ({
      id: num(a.id), oid: num(a.orcamento_id), d: String(a.data), v: num(a.valor), lote: String(a.lote), motivo: (a.motivo as string) || "",
    })),
    contas: contas.map((c) => ({
      id: num(c.id), inst: String(c.instituicao), nome: String(c.nome), tipo: String(c.tipo), ativa: Boolean(c.ativa), obs: (c.observacao as string) || "",
    })),
    conferencias: confs.map((c) => ({ id: num(c.id), data: String(c.data), calc: num(c.saldo_calculado), total: num(c.total_informado), rend: num(c.rendimento) })),
    ultimaConf,
    recebiveis: receb.map((r) => ({
      id: num(r.id), descricao: String(r.descricao), contratado: num(r.valor_contratado), vencimento: String(r.vencimento),
      recebidoAntes: num(r.recebido_antes), custoDesc: (r.custo_descricao as string) || "Custo", custoPrevisto: num(r.custo_previsto),
      movs: movs.filter((m) => num(m.recebivel_id) === num(r.id))
        .map((m) => ({ id: num(m.id), d: String(m.data), tipo: String(m.tipo), v: num(m.valor), conta: m.conta_id == null ? null : num(m.conta_id) })),
    })),
  };
}
export type Dados = Awaited<ReturnType<typeof carregar>>;

/* ---------- gravações ---------- */
// update/delete barrados pela RLS ou com id inexistente não dão erro: confere que gravou.
async function umRegistro(q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const { data, error } = await q;
  falhou(error);
  if (!data?.length) throw new Error("Nada foi gravado: o registro não existe mais ou o ano está fechado. Recarregue a página.");
}
type NovoLancamento = { data: string; subcategoria_id: number; valor: number; descricao?: string; suplementa_orcamento?: boolean };

export const api = {
  carregar,

  async inserirLancamentos(lista: NovoLancamento[]) {
    const { error } = await supabase.from("lancamentos").insert(lista.map((l) => ({ ...l, origem: "manual" })));
    falhou(error);
  },
  async alterarLancamento(id: number, l: NovoLancamento) {
    await umRegistro(supabase.from("lancamentos").update({ ...l, atualizado_em: new Date().toISOString() }).eq("id", id).select("id"));
  },
  async excluirLancamento(id: number) {
    await umRegistro(supabase.from("lancamentos").delete().eq("id", id).select("id"));
  },

  async orcamento(id: number, valor: number) {
    await umRegistro(supabase.from("orcamentos").update({ valor_base: valor, atualizado_em: new Date().toISOString() }).eq("id", id).select("id"));
  },
  async novoOrcamento(ano: number, grupo: string, categoria_id: number) {
    const { error } = await supabase.from("orcamentos").insert({ ano, grupo, categoria_id, valor_base: 0 });
    falhou(error);
  },
  // Um remanejamento manda as duas linhas (origem negativa, destino positivo) num único insert,
  // com o mesmo lote: ou grava as duas, ou nenhuma.
  async ajusteOrcamento(lista: { orcamento_id: number; data: string; valor: number; motivo: string | null }[]) {
    const lote = crypto.randomUUID();
    const { error } = await supabase.from("orcamento_ajustes").insert(lista.map((a) => ({ ...a, lote })));
    falhou(error);
  },
  async excluirAjuste(lote: string) {
    await umRegistro(supabase.from("orcamento_ajustes").delete().eq("lote", lote).select("id"));
  },

  async conferencia(data: string, saldos: { conta_id: number; saldo: number }[]) {
    const { error } = await supabase.rpc("registrar_conferencia", { p_data: data, p_saldos: saldos });
    falhou(error);
  },
  async excluirConferencia(id: number) {
    const { error } = await supabase.rpc("excluir_conferencia", { p_id: id });
    falhou(error);
  },
  async excluirRecebimento(id: number) {
    await umRegistro(supabase.from("recebimentos").delete().eq("id", id).select("id"));
  },
  async movimentoRecebivel(m: { recebivel_id: number; data: string; tipo: string; valor: number; conta_id: number }) {
    const { error } = await supabase.from("recebimentos").insert(m);
    falhou(error);
  },

  async novaCategoria(grupo: string, nome: string) {
    const { error } = await supabase.from("categorias").insert({ grupo, nome });
    falhou(error);
  },
  async categoria(id: number, campos: { nome?: string; ativa?: boolean }) {
    await umRegistro(supabase.from("categorias").update(campos).eq("id", id).select("id"));
  },
  async novaSubcategoria(categoria_id: number, nome: string) {
    const { error } = await supabase.from("subcategorias").insert({ categoria_id, nome });
    falhou(error);
  },
  async subcategoria(id: number, campos: { nome?: string; ativa?: boolean }) {
    await umRegistro(supabase.from("subcategorias").update(campos).eq("id", id).select("id"));
  },
  async novaConta(instituicao: string, nome: string, tipo: string) {
    const { data: ult } = await supabase.from("contas").select("ordem").order("ordem", { ascending: false }).limit(1);
    const { error } = await supabase.from("contas").insert({ instituicao, nome, tipo, ordem: num(ult?.[0]?.ordem) + 1 });
    falhou(error);
  },
  async conta(id: number, campos: { ativa?: boolean }) {
    await umRegistro(supabase.from("contas").update(campos).eq("id", id).select("id"));
  },

  async abrirExercicio(ano: number) { const { error } = await supabase.rpc("abrir_exercicio", { p_ano: ano }); falhou(error); },
  async fecharExercicio(ano: number) {
    const { data, error } = await supabase.rpc("fechar_exercicio", { p_ano: ano });
    falhou(error);
    return String(data ?? "");
  },
  async reabrirExercicio(ano: number) { const { error } = await supabase.rpc("reabrir_exercicio", { p_ano: ano }); falhou(error); },

  async sair() { await supabase.auth.signOut(); },

  // Backup completo em Excel: uma aba por tabela, todos os anos, mais a auditoria (só leitura).
  async backup() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Finanças do Bruno";
    wb.created = new Date();
    const abas: [string, string, string][] = [
      ["Lançamentos", "v_lancamentos", "id,data,grupo,categoria,subcategoria,valor,descricao,composicao,suplementa_orcamento,origem,subcategoria_id,criado_em,atualizado_em"],
      ["Categorias", "categorias", "*"],
      ["Subcategorias", "subcategorias", "*"],
      ["Orçamentos", "orcamentos", "*"],
      ["Ajustes do orçamento", "orcamento_ajustes", "*"],
      ["Exercícios", "exercicios", "*"],
      ["Saldo inicial", "saldo_inicial_itens", "*"],
      ["Contas", "contas", "*"],
      ["Conferências", "conferencias", "*"],
      ["Saldos conferidos", "conferencia_saldos", "*"],
      ["Recebíveis", "recebiveis", "*"],
      ["Recebimentos", "recebimentos", "*"],
      ["Auditoria", "auditoria", "*"],
    ];
    const resumo: [string, number][] = [];
    const info = wb.addWorksheet("Leia-me", { properties: { tabColor: { argb: "FF2A78D6" } } });
    for (const [nome, tabela, cols] of abas) {
      const linhas = await todas(tabela, cols, (q) => (cols.includes("id") || cols === "*") && tabela !== "conferencia_saldos" && tabela !== "exercicios" ? q.order("id") : q);
      const ws = wb.addWorksheet(nome);
      const chaves = linhas.length ? Object.keys(linhas[0]) : cols === "*" ? [] : cols.split(",");
      ws.columns = chaves.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(10, k.length + 2)) }));
      linhas.forEach((l) => ws.addRow(Object.fromEntries(chaves.map((k) => {
        const v = l[k];
        if (v !== null && typeof v === "object") return [k, JSON.stringify(v)];
        if (["valor", "valor_base", "saldo", "saldo_calculado", "total_informado", "rendimento", "valor_contratado", "recebido_antes", "custo_previsto"].includes(k) && v != null) return [k, Number(v)];
        return [k, v];
      }))));
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      resumo.push([nome, linhas.length]);
    }
    info.addRows([["Backup do sistema Finanças do Bruno"], ["Gerado em", new Date().toLocaleString("pt-BR")], [], ["Aba", "Linhas"], ...resumo]);
    info.getRow(1).font = { bold: true, size: 14 };
    info.getColumn(1).width = 22;
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `financas-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
export type Api = typeof api;
