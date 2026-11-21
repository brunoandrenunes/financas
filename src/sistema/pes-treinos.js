// Treinos: próximo treino do ciclo (Treino 1, 2, 3, 4...), contador sequencial, metas da semana e do
// ano, mapa do ano, calendário do mês e histórico.
import { S, fmtN0, fmtN1, esc, dBR, $, hojeISO, dataDe, addDias, MESES, SEM_CURTA, opt,
  gradeMes, mudarMes, navMes, gravarPes, meta, barraMeta, cicloTreinos, proximoTreino, corTipo, siglaTipo, dialogo, diaPorExtenso } from './pes-comum.js';

const tf = { mes: hojeISO().slice(0,7), ano: new Date().getFullYear(), metaAberta:false, cicloAberto:false, todos:false };
export function reiniciarTreinos(){ Object.assign(tf,{ mes: hojeISO().slice(0,7), ano: new Date().getFullYear(), metaAberta:false, cicloAberto:false, todos:false }); }

// Semana de domingo a sábado: devolve a data ISO do domingo.
const inicioSemana = iso => addDias(iso, -dataDe(iso).getDay());
const contarPor = (T, chave) => { const m=new Map(); T.forEach(t=>{ const k=chave(t); m.set(k,(m.get(k)||0)+1); }); return m; };

// Semanas seguidas (até a atual) com pelo menos o alvo semanal de treinos.
function sequencia(alvo){
  const porSemana=contarPor(S.P.treinos, t=>inicioSemana(t.data));
  let sem=inicioSemana(hojeISO()), n=0;
  if((porSemana.get(sem)||0)<alvo) sem=addDias(sem,-7); // semana atual ainda em andamento
  while((porSemana.get(sem)||0)>=alvo){ n++; sem=addDias(sem,-7); }
  return n;
}

