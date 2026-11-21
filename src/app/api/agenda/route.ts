import { createClient } from "@supabase/supabase-js";
import ICAL from "ical.js";

// Lê os calendários do Google Agenda pelo endereço secreto iCal guardado no banco (pes_config)
// e devolve os eventos do período pedido, com as repetições já expandidas.
// O endereço nunca vai para a tela: só esta rota o lê, com o login do próprio Bruno (RLS).

const GOOGLE_ICS = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^\s/]+\/[^\s/]+\/basic\.ics$/;
const MAX_EVENTOS = 3000;

type Fonte = { nome?: string; url?: string };
type Evento = { cal: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; local: string | null };

const dataISO = (t: ICAL.Time) => `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

function eventosDoIcs(texto: string, cal: string, de: Date, ate: Date): Evento[] {
  const raiz = new ICAL.Component(ICAL.parse(texto));
  for (const tz of raiz.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  const vevents = raiz.getAllSubcomponents("vevent");
  // Ocorrências alteradas de um evento que se repete (mesmo UID, com RECURRENCE-ID).
  const excecoes = new Map<string, ICAL.Event[]>();
  const mestres: ICAL.Event[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) { const l = excecoes.get(ev.uid) ?? []; l.push(ev); excecoes.set(ev.uid, l); }
    else mestres.push(ev);
  }
  const out: Evento[] = [];
  const cancelado = (c: ICAL.Component) => String(c.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
  const incluir = (item: ICAL.Event, ini: ICAL.Time, fim: ICAL.Time) => {
    if (cancelado(item.component)) return;
    const dia = ini.isDate;
    const fimReal = fim ?? ini;
    const a = ini.toJSDate(), b = fimReal.toJSDate();
    if (b < de || a > ate) return;
    out.push({
      cal, titulo: String(item.summary || "(sem título)").slice(0, 200),
      inicio: dia ? dataISO(ini) : a.toISOString(),
      fim: dia ? dataISO(fimReal) : b.toISOString(),
      diaInteiro: dia, local: item.location ? String(item.location).slice(0, 200) : null,
    });
  };
  for (const ev of mestres) {
    if (out.length >= MAX_EVENTOS) break;
    if (!ev.startDate) continue;
    for (const x of excecoes.get(ev.uid) ?? []) ev.relateException(x);
    if (!ev.isRecurring()) { incluir(ev, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    for (let n = 0, prox = it.next(); prox && n < 20000; n++, prox = it.next()) {
      if (prox.toJSDate() > ate) break;
      const d = ev.getOccurrenceDetails(prox);
      incluir(d.item, d.startDate, d.endDate);
      if (out.length >= MAX_EVENTOS) break;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ erro: "Não autenticado" }, { status: 401 });
  let corpo: { de?: unknown; ate?: unknown };
  try { corpo = await req.json(); } catch { return Response.json({ erro: "Pedido inválido" }, { status: 400 }); }
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof corpo.de !== "string" || typeof corpo.ate !== "string" || !re.test(corpo.de) || !re.test(corpo.ate))
    return Response.json({ erro: "Período inválido" }, { status: 400 });
  const de = new Date(corpo.de + "T00:00:00-03:00"), ate = new Date(corpo.ate + "T23:59:59-03:00");
  if (!(ate > de) || ate.getTime() - de.getTime() > 400 * 86400000) return Response.json({ erro: "Período inválido" }, { status: 400 });

  // Consulta com o login de quem pediu: a RLS só deixa o proprietário ler a configuração.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: eu } = await sb.auth.getUser(token);
  if (eu || !u.user) return Response.json({ erro: "Não autenticado" }, { status: 401 });
  const { data, error } = await sb.from("pes_config").select("valor").eq("chave", "agenda_ics").maybeSingle();
  if (error) return Response.json({ erro: "Sem permissão para ler a agenda." }, { status: 403 });
  const fontes = ((data?.valor ?? []) as Fonte[]).filter((f) => typeof f.url === "string" && GOOGLE_ICS.test(f.url));
  if (!fontes.length) return Response.json({ eventos: [], falhas: [], conectada: false });

  const eventos: Evento[] = [], falhas: string[] = [];
  await Promise.all(fontes.map(async (f, i) => {
    const nome = String(f.nome || `Agenda ${i + 1}`).slice(0, 40);
    try {
      const r = await fetch(f.url!, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(String(r.status));
      const texto = await r.text();
      if (!texto.startsWith("BEGIN:VCALENDAR")) throw new Error("formato");
      eventos.push(...eventosDoIcs(texto, nome, de, ate));
    } catch {
      falhas.push(nome);
    }
  }));
  eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return Response.json({ eventos: eventos.slice(0, MAX_EVENTOS), falhas, conectada: true });
}
