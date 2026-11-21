import { logado, naoAutenticado } from "@/lib/rota";

// Busca dados e capa de um livro no Open Library (gratuito, sem chave) para preencher a ficha.

type Doc = { title?: string; author_name?: string[]; number_of_pages_median?: number; cover_i?: number; isbn?: string[]; publisher?: string[]; first_publish_year?: number };

export async function POST(req: Request) {
  if (!(await logado(req))) return naoAutenticado();
  let corpo: { titulo?: unknown; autor?: unknown };
  try { corpo = await req.json(); } catch { return Response.json({ erro: "Pedido inválido" }, { status: 400 }); }
  const titulo = typeof corpo.titulo === "string" ? corpo.titulo.trim().slice(0, 200) : "";
  const autor = typeof corpo.autor === "string" ? corpo.autor.trim().slice(0, 120) : "";
  if (!titulo) return Response.json({ erro: "Informe o título" }, { status: 400 });

  const p = new URLSearchParams({ title: titulo, limit: "8", fields: "title,author_name,number_of_pages_median,cover_i,isbn,publisher,first_publish_year" });
  if (autor) p.set("author", autor);
  try {
    const r = await fetch(`https://openlibrary.org/search.json?${p}`, { headers: { "User-Agent": "PainelPessoal/1.0" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error();
    const docs: Doc[] = (await r.json()).docs ?? [];
    const resultados = docs.map((d) => ({
      titulo: d.title ?? "",
      autor: (d.author_name ?? []).slice(0, 3).join(", "),
      paginas: d.number_of_pages_median ?? null,
      capa: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      isbn: (d.isbn ?? []).find((x) => x.length === 13) ?? d.isbn?.[0] ?? null,
      editora: d.publisher?.[0] ?? null,
      ano: d.first_publish_year ?? null,
    }));
    return Response.json({ resultados });
  } catch {
    return Response.json({ erro: "Não foi possível consultar o Open Library agora." }, { status: 502 });
  }
}
