// Agenda: o mês com os compromissos do Google Agenda (pelo endereço secreto iCal, lido só no
// servidor), os treinos, as rotinas e as leituras. Ao lado, o painel do dia escolhido.
import { S, esc, dBR, $, hojeISO, isoDe, addDias, diasEntre, SEM_CURTA, svg, ICONES, capa, gradeMes, mudarMes, navMes,
  gravarPes, livrosNoDia, rotinasDoDia, marcada, corTipo, siglaTipo, proximoTreino, diaPorExtenso, dialogo } from './pes-comum.js';
import { abrirTreino } from './pes-treinos.js';
import { htmlChecklist, tratarMarca } from './pes-metas.js';

const GOOGLE_ICS = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^\s/]+\/[^\s/]+\/basic\.ics$/;
const af = { mes: hojeISO().slice(0,7), dia: hojeISO(), eventos: new Map(), meses: new Set(), carregando: false, falhas: [], erro: null, config: false };
export function reiniciarAgenda(){ Object.assign(af,{ mes: hojeISO().slice(0,7), dia: hojeISO(), eventos: new Map(), meses: new Set(), carregando:false, falhas:[], erro:null, config:false }); }

const hora = iso => new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
// Dias (no fuso do navegador) cobertos por um evento. Dia inteiro: o fim do Google é exclusivo.
function diasDoEvento(ev){
  const a = ev.diaInteiro ? ev.inicio : isoDe(new Date(ev.inicio));
  let b = ev.diaInteiro ? addDias(ev.fim,-1) : isoDe(new Date(new Date(ev.fim).getTime()-1));
  if(b<a) b=a;
  const n=Math.min(diasEntre(a,b),62);
  return Array.from({length:n+1},(_,i)=>addDias(a,i));
}
function porDia(){
  const m=new Map();
  for(const ev of af.eventos.values()) for(const d of diasDoEvento(ev)) (m.get(d)||m.set(d,[]).get(d)).push(ev);
  for(const l of m.values()) l.sort((x,y)=>(y.diaInteiro-x.diaInteiro)||x.inicio.localeCompare(y.inicio));
  return m;
}

// Busca no servidor o mês pedido e os vizinhos (assim a navegação fica rápida).
async function garantirMes(ym, forcar=false){
  if(!S.P?.agendaConectada || af.carregando || (!forcar && af.meses.has(ym))) return;
  af.carregando=true; af.erro=null;
  const de=mudarMes(ym,-1)+'-01', fimMes=mudarMes(ym,2)+'-01', ate=addDias(fimMes,-1);
  try{
    const r=await S.api.pesAgenda(de, ate);
    if(forcar){ af.eventos.clear(); af.meses.clear(); }
    r.eventos.forEach(ev=>af.eventos.set(`${ev.cal}|${ev.titulo}|${ev.inicio}|${ev.fim}`, ev));
    [mudarMes(ym,-1), ym, mudarMes(ym,1)].forEach(m=>af.meses.add(m));
    af.falhas=r.falhas;
  }catch(e){ af.erro=e?.message||String(e); }
  finally{ af.carregando=false; renderAgenda(); }
}

export function renderAgenda(){
  const v=$('v-pes-agenda'); if(!v) return;
  if(!S.P){ v.innerHTML='<div class="panel"><span class="muted">Carregando agenda…</span></div>'; return; }
  const conectada=S.P.agendaConectada;
  if(conectada && !af.meses.has(af.mes)) queueMicrotask(()=>garantirMes(af.mes));
  const mapa=porDia();
  v.innerHTML=`<div class="wrap" style="gap:18px">
    <div class="head"><div><h1>Agenda</h1><p>${diaPorExtenso(hojeISO()).replace(/^./,c=>c.toUpperCase())}</p></div>
      <div class="toolbar">${conectada?`<span class="pill ${af.erro||af.falhas.length?'warn':'good'}">${af.carregando?'Atualizando…':af.erro||af.falhas.length?'Google com problema':'Google Agenda conectada'}</span>
        <button class="btn" type="button" id="pa-atualizar">Atualizar</button>`:''}
        <button class="btn" type="button" id="pa-config">${conectada?'Configurar':'Conectar Google Agenda'}</button>
        <button class="btn primary" type="button" data-novo-ev="${af.dia>=hojeISO()?af.dia:hojeISO()}">${svg(ICONES.mais)} Novo compromisso</button></div></div>
    ${!conectada||af.config?htmlConexao(conectada):''}
    ${af.erro?`<div class="banner warn">Não foi possível ler o Google Agenda: ${esc(af.erro)}</div>`:''}
    ${af.falhas.length?`<div class="banner warn">Não consegui ler: ${af.falhas.map(esc).join(', ')}. Confira se o endereço secreto ainda vale (ele muda se for redefinido no Google).</div>`:''}
    <div class="agenda-layout">
      ${htmlMes(mapa)}
      <div class="agenda-lado">${htmlDia(mapa)}${conectada?htmlProximos():''}</div>
    </div>
  </div>`;
  ligar(v);
}

