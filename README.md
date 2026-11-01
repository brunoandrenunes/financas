# Finanças do Bruno

Sistema de finanças pessoais: Next.js (Vercel) + Supabase.

- Regras de negócio: `ESPECIFICACAO.md` (na pasta do OneDrive do projeto).
- Banco: migrações em `supabase/migrations` (aplicadas no projeto `financas-pessoais`).
- Telas: `src/sistema/motor.js` (portado do protótipo aprovado); dados e gravações em `src/sistema/dados.ts`.
- Acesso: e-mail e senha + verificação em duas etapas (TOTP). O banco só libera dados para o proprietário com `aal2`.

Rodar localmente: `npm install` e `npm run dev`, com `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://llyyomtvypxjnjbblvxz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave publicável>
```
