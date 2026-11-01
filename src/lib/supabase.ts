import { createClient } from "@supabase/supabase-js";

// Só a chave pública vai para o navegador. Quem protege os dados é o banco:
// RLS libera tudo apenas para o proprietário logado com verificação em duas etapas.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
