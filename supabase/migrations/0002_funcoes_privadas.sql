-- Tira as funções internas da API pública (avisos do verificador de segurança)
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- As políticas de RLS apontam para a função pelo identificador interno,
-- então continuam funcionando após a mudança de schema.
alter function public.e_proprietario() set schema privado;
revoke execute on function privado.e_proprietario() from public, anon;
grant execute on function privado.e_proprietario() to authenticated;

alter function public.tg_auditoria() set schema privado;
revoke execute on function privado.tg_auditoria() from public, anon, authenticated;
