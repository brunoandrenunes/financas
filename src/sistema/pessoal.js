// Área pessoal do painel: Agenda, Leituras, Treinos e Metas e rotinas.
// Cada tela fica no seu arquivo (pes-*.js); aqui só se junta tudo para o motor.
import { S, ICONES } from './pes-comum.js';
import { renderAgenda, reiniciarAgenda } from './pes-agenda.js';
import { renderLeituras, reiniciarLeituras } from './pes-leituras.js';
import { renderTreinos, reiniciarTreinos } from './pes-treinos.js';
import { renderMetas, reiniciarMetas } from './pes-metas.js';

export const PES_VIEWS = [
  ['pes-agenda','Agenda',ICONES.agenda],
  ['pes-leituras','Leituras',ICONES.livro],
  ['pes-treinos','Treinos',ICONES.treino],
  ['pes-metas','Metas e rotinas',ICONES.metas],
];

export function iniciarPes(apiDados, toastFn){
  S.api=apiDados; S.toast=toastFn; S.P=null; S.render=renderPes;
  reiniciarAgenda(); reiniciarLeituras(); reiniciarTreinos(); reiniciarMetas();
}
export async function carregarPes(){ S.P = await S.api.carregarPes(); renderPes(); }
export function renderPes(){ renderAgenda(); renderLeituras(); renderTreinos(); renderMetas(); }