export function renderTreinos(){
  const v=$('v-pes-treinos'); if(!v) return;
  if(!S.P){ v.innerHTML='<div class="panel"><span class="muted">Carregando treinos…</span></div>'; return; }
  const T=S.P.treinos, hoje=hojeISO(), ano=new Date().getFullYear();
  const prox=proximoTreino(), fezHoje=T.filter(t=>t.data===hoje);
  const doAno=T.filter(t=>+t.data.slice(0,4)===ano), doMes=T.filter(t=>t.data.slice(0,7)===hoje.slice(0,7));
  const semana=T.filter(t=>t.data>=inicioSemana(hoje)&&t.data<=hoje);
  const mSem=meta(ano,'treinos','semana')?.alvo, mAno=meta(ano,'treinos','ano')?.alvo;
  const doze=T.filter(t=>t.data>addDias(inicioSemana(hoje),-84)&&t.data<inicioSemana(hoje));
  const seq=sequencia(mSem||1);
  v.innerHTML=`<div class="wrap" style="gap:18px">
    <div class="head"><div><h1>Treinos</h1><p>${T.length?`${fmtN0.format(T.length)} treinos registrados desde ${dBR(T[0].data)}`:'Registre seus treinos e acompanhe o ciclo e a frequência'}</p></div>
      <div class="toolbar"><button class="btn" type="button" id="pt-ciclo-ed">Ciclo de treinos</button><button class="btn primary" type="button" data-treino-novo="${hoje}">Registrar treino</button></div></div>
    ${tf.cicloAberto?htmlCiclo():''}
    <div class="leit-topo">
      <div class="panel prox-treino">
        <span class="eyebrow">${fezHoje.length?'Treino de hoje':'Próximo treino'}</span>
        ${fezHoje.length?fezHoje.map(t=>`<div class="pt-hoje"><span class="pt-tipo" style="--c:${corTipo(t.tipo)}">${esc(siglaTipo(t.tipo))}</span><div><h2 class="lendo-titulo">${esc(t.tipo)}${t.numero?` · nº ${fmtN0.format(t.numero)}`:''}</h2><span class="muted small">Feito hoje${t.duracao?` · ${t.duracao} min`:''}. Próximo: ${esc(prox.tipo)}.</span></div></div>`).join('')
          :`<div class="pt-hoje"><span class="pt-tipo" style="--c:${corTipo(prox.tipo)}">${esc(siglaTipo(prox.tipo))}</span><div><h2 class="lendo-titulo">${esc(prox.tipo)}</h2><span class="muted small">Será o treino nº ${fmtN0.format(prox.numero)}${T.length?` · o último foi ${esc(T[T.length-1].tipo)} em ${dBR(T[T.length-1].data)}`:''}</span></div></div>
          <div class="toolbar"><button class="btn primary" type="button" id="pt-fiz">Fiz hoje</button><button class="btn" type="button" data-treino-novo="${hoje}">Outra data ou treino</button></div>`}
      </div>
      <div class="panel meta-card"><div class="panel-h"><span class="eyebrow">Metas de ${ano}</span>${tf.metaAberta?'':`<button class="linkbtn" type="button" id="pt-meta-ed">${mSem||mAno?'Editar':'Definir metas'}</button>`}</div>
        ${tf.metaAberta?`<form class="form-row" id="pt-meta-form">
            <div class="field" style="flex:0 1 130px"><label for="pt-meta-s">Treinos por semana</label><input type="number" id="pt-meta-s" min="1" max="14" value="${mSem??''}" placeholder="Ex.: 4"></div>
            <div class="field" style="flex:0 1 130px"><label for="pt-meta-a">Treinos no ano</label><input type="number" id="pt-meta-a" min="1" max="800" value="${mAno??''}" placeholder="Ex.: 180"></div>
            <button class="btn primary" type="submit">Salvar</button><button class="btn" type="button" id="pt-meta-x">Cancelar</button></form>`
          :(mSem||mAno)?`${mSem?`<div class="meta-linha"><div class="meta-rot"><b>${semana.length}</b> de ${mSem} nesta semana<span class="muted small">${semana.length>=mSem?'semana cumprida':`faltam ${mSem-semana.length}`}</span></div>
              <div class="pt-pontos">${Array.from({length:Math.max(mSem,semana.length)},(_,i)=>`<i class="${i<semana.length?'on':''}"></i>`).join('')}</div></div>`:''}
            ${mAno?barraMeta(doAno.length,mAno,'treinos',ano):''}`
          :`<p class="muted">Defina quantos treinos quer fazer por semana e no ano. O progresso é calculado sozinho.</p>`}
      </div>
    </div>
    <div class="grid g-kpi">
      <div class="panel kpi"><span class="eyebrow">Em ${ano}</span><span class="big">${doAno.length}</span><span class="sub">${mAno?`meta de ${mAno}`:'treinos no ano'}</span></div>
      <div class="panel kpi"><span class="eyebrow">Neste mês</span><span class="big">${doMes.length}</span><span class="sub">${MESES[new Date().getMonth()].toLowerCase()}</span></div>
      <div class="panel kpi"><span class="eyebrow">Sequência</span><span class="big">${seq}</span><span class="sub">semana(s) seguidas com ${mSem?`${mSem}+ treinos`:'treino'}</span></div>
      <div class="panel kpi"><span class="eyebrow">Média por semana</span><span class="big">${fmtN1.format(doze.length/12)}</span><span class="sub">últimas 12 semanas</span></div>
    </div>
    ${htmlMapaAno()}
    <div class="grid g-2 pt-baixo">
      ${htmlMesTreinos()}
      ${htmlHistorico()}
    </div>
  </div>`;
  ligar(v);
}

function htmlCiclo(){
  return `<div class="panel"><div class="panel-h"><h2>Ciclo de treinos</h2><span class="muted small">A ordem define qual é o próximo treino sugerido</span></div>
    <form class="form-row" id="pt-ciclo-form">
      <div class="field"><label for="pt-ciclo">Treinos do ciclo (separe por vírgula)</label><input type="text" id="pt-ciclo" maxlength="400" value="${esc(cicloTreinos().join(', '))}" placeholder="Treino 1, Treino 2, Treino 3, Treino 4"></div>
      <button class="btn primary" type="submit">Salvar</button><button class="btn" type="button" id="pt-ciclo-x">Fechar</button>
    </form></div>`;
}

