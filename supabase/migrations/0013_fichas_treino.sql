-- Fichas de treino: exercícios de cada treino do ciclo, guardados em pes_config ('treino_fichas').
alter table public.pes_config drop constraint pes_config_chave_check;
alter table public.pes_config add constraint pes_config_chave_check
  check (chave in ('agenda_ics','treino_ciclo','treino_fichas'));