function htmlConexao(conectada){
  return `<div class="panel conexao"><div class="panel-h"><h2>${conectada?'Trocar ou desconectar o Google Agenda':'Conectar o Google Agenda'}</h2>${conectada?'<button class="linkbtn" type="button" id="pa-config-x">Fechar</button>':''}</div>
    <ol class="passos">
      <li>No computador, abra o <b>Google Agenda</b> e clique na engrenagem → <b>Configurações</b>.</li>
      <li>À esquerda, em <b>Configurações das minhas agendas</b>, clique na sua agenda e depois em <b>Integrar agenda</b>.</li>
      <li>Copie o <b>Endereço secreto no formato iCal</b> (termina em <code>basic.ics</code>) e cole abaixo. Repita para outras agendas que quiser ver.</li>
    </ol>
    <form id="pa-form" class="conexao-form">
      ${[0,1,2].map(i=>`<div class="form-row"${i>0?' data-extra':''}>
        <div class="field" style="flex:0 1 160px"><label for="pa-nome-${i}">Nome</label><input type="text" id="pa-nome-${i}" maxlength="40" value="${i===0?'Pessoal':''}" placeholder="${['Pessoal','Família','Trabalho'][i]}"></div>
        <div class="field"><label for="pa-url-${i}">Endereço secreto iCal${i?' (opcional)':''}</label><input type="password" id="pa-url-${i}" autocomplete="off" spellcheck="false" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"${i===0?' required':''}></div>
      </div>`).join('')}
      <div class="toolbar"><button class="btn primary" type="submit">${conectada?'Salvar endereços':'Conectar'}</button>${conectada?'<button class="btn" type="button" id="pa-desconectar" style="color:var(--neg)">Desconectar</button>':''}
        <span class="muted small">O endereço fica guardado só no seu banco de dados e não aparece mais na tela. Só o servidor do site o usa para ler a agenda; nada é alterado no Google.</span></div>
    </form></div>`;
}

function htmlMes(mapa){
  const ym=af.mes, semanas=gradeMes(+ym.slice(0,4), +ym.slice(5,7)-1), hoje=hojeISO();
  const treinos=new Map(); S.P.treinos.forEach(t=>(treinos.get(t.data)||treinos.set(t.data,[]).get(t.data)).push(t));
  const terminos=new Map(); S.P.livros.filter(l=>l.status==='lido'&&l.fim).forEach(l=>(terminos.get(l.fim)||terminos.set(l.fim,[]).get(l.fim)).push(l));
  const celula=d=>{
    const evs=mapa.get(d)||[], ts=treinos.get(d)||[], ls=terminos.get(d)||[], R=d<=hoje?rotinasDoDia(d):[];
    const feitas=R.filter(r=>marcada(r.id,d)).length, nItens=evs.length+ts.length, max=3;
    const chips=[...ts.map(t=>`<span class="ag-chip treino" style="--c:${corTipo(t.tipo)}">${esc(siglaTipo(t.tipo))}${t.numero?` · ${t.numero}`:''}</span>`),
      ...evs.map(ev=>`<span class="ag-chip${ev.diaInteiro?' dia':''}" title="${esc(ev.titulo)}">${ev.diaInteiro?'':`<small>${hora(ev.inicio)}</small> `}${esc(ev.titulo)}</span>`)];
    return `<button type="button" class="cal-dia ag-dia${d.slice(0,7)!==ym?' fora':''}${d===hoje?' hoje':''}${d===af.dia?' sel':''}" data-dia-ag="${d}" aria-label="${diaPorExtenso(d)}">
      <span class="cal-n">${+d.slice(8,10)}${ls.length?`<span class="ag-livro">${capa(ls[0])}</span>`:''}</span>
      <span class="ag-chips">${chips.slice(0,max).join('')}${nItens>max?`<span class="ag-mais">+${nItens-max}</span>`:''}</span>
      <span class="ag-pontos">${ts.length?`<i style="background:${corTipo(ts[0].tipo)}"></i>`:''}${evs.length?'<i class="ev"></i>':''}</span>
      ${R.length?`<span class="ag-rot" title="Rotinas: ${feitas} de ${R.length}"><i style="width:${feitas/R.length*100}%"></i></span>`:''}
    </button>`; };
  return `<div class="panel ag-mes"><div class="panel-h">${navMes('pa',ym)}
      <div class="legenda"><span><i class="ev"></i>Google</span><span><i style="background:var(--s1)"></i>Treino</span><span><i class="rot"></i>Rotinas do dia</span></div></div>
    <div class="cal-grade">${SEM_CURTA.map(d=>`<span class="cal-sem">${d}</span>`).join('')}${semanas.flat().map(celula).join('')}</div>
  </div>`;
}