// Mapa do ano: uma coluna por semana, um quadradinho por dia, colorido pelo treino feito.
function htmlMapaAno(){
  const T=S.P.treinos, anos=[...new Set([new Date().getFullYear(), ...T.map(t=>+t.data.slice(0,4))])].sort((a,b)=>b-a);
  const a=tf.ano, porDia=new Map(); T.filter(t=>+t.data.slice(0,4)===a).forEach(t=>{ (porDia.get(t.data)||porDia.set(t.data,[]).get(t.data)).push(t); });
  const ini=inicioSemana(`${a}-01-01`), fim=`${a}-12-31`, hoje=hojeISO();
  const colunas=[]; for(let s=ini; s<=fim; s=addDias(s,7)) colunas.push(s);
  const mesesRot=colunas.map((s,i)=>{ const d=addDias(s,6); return d.slice(8,10)<='07'&&d.slice(0,4)==String(a)?`<span style="grid-column:${i+1}">${MESES[+d.slice(5,7)-1].slice(0,3)}</span>`:''; }).join('');
  const porTipo=new Map(); [...porDia.values()].flat().forEach(t=>porTipo.set(t.tipo,(porTipo.get(t.tipo)||0)+1));
  return `<div class="panel"><div class="panel-h"><h2>${a} em treinos</h2>
      <select id="pt-ano" aria-label="Ano">${anos.map(x=>opt(x,x,a)).join('')}</select></div>
    <div class="mapa-rolagem"><div class="mapa" style="--cols:${colunas.length}">
      <div class="mapa-meses">${mesesRot}</div>
      <div class="mapa-dias">${['','Seg','','Qua','','Sex',''].map(d=>`<span>${d}</span>`).join('')}</div>
      <div class="mapa-grade">${colunas.map(s=>Array.from({length:7},(_,k)=>{ const d=addDias(s,k); if(d.slice(0,4)!=String(a)) return '<i class="vazio"></i>';
        const ts=porDia.get(d); return ts?`<i class="on" style="--c:${corTipo(ts[0].tipo)}" data-treino-dia="${d}" data-tip="${esc(dBR(d))}<br><b>${esc(ts.map(t=>t.tipo+(t.numero?' · nº '+t.numero:'')).join(' + '))}</b>"></i>`
          :`<i class="${d>hoje?'futuro':''}" data-treino-novo="${d<=hoje?d:''}" data-tip="${esc(dBR(d))} · sem treino"></i>`; }).join('')).join('')}</div>
    </div></div>
    <div class="legenda">${[...porTipo.entries()].sort((x,y)=>x[0].localeCompare(y[0],'pt-BR',{numeric:true})).map(([t,n])=>`<span><i style="background:${corTipo(t)}"></i>${esc(t)} · ${n}</span>`).join('')}<span class="muted">${fmtN0.format(porDia.size)} dias com treino</span></div>
  </div>`;
}

function htmlMesTreinos(){
  const ym=tf.mes, semanas=gradeMes(+ym.slice(0,4), +ym.slice(5,7)-1), hoje=hojeISO();
  const porDia=new Map(); S.P.treinos.forEach(t=>{ (porDia.get(t.data)||porDia.set(t.data,[]).get(t.data)).push(t); });
  const n=S.P.treinos.filter(t=>t.data.slice(0,7)===ym).length;
  return `<div class="panel"><div class="panel-h">${navMes('pt',ym)}<span class="muted small">${n} treino(s)</span></div>
    <div class="cal-grade cal-compacta">${SEM_CURTA.map(d=>`<span class="cal-sem">${d}</span>`).join('')}
      ${semanas.flat().map(d=>{ const ts=porDia.get(d)||[], fora=d.slice(0,7)!==ym;
        return `<div class="cal-dia${fora?' fora':''}${d===hoje?' hoje':''}${!ts.length&&d<=hoje?' livre':''}"${!ts.length&&d<=hoje?` data-treino-novo="${d}" title="Registrar treino em ${dBR(d)}"`:''}><span class="cal-n">${+d.slice(8,10)}</span>
          ${ts.map(t=>`<button type="button" class="pt-chip" style="--c:${corTipo(t.tipo)}" data-treino="${t.id}" title="${esc(t.tipo)}${t.numero?' · nº '+t.numero:''}">${esc(siglaTipo(t.tipo))}${t.numero?`<small>${t.numero}</small>`:''}</button>`).join('')}</div>`; }).join('')}
    </div><span class="note">Clique num dia vazio para registrar um treino, ou num treino para editar.</span></div>`;
}

