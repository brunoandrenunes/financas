import { createClient } from "@supabase/supabase-js";

// As rotas do servidor só buscam dados públicos (cotações, capas de livros), mas só atendem
// quem está logado no sistema, para não virar um atalho aberto para esses serviços.
export async function logado(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data, error } = await sb.auth.getUser(token);
  return !error && !!data.user;
}

export const naoAutenticado = () => Response.json({ erro: "Não autenticado" }, { status: 401 });