function htmlDia(mapa){
  const d=af.dia, hoje=hojeISO(), evs=mapa.get(d)||[], ts=S.P.treinos.filter(t=>t.data===d), ls=livrosNoDia(d), prox=proximoTreino();
  const titulo = d===hoje ? 'Hoje' : d===addDias(hoje,1) ? 'Amanhã' : d===addDias(hoje,-1) ? 'Ontem' : dBR(d);
  return `<div class="panel ag-painel-dia">
    <div class="panel-h"><div><h2>${titulo}</h2><span class="muted small">${diaPorExtenso(d)}</span></div>${d!==hoje?'<button class="btn" type="button" id="pa-hoje">Hoje</button>':''}</div>
    <section><div class="ag-sec-h"><span class="eyebrow">Compromissos</span><button class="linkbtn" type="button" data-novo-ev="${d}">+ Adicionar</button></div>
      ${!S.P.agendaConectada?'<p class="muted small">Conecte o Google Agenda para ver seus compromissos aqui.</p>'
        :af.carregando&&!af.meses.has(d.slice(0,7))?'<p class="muted small">Carregando…</p>'
        :evs.length?`<ul class="ag-lista">${evs.map(ev=>`<li><span class="ag-hora">${ev.diaInteiro?'Dia todo':`${hora(ev.inicio)}<small>${hora(ev.fim)}</small>`}</span><div><b>${esc(ev.titulo)}</b>${ev.local?`<span class="muted small">${esc(ev.local)}</span>`:''}${S.P.agendaConectada&&af.eventos.size&&new Set([...af.eventos.values()].map(x=>x.cal)).size>1?`<span class="muted small">${esc(ev.cal)}</span>`:''}</div></li>`).join('')}</ul>`
        :'<p class="muted small">Nada marcado.</p>'}
    </section>
    <section><span class="eyebrow">Rotinas</span>${htmlChecklist(d)}</section>
    <section><span class="eyebrow">Treino</span>
      ${ts.length?ts.map(t=>`<button type="button" class="ag-treino" data-treino-ag="${t.id}"><span class="pt-tipo peq" style="--c:${corTipo(t.tipo)}">${esc(siglaTipo(t.tipo))}</span><span><b>${esc(t.tipo)}</b><span class="muted small">${t.numero?`nº ${t.numero}`:''}${t.duracao?` · ${t.duracao} min`:''}</span></span></button>`).join('')
        :d<=hoje?`<button class="btn" type="button" data-treino-novo-ag="${d}">${svg(ICONES.mais)} Registrar ${esc(prox.tipo)}</button>`:'<p class="muted small">—</p>'}
    </section>
    ${ls.length?`<section><span class="eyebrow">Leitura</span>${ls.map(l=>`<a class="ag-leitura" href="#pes-leituras">${capa(l)}<span><b>${esc(l.titulo)}</b><span class="muted small">${l.fim===d?'Terminou neste dia':l.inicio===d?'Começou neste dia':l.status==='lendo'?`Lendo · dia ${diasEntre(l.inicio,d)+1}`:`Lendo · dia ${diasEntre(l.inicio,d)+1}`}</span></span></a>`).join('')}</section>`:''}
  </div>`;
}