function htmlHistorico(){
  const T=[...S.P.treinos].reverse(), mostra=tf.todos?T:T.slice(0,15);
  if(!T.length) return `<div class="panel"><h2>Histórico</h2><p class="muted">Nenhum treino ainda. Use "Fiz hoje" ou "Registrar treino". Se quiser, me mande a exportação do Notion que eu trago o histórico.</p></div>`;
  return `<div class="panel"><div class="panel-h"><h2>Histórico</h2><span class="muted small">${T.length} treinos</span></div>
    <table class="tbl-plain"><thead><tr><th>Data</th><th>Treino</th><th class="v">Nº</th><th class="v">Min</th></tr></thead><tbody>
    ${mostra.map(t=>`<tr data-treino="${t.id}" style="cursor:pointer" title="${esc(t.obs)}"><td>${dBR(t.data)} <span class="muted small">${SEM_CURTA[dataDe(t.data).getDay()]}</span></td><td><span class="pt-bola" style="--c:${corTipo(t.tipo)}"></span>${esc(t.tipo)}${t.obs?' <span class="muted small">· '+esc(t.obs.slice(0,40))+'</span>':''}</td><td class="v">${t.numero??''}</td><td class="v">${t.duracao??''}</td></tr>`).join('')}
    </tbody></table>${T.length>15?`<button class="linkbtn" type="button" id="pt-todos">${tf.todos?'Mostrar só os últimos':'Mostrar todos'}</button>`:''}</div>`;
}