function htmlProximos(){
  const hoje=hojeISO(), lim=addDias(hoje,14);
  const evs=[...af.eventos.values()].filter(ev=>{ const ds=diasDoEvento(ev); return ds[ds.length-1]>=hoje && ds[0]<=lim; })
    .sort((a,b)=>(a.diaInteiro?a.inicio:isoDe(new Date(a.inicio))).localeCompare(b.diaInteiro?b.inicio:isoDe(new Date(b.inicio)))||a.inicio.localeCompare(b.inicio)).slice(0,10);
  return `<div class="panel"><div class="panel-h"><h2>Próximos 14 dias</h2></div>
    ${evs.length?`<ul class="ag-lista">${evs.map(ev=>{ const d=ev.diaInteiro?ev.inicio:isoDe(new Date(ev.inicio));
      return `<li data-dia-ag="${d}" role="button" tabindex="0"><span class="ag-hora">${d===hoje?'Hoje':SEM_CURTA[new Date(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10)).getDay()]+' '+d.slice(8,10)}<small>${ev.diaInteiro?'dia todo':hora(ev.inicio)}</small></span><div><b>${esc(ev.titulo)}</b>${ev.local?`<span class="muted small">${esc(ev.local)}</span>`:''}</div></li>`; }).join('')}</ul>`
      :`<p class="muted small">${af.carregando?'Carregando…':'Nenhum compromisso nas próximas duas semanas.'}</p>`}</div>`;
}

function ligar(v){
  v.onclick=e=>{
    const t=e.target.closest('[data-novo-ev],[data-marcar],[data-dia-ag],[data-pa-mes],[data-treino-ag],[data-treino-novo-ag],#pa-hoje,#pa-config,#pa-config-x,#pa-atualizar,#pa-desconectar');
    if(!t||!v.contains(t)) return;
    if(t.dataset.marcar) return tratarMarca(t);
    if(t.dataset.novoEv) return novoCompromisso(t.dataset.novoEv);
    if(t.dataset.paMes!=null){ const n=+t.dataset.paMes; af.mes=n?mudarMes(af.mes,n):hojeISO().slice(0,7); if(!n) af.dia=hojeISO(); renderAgenda(); return; }
    if(t.dataset.diaAg){ af.dia=t.dataset.diaAg; if(af.dia.slice(0,7)!==af.mes) af.mes=af.dia.slice(0,7); renderAgenda(); if(innerWidth<1100) document.querySelector('.ag-painel-dia')?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if(t.id==='pa-hoje'){ af.dia=hojeISO(); af.mes=af.dia.slice(0,7); renderAgenda(); return; }
    if(t.dataset.treinoAg) return abrirTreino(+t.dataset.treinoAg);
    if(t.dataset.treinoNovoAg) return abrirTreino(null, t.dataset.treinoNovoAg);
    if(t.id==='pa-config'){ af.config=!af.config||!S.P.agendaConectada; renderAgenda(); return; }
    if(t.id==='pa-config-x'){ af.config=false; renderAgenda(); return; }
    if(t.id==='pa-atualizar'){ garantirMes(af.mes, true); renderAgenda(); return; }
    if(t.id==='pa-desconectar'){ if(!confirm('Desconectar o Google Agenda? O endereço guardado será apagado (nada muda no Google).')) return;
      af.config=false; reiniciarAgenda(); gravarPes(()=>S.api.pesAgendaConectar([]),'Google Agenda desconectada.'); }
  };
  v.onkeydown=e=>{ const t=e.target.closest('li[data-dia-ag]'); if(t&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); t.click(); } };
  if($('pa-form')) $('pa-form').onsubmit=e=>{ e.preventDefault();
    const fontes=[];
    for(const i of [0,1,2]){ const url=$('pa-url-'+i).value.trim(); if(!url) continue;
      if(!GOOGLE_ICS.test(url)){ S.toast(`O endereço ${i+1} não parece o endereço secreto iCal do Google (precisa começar com https://calendar.google.com/calendar/ical/ e terminar em basic.ics).`, true); return; }
      fontes.push({nome:($('pa-nome-'+i).value.trim()||`Agenda ${i+1}`).slice(0,40), url}); }
    if(!fontes.length){ S.toast('Cole pelo menos um endereço.'); return; }
    af.config=false; reiniciarAgenda();
    gravarPes(()=>S.api.pesAgendaConectar(fontes),'Google Agenda conectada. Buscando seus compromissos…');
  };
}