function ligar(v){
  v.onclick=e=>{
    const t=e.target.closest('[data-treino],[data-treino-novo],[data-treino-dia],[data-pt-mes],#pt-fiz,#pt-todos,#pt-ciclo-ed,#pt-ciclo-x,#pt-meta-ed,#pt-meta-x');
    if(!t||!v.contains(t)) return;
    if(t.dataset.ptMes!=null){ const n=+t.dataset.ptMes; tf.mes=n?mudarMes(tf.mes,n):hojeISO().slice(0,7); renderTreinos(); return; }
    if(t.id==='pt-fiz'){ const p=proximoTreino(); gravarPes(()=>S.api.pesTreino(null,{data:hojeISO(), tipo:p.tipo, numero:p.numero, duracao_min:null, observacao:null}), `${p.tipo} registrado. Treino nº ${p.numero}!`); return; }
    if(t.id==='pt-todos'){ tf.todos=!tf.todos; renderTreinos(); return; }
    if(t.id==='pt-ciclo-ed'){ tf.cicloAberto=!tf.cicloAberto; renderTreinos(); return; }
    if(t.id==='pt-ciclo-x'){ tf.cicloAberto=false; renderTreinos(); return; }
    if(t.id==='pt-meta-ed'){ tf.metaAberta=true; renderTreinos(); return; }
    if(t.id==='pt-meta-x'){ tf.metaAberta=false; renderTreinos(); return; }
    if(t.dataset.treino) return abrirTreino(+t.dataset.treino);
    if(t.dataset.treinoDia){ const ts=S.P.treinos.filter(x=>x.data===t.dataset.treinoDia); if(ts[0]) abrirTreino(ts[0].id); return; }
    if(t.dataset.treinoNovo) abrirTreino(null, t.dataset.treinoNovo);
  };
  if($('pt-ano')) $('pt-ano').onchange=e=>{ tf.ano=+e.target.value; renderTreinos(); };
  if($('pt-ciclo-form')) $('pt-ciclo-form').onsubmit=e=>{ e.preventDefault();
    const nomes=[...new Set($('pt-ciclo').value.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,10);
    if(!nomes.length||nomes.some(n=>n.length>60)){ S.toast('Escreva pelo menos um treino (até 60 letras cada).'); return; }
    tf.cicloAberto=false; gravarPes(()=>S.api.pesCiclo(nomes),'Ciclo salvo.'); };
  if($('pt-meta-form')) $('pt-meta-form').onsubmit=e=>{ e.preventDefault(); const ano=new Date().getFullYear();
    const s=$('pt-meta-s').value?Math.round(+$('pt-meta-s').value):null, a=$('pt-meta-a').value?Math.round(+$('pt-meta-a').value):null;
    if((s!=null&&s<=0)||(a!=null&&a<=0)){ S.toast('Use números maiores que zero.'); return; }
    tf.metaAberta=false;
    gravarPes(async()=>{ await S.api.pesMeta(ano,'semana',s,'treinos'); await S.api.pesMeta(ano,'ano',a,'treinos'); }, s||a?'Metas de treino salvas.':'Metas removidas.'); };
}

// Formulário de treino (novo ou edição). Usado também pela Agenda.
export function abrirTreino(id, dataPadrao){
  const novo=id==null, p=proximoTreino();
  const t=novo?{id:null,data:dataPadrao||hojeISO(),tipo:p.tipo,numero:p.numero,duracao:null,obs:''}:S.P.treinos.find(x=>x.id===id);
  if(!t) return;
  const c=cicloTreinos(), d=dialogo('pt-dlg','Treino');
  d.innerHTML=`<form class="dlg-in" id="ptf">
    <div class="ficha-topo"><h2>${novo?'Registrar treino':'Treino'}</h2><button class="icon-btn" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <span class="muted small">${diaPorExtenso(t.data)}</span>
    <div class="pt-escolha" role="group" aria-label="Treino">${c.map(x=>`<button type="button" data-tipo="${esc(x)}" aria-pressed="${x===t.tipo}" style="--c:${corTipo(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="form-row">
      <div class="field"><label for="ptf-tipo">Treino</label><input type="text" id="ptf-tipo" maxlength="60" required value="${esc(t.tipo)}"></div>
      <div class="field" style="flex:0 1 150px"><label for="ptf-data">Data</label><input type="date" id="ptf-data" required value="${t.data}" max="${addDias(hojeISO(),1)}"></div>
    </div>
    <div class="form-row">
      <div class="field" style="flex:0 1 120px"><label for="ptf-num">Nº do treino</label><input type="number" id="ptf-num" min="1" value="${t.numero??''}"></div>
      <div class="field" style="flex:0 1 120px"><label for="ptf-dur">Duração (min)</label><input type="number" id="ptf-dur" min="1" max="600" value="${t.duracao??''}"></div>
    </div>
    <div class="field"><label for="ptf-obs">Observações</label><textarea id="ptf-obs" rows="3" maxlength="2000" placeholder="Cargas, como se sentiu…">${esc(t.obs)}</textarea></div>
    <div class="toolbar" style="justify-content:flex-end">${novo?'':'<button class="btn" type="button" id="ptf-exc" style="color:var(--neg);margin-right:auto">Excluir</button>'}<button class="btn" type="button" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form>`;
  if(!d.open) d.showModal();
  d.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>d.close());
  d.querySelectorAll('[data-tipo]').forEach(b=>b.onclick=()=>{ $('ptf-tipo').value=b.dataset.tipo; d.querySelectorAll('[data-tipo]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); });
  if($('ptf-exc')) $('ptf-exc').onclick=()=>{ if(!confirm(`Excluir o ${t.tipo} de ${dBR(t.data)}?`)) return; d.close(); gravarPes(()=>S.api.pesExcluirTreino(t.id),'Treino excluído.'); };
  $('ptf').onsubmit=e=>{ e.preventDefault();
    const num=$('ptf-num').value?Math.round(+$('ptf-num').value):null, dur=$('ptf-dur').value?Math.round(+$('ptf-dur').value):null;
    const campos={ data:$('ptf-data').value, tipo:$('ptf-tipo').value.trim(), numero:num&&num>0?num:null, duracao_min:dur&&dur>0?Math.min(dur,600):null, observacao:$('ptf-obs').value.trim()||null };
    if(!campos.tipo||!campos.data){ S.toast('Informe o treino e a data.'); return; }
    d.close();
    gravarPes(()=>S.api.pesTreino(t.id,campos), novo?`${campos.tipo} registrado.`:'Treino salvo.');
  };
}