/* ---------- Novo compromisso ---------- */
// O endereço iCal só permite ler. Para criar, o site abre a tela de "novo evento" do próprio Google
// já preenchida; o Bruno confere e salva lá. Ao voltar para esta aba, a agenda se atualiza sozinha.
const compacto = (dia, hhmm) => dia.replaceAll('-','') + (hhmm ? 'T'+hhmm.replace(':','')+'00' : '');
let atualizarAoVoltar = 0;
if(typeof window!=='undefined') window.addEventListener('focus', () => {
  if(atualizarAoVoltar && Date.now()<atualizarAoVoltar && S.P?.agendaConectada){ atualizarAoVoltar=0; setTimeout(()=>garantirMes(af.mes,true), 1500); }
});
function novoCompromisso(dia){
  const d=dialogo('pa-ev-dlg','Novo compromisso');
  d.innerHTML=`<form class="dlg-in" id="pae">
    <div class="ficha-topo"><h2>Novo compromisso</h2><button class="icon-btn" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <div class="field"><label for="pae-tit">O quê</label><input type="text" id="pae-tit" maxlength="200" required placeholder="Ex.: Dentista"></div>
    <div class="form-row">
      <div class="field" style="flex:0 1 160px"><label for="pae-dia">Dia</label><input type="date" id="pae-dia" required value="${dia}"></div>
      <div class="field hora" style="flex:0 1 110px"><label for="pae-ini">Início</label><input type="time" id="pae-ini" value="09:00"></div>
      <div class="field hora" style="flex:0 1 110px"><label for="pae-fim">Fim</label><input type="time" id="pae-fim" value="10:00"></div>
    </div>
    <label class="check-linha"><input type="checkbox" id="pae-todo"> Dia inteiro</label>
    <div class="field"><label for="pae-local">Onde (opcional)</label><input type="text" id="pae-local" maxlength="200"></div>
    <div class="field"><label for="pae-desc">Detalhes (opcional)</label><textarea id="pae-desc" rows="3" maxlength="2000"></textarea></div>
    <span class="muted small">Ao continuar, abre o Google Agenda com tudo preenchido. Confira e clique em <b>Salvar</b> lá; quando voltar para esta aba, o compromisso aparece aqui.</span>
    <div class="toolbar" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn primary" type="submit">Continuar no Google</button></div>
  </form>`;
  if(!d.open) d.showModal();
  d.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>d.close());
  const ajustar=()=>d.querySelectorAll('.hora').forEach(x=>x.hidden=$('pae-todo').checked);
  $('pae-todo').onchange=ajustar;
  $('pae-ini').onchange=()=>{ const [h,m]=$('pae-ini').value.split(':').map(Number); if(isNaN(h)) return; const f=new Date(2000,0,1,h+1,m); $('pae-fim').value=`${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}`; };
  $('pae').onsubmit=e=>{ e.preventDefault();
    const tit=$('pae-tit').value.trim(), dia=$('pae-dia').value, todo=$('pae-todo').checked, ini=$('pae-ini').value, fim=$('pae-fim').value;
    if(!tit||!dia){ S.toast('Informe o compromisso e o dia.'); return; }
    if(!todo&&(!ini||!fim)){ S.toast('Informe o horário de início e de fim.'); return; }
    const fimDia = !todo && fim<=ini ? addDias(dia,1) : dia; // terminou depois da meia-noite
    const p=new URLSearchParams({ action:'TEMPLATE', text:tit,
      dates: todo ? `${compacto(dia)}/${compacto(addDias(dia,1))}` : `${compacto(dia,ini)}/${compacto(fimDia,fim)}`,
      ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' });
    if($('pae-local').value.trim()) p.set('location',$('pae-local').value.trim());
    if($('pae-desc').value.trim()) p.set('details',$('pae-desc').value.trim());
    window.open('https://calendar.google.com/calendar/render?'+p.toString(),'_blank','noopener');
    d.close();
    atualizarAoVoltar=Date.now()+30*60000;
    S.toast('Confira no Google e clique em Salvar. Ao voltar para esta aba, a agenda se atualiza.');
  };
}
