// Leituras: estante, fila, lista, calendário, números, meta do ano e a ficha de cada livro.
import { S, fmtN0, fmtN1, fmtP0, esc, dBR, dCurta, sum, $, hojeISO, norm, MESES, SEM_CURTA, ler, gravar, opt, svg, ICONES, capa,
  gradeMes, mudarMes, navMes, gravarPes, meta, livrosNoDia, diasEntre } from './pes-comum.js';

const STATUS = {lendo:'Lendo', quero_ler:'Quero ler', lido:'Lido', abandonado:'Abandonado'};
const ORDEM_STATUS = {lendo:0, quero_ler:1, lido:2, abandonado:3};

const f = {modo: ler('pes.modo','estante'), q:'', status:'', ano:'', genero:'', anoVisto:null, mes: hojeISO().slice(0,7)};
let fichaId = null, metaAberta = false;
export function reiniciarLeituras(){ fichaId=null; metaAberta=false; Object.assign(f,{q:'',status:'',ano:'',genero:'',anoVisto:null,mes:hojeISO().slice(0,7)}); }

const anoDe = l => l.fim ? +l.fim.slice(0,4) : l.ano;
const dias = l => l.inicio && l.fim ? Math.round((new Date(l.fim)-new Date(l.inicio))/86400000) : null;
const estrelas = n => n==null ? '' : '★'.repeat(Math.floor(n)) + (n%1 ? '½' : '');
const lidos = () => S.P.livros.filter(l=>l.status==='lido');
const fila = () => S.P.livros.filter(l=>l.status==='quero_ler').sort((a,b)=>(a.ordem??1e9)-(b.ordem??1e9)||a.id-b.id);
const metaL = (ano, ind) => meta(ano,'leituras',ind)?.alvo ?? null;
function ordenar(a,b){
  const ref = l => String(l.fim||l.inicio||(l.ano?l.ano+'-00':''));
  return ORDEM_STATUS[a.status]-ORDEM_STATUS[b.status] || (a.status==='quero_ler'?(a.ordem??1e9)-(b.ordem??1e9):0)
    || ref(b).localeCompare(ref(a)) || a.titulo.localeCompare(b.titulo,'pt-BR');
}
function filtrados(){
  const q=norm(f.q);
  return S.P.livros.filter(l=>(!q||norm(l.titulo+' '+l.autor).includes(q))&&(!f.status||l.status===f.status)
    &&(!f.ano||(f.ano==='sem'?!anoDe(l)&&l.status==='lido':String(anoDe(l))===f.ano))&&(!f.genero||l.generos.includes(f.genero))).sort(ordenar);
}
// Ritmo recente: páginas por dia nos livros com datas terminados nos últimos dois anos.
function ritmo(){
  const corte=`${new Date().getFullYear()-2}-01-01`;
  const L=lidos().filter(l=>dias(l)>0&&l.fim>=corte);
  const d=sum(L.map(dias));
  return d ? sum(L.map(l=>l.paginas||0))/d : null;
}

export function renderLeituras(){
  if(!$('v-pes-leituras')) return;
  if(!S.P){ $('v-pes-leituras').innerHTML='<div class="panel"><span class="muted">Carregando leituras…</span></div>'; return; }
  desenharLeituras();
}

/* ---------- Leituras ---------- */
function desenharLeituras(){
  const ano=new Date().getFullYear(), L=lidos(), doAno=L.filter(l=>anoDe(l)===ano);
  const lendo=S.P.livros.filter(l=>l.status==='lendo');
  const notas=L.filter(l=>l.nota!=null).map(l=>l.nota);
  const anos=[...new Set(L.map(anoDe).filter(Boolean))].sort((a,b)=>b-a);
  const generos=[...new Set(S.P.livros.flatMap(l=>l.generos))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const lista=filtrados(), F=fila();
  const modos=[['estante','Estante'],['fila',`Fila (${F.length})`],['lista','Lista'],['calendario','Calendário'],['numeros','Números']];
  const corpo = f.modo==='lista' ? htmlLista(lista) : f.modo==='numeros' ? htmlNumeros() : f.modo==='fila' ? htmlFila(F) : f.modo==='calendario' ? htmlCalendario() : htmlEstante(lista);
  const comFiltros = f.modo==='estante'||f.modo==='lista';
  $('v-pes-leituras').innerHTML=`<div class="wrap" style="gap:18px">
    <div class="head"><div><h1>Leituras</h1><p>${fmtN0.format(L.length)} livros lidos · ${fmtN0.format(sum(L.map(l=>l.paginas||0)))} páginas ao longo dos anos</p></div>
      <div class="toolbar"><button class="btn" id="pl-fila-add" type="button">Adicionar à fila</button><button class="btn primary" id="pl-novo" type="button">Registrar livro</button></div></div>
    <div class="leit-topo">
      ${htmlLendo(lendo)}
      ${htmlMeta(ano, doAno)}
    </div>
    <div class="grid g-3 leit-kpis">
      <div class="panel kpi"><span class="eyebrow">Lidos em ${ano}</span><span class="big">${doAno.length}</span><span class="sub">${fmtN0.format(sum(doAno.map(l=>l.paginas||0)))} páginas</span></div>
      <div class="panel kpi"><span class="eyebrow">Na fila</span><span class="big">${F.length}</span><span class="sub">${fmtN0.format(sum(F.map(l=>l.paginas||0)))} páginas esperando</span></div>
      <div class="panel kpi"><span class="eyebrow">Nota média</span><span class="big">${notas.length?fmtN1.format(sum(notas)/notas.length):'–'}</span><span class="sub">${notas.length} livros avaliados</span></div>
    </div>
    <div class="toolbar barra-filtros">
      <div class="seg" role="group" aria-label="Visão">${modos.map(([k,l])=>`<button type="button" data-modo="${k}" aria-pressed="${f.modo===k}">${l}</button>`).join('')}</div>
      ${comFiltros?`<input type="search" id="pl-q" placeholder="Buscar título ou autor" value="${esc(f.q)}">
      <select id="pl-st" aria-label="Status">${opt('','Todos os status',f.status)}${Object.entries(STATUS).map(([k,l])=>opt(k,l,f.status)).join('')}</select>
      <select id="pl-ano" aria-label="Ano">${opt('','Todos os anos',f.ano)}${anos.map(a=>opt(a,a,f.ano)).join('')}${opt('sem','Lidos sem data',f.ano)}</select>
      <select id="pl-gen" aria-label="Gênero">${opt('','Todos os gêneros',f.genero)}${generos.map(g=>opt(g,g,f.genero)).join('')}</select>
      <span class="muted small" id="pl-cont">${lista.length} livro(s)</span>`:''}
    </div>
    <div id="pl-corpo">${corpo}</div>
  </div>
  <dialog id="pl-ficha" class="ficha" aria-label="Ficha do livro"></dialog>`;
  ligarLeituras();
  if(fichaId!==null) abrirFicha(fichaId);
}

function htmlLendo(lendo){
  if(!lendo.length) return `<div class="panel lendo-card vazio"><span class="eyebrow">Lendo agora</span><p class="muted">Nenhum livro em leitura. Comece o próximo da fila.</p>${fila().length?`<button class="btn" type="button" data-comecar="${fila()[0].id}">Começar "${esc(fila()[0].titulo)}"</button>`:''}</div>`;
  return lendo.map(l=>{ const d=l.inicio?Math.max(0,Math.round((new Date(hojeISO())-new Date(l.inicio))/86400000)):null;
    return `<div class="panel lendo-card"><div class="lendo-capa" data-livro="${l.id}" role="button" tabindex="0" aria-label="Abrir ${esc(l.titulo)}">${capa(l)}</div>
      <div class="lendo-txt"><span class="eyebrow">Lendo agora</span><h2 class="lendo-titulo">${esc(l.titulo)}</h2><span class="muted">${esc(l.autor)}</span>
        <span class="small muted">${[l.paginas?fmtN0.format(l.paginas)+' páginas':'', d!=null?`dia ${d+1} de leitura`:'' ].filter(Boolean).join(' · ')}</span>
        <div class="toolbar" style="margin-top:auto"><button class="btn primary" type="button" data-terminei="${l.id}">Terminei</button><button class="btn" type="button" data-livro="${l.id}">Anotações</button></div></div></div>`; }).join('');
}

function htmlMeta(ano, doAno){
  const mL=metaL(ano,'livros'), mP=metaL(ano,'paginas');
  const passado=(new Date()-new Date(ano,0,1))/(new Date(ano+1,0,1)-new Date(ano,0,1));
  const pg=sum(doAno.map(l=>l.paginas||0));
  const barra=(feito,alvo,rot)=>{ const pct=Math.min(1,feito/alvo), prev=Math.round(feito/Math.max(passado,0.01));
    return `<div class="meta-linha"><div class="meta-rot"><b>${fmtN0.format(feito)}</b> de ${fmtN0.format(alvo)} ${rot}<span class="muted small">${fmtP0.format(feito/alvo)}</span></div>
      <div class="meta-barra"><div class="meta-feito" style="width:${pct*100}%"></div><span class="pace" style="left:${passado*100}%" title="Onde deveria estar hoje"></span></div>
      <span class="small ${feito>=alvo*passado?'up':'muted'}">${feito>=alvo?'Meta batida!':feito>=alvo*passado?`No ritmo: a projeção é de ${fmtN0.format(prev)} até dezembro.`:`Faltam ${fmtN0.format(Math.ceil(alvo*passado-feito))} para estar no ritmo · projeção de ${fmtN0.format(prev)}.`}</span></div>`; };
  const form=`<form class="form-row" id="pl-meta-form">
      <div class="field" style="flex:0 1 110px"><label for="pl-meta-l">Livros</label><input type="number" id="pl-meta-l" min="1" value="${mL??''}" placeholder="Ex.: 12"></div>
      <div class="field" style="flex:0 1 130px"><label for="pl-meta-p">Páginas (opcional)</label><input type="number" id="pl-meta-p" min="1" value="${mP??''}" placeholder="Ex.: 4000"></div>
      <button class="btn primary" type="submit">Salvar</button><button class="btn" type="button" id="pl-meta-x">Cancelar</button></form>`;
  return `<div class="panel meta-card"><div class="panel-h"><span class="eyebrow">Meta de ${ano}</span>${metaAberta?'':`<button class="linkbtn" type="button" id="pl-meta-ed">${mL||mP?'Editar':'Definir meta'}</button>`}</div>
    ${metaAberta?form:(mL||mP)?`${mL?barra(doAno.length,mL,'livros'):''}${mP?barra(pg,mP,'páginas'):''}`:`<p class="muted">Defina quantos livros (e, se quiser, quantas páginas) quer ler em ${ano}. O progresso é calculado sozinho.</p>`}</div>`;
}

function htmlEstante(lista){
  if(!lista.length) return '<div class="panel"><span class="muted">Nenhum livro com esses filtros.</span></div>';
  return `<div class="estante">${lista.map(l=>`<div class="livro" data-livro="${l.id}" tabindex="0" role="button" aria-label="${esc(l.titulo)}">
    ${capa(l)}<b>${esc(l.titulo)}</b><span class="muted small">${esc(l.autor)}</span>
    <span class="small">${l.status==='lido'?`<span class="estrelas">${estrelas(l.nota)}</span>${anoDe(l)?` <span class="muted">· ${anoDe(l)}</span>`:''}`:`<span class="pill ${l.status==='lendo'?'good':l.status==='abandonado'?'crit':'warn'}">${STATUS[l.status]}${l.status==='quero_ler'&&l.ordem?` · ${l.ordem}º`:''}</span>`}</span>
  </div>`).join('')}</div>`;
}

function htmlFila(F){
  const r=ritmo(), pg=sum(F.map(l=>l.paginas||0));
  if(!F.length) return `<div class="panel"><h2>Fila vazia</h2><p class="muted">Use "Adicionar à fila" para montar a lista dos próximos livros, na ordem que quiser ler.</p></div>`;
  let acumulado=0;
  return `<div class="panel">
    <div class="panel-h"><h2>Próximas leituras</h2><span class="muted small">${F.length} livros · ${fmtN0.format(pg)} páginas${r?` · no seu ritmo (${fmtN1.format(r)} páginas/dia), uns ${fmtN0.format(Math.round(pg/r/30))} meses`:''}</span></div>
    <ol class="fila" id="pl-fila">${F.map((l,i)=>{ acumulado+=l.paginas||0; const quando=r?new Date(Date.now()+acumulado/r*86400000):null;
      return `<li class="fila-item" draggable="true" data-fila="${l.id}">
        <span class="fila-pega" title="Arraste para mudar a ordem">${svg(ICONES.arrastar)}</span>
        <span class="fila-pos">${i+1}</span>
        <div class="fila-capa" data-livro="${l.id}" role="button" tabindex="0" aria-label="Abrir ${esc(l.titulo)}">${capa(l)}</div>
        <div class="fila-txt" data-livro="${l.id}"><b>${esc(l.titulo)}</b><span class="muted small">${esc(l.autor)}${l.paginas?` · ${fmtN0.format(l.paginas)} páginas`:''}</span></div>
        <span class="small muted fila-quando">${quando?`até ${MESES[quando.getMonth()].slice(0,3).toLowerCase()}/${String(quando.getFullYear()).slice(2)}`:''}</span>
        <div class="fila-acoes">
          <button class="icon-btn" type="button" data-subir="${l.id}" aria-label="Subir"${i?'':' disabled'}>${svg(ICONES.cima)}</button>
          <button class="icon-btn" type="button" data-descer="${l.id}" aria-label="Descer"${i<F.length-1?'':' disabled'}>${svg(ICONES.baixo)}</button>
          <button class="btn" type="button" data-comecar="${l.id}">Começar</button>
        </div></li>`; }).join('')}</ol>
    <span class="note">Arraste ou use as setas para definir a ordem. A previsão usa o seu ritmo dos últimos dois anos.</span></div>`;
}

function htmlLista(lista){
  return `<div class="tbl-wrap"><table><thead><tr><th>Título</th><th>Autor</th><th>Status</th><th>Gêneros</th><th>Nota</th><th class="v">Início</th><th class="v">Fim</th><th class="v">Dias</th><th class="v">Páginas</th></tr></thead><tbody>
    ${lista.map(l=>`<tr data-livro="${l.id}" data-id="${l.id}" tabindex="0" style="cursor:pointer"><td><b>${esc(l.titulo)}</b></td><td>${esc(l.autor)}</td><td>${STATUS[l.status]}</td>
      <td>${l.generos.map(g=>`<span class="tag" style="margin:0 4px 0 0">${esc(g)}</span>`).join('')}</td><td class="estrelas">${estrelas(l.nota)}</td>
      <td class="v">${dBR(l.inicio)}</td><td class="v">${l.fim?dBR(l.fim):l.status!=='quero_ler'&&l.ano?l.ano:''}</td><td class="v">${dias(l)??''}</td><td class="v">${l.paginas?fmtN0.format(l.paginas):''}</td></tr>`).join('')}
    <tr class="tot"><td colspan="8"><b>${lista.length} livro(s)</b></td><td class="v"><b>${fmtN0.format(sum(lista.map(l=>l.paginas||0)))}</b></td></tr>
  </tbody></table></div>`;
}

function htmlNumeros(){
  const L=lidos(), porAno={};
  for(const l of L){ const a=anoDe(l)||'Sem data'; (porAno[a] ??= {n:0,pg:0,notas:[]}); porAno[a].n++; porAno[a].pg+=l.paginas||0; if(l.nota!=null) porAno[a].notas.push(l.nota); }
  const anos=Object.keys(porAno).sort((a,b)=>a==='Sem data'?1:b==='Sem data'?-1:b-a);
  const maxN=Math.max(1,...anos.map(a=>porAno[a].n));
  const contar=(arr)=>{ const m={}; arr.forEach(x=>m[x]=(m[x]||0)+1); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const gen=contar(L.flatMap(l=>l.generos)).slice(0,10), aut=contar(L.map(l=>l.autor).filter(Boolean)).slice(0,8);
  const comDatas=L.filter(l=>dias(l)>0);
  const anosComLivro=anos.filter(a=>a!=='Sem data');
  if(!f.anoVisto||!anosComLivro.includes(String(f.anoVisto))) f.anoVisto=anosComLivro[0];
  const barras=(itens,max)=>`<div class="hbars">${itens.map(([k,v])=>`<div class="hbar"><span class="lbl" title="${esc(k)}">${esc(k)}</span><div class="track"><div class="fill" style="width:${v/max*100}%;background:var(--s3)"></div></div><span class="val">${v}</span></div>`).join('')}</div>`;
  return `<div class="grid" style="gap:18px">
    ${htmlAnoEmLivros(anosComLivro)}
    <div class="grid g-2">
      <div class="panel"><h2>Por ano</h2>
        <table class="tbl-plain"><thead><tr><th>Ano</th><th style="width:38%"></th><th class="v">Livros</th><th class="v">Páginas</th><th class="v">Nota</th></tr></thead><tbody>
        ${anos.map(a=>{ const x=porAno[a]; return `<tr><td><b>${a}</b></td><td><div class="minibar"><i style="width:${x.n/maxN*100}%"></i></div></td><td class="v">${x.n}</td><td class="v">${fmtN0.format(x.pg)}</td><td class="v">${x.notas.length?fmtN1.format(sum(x.notas)/x.notas.length):'–'}</td></tr>`; }).join('')}
        </tbody></table>
        <span class="note">Antes de 2023 o ano vem do Skoob, e nem todo livro tem data. Preencha o ano na ficha quando lembrar.</span></div>
      <div class="grid" style="align-content:start;gap:18px">
        <div class="panel"><h2>Ritmo</h2><div class="stat-row">
          <div class="stat"><span class="eyebrow">Dias por livro</span><b>${comDatas.length?fmtN0.format(Math.round(sum(comDatas.map(dias))/comDatas.length)):'–'}</b><span class="muted small">média de ${comDatas.length} com datas</span></div>
          <div class="stat"><span class="eyebrow">Páginas por dia</span><b>${ritmo()?fmtN1.format(ritmo()):'–'}</b><span class="muted small">últimos dois anos</span></div>
          <div class="stat"><span class="eyebrow">Maior livro</span><b>${fmtN0.format(Math.max(0,...L.map(l=>l.paginas||0)))}</b><span class="muted small">${esc(L.reduce((m,l)=>(l.paginas||0)>(m?.paginas||0)?l:m,null)?.titulo||'')}</span></div>
        </div></div>
        <div class="panel"><h2>Gêneros mais lidos</h2>${gen.length?barras(gen,gen[0][1]):'<span class="muted">Sem gêneros cadastrados.</span>'}</div>
        <div class="panel"><h2>Autores mais lidos</h2>${barras(aut,aut[0]?.[1]||1)}</div>
      </div>
    </div></div>`;
}

// Calendário do mês: a capa de cada livro aparece em todos os dias em que ele estava sendo lido.
function htmlCalendario(){
  const ym=f.mes, ano=+ym.slice(0,4), mes=+ym.slice(5,7)-1, hoje=hojeISO();
  const semanas=gradeMes(ano,mes);
  const doMes=new Map();
  for(const sem of semanas) for(const d of sem) doMes.set(d, livrosNoDia(d));
  const noMes=[...new Set([...doMes.entries()].filter(([d])=>d.slice(0,7)===ym).flatMap(([,ls])=>ls))]
    .sort((a,b)=>String(a.inicio||a.fim).localeCompare(String(b.inicio||b.fim)));
  const terminados=noMes.filter(l=>l.fim&&l.fim.slice(0,7)===ym);
  const celula=d=>{ const ls=doMes.get(d), fora=d.slice(0,7)!==ym, vis=ls.slice(0,2);
    return `<div class="cal-dia${fora?' fora':''}${d===hoje?' hoje':''}"><span class="cal-n">${+d.slice(8,10)}</span>
      ${ls.length?`<div class="cal-capas n${vis.length}">${vis.map(l=>`<div class="cal-livro${l.fim===d?' fim':''}${l.inicio===d?' ini':''}" data-livro="${l.id}" role="button" tabindex="0" title="${esc(l.titulo)}${l.fim===d?' · terminou':l.inicio===d?' · começou':''}">${capa(l)}${l.fim===d?`<span class="cal-ok">${svg(ICONES.ok)}</span>`:''}</div>`).join('')}${ls.length>2?`<span class="cal-mais">+${ls.length-2}</span>`:''}</div>`:''}
    </div>`; };
  const semDatas=lidos().filter(l=>!l.inicio).length;
  return `<div class="panel cal-leit">
    <div class="panel-h">${navMes('pl',ym)}<span class="muted small">${noMes.length?`${noMes.length} livro(s) no mês${terminados.length?` · ${terminados.length} terminado(s)`:''}`:'Nenhuma leitura registrada neste mês'}</span></div>
    <div class="cal-grade" role="grid" aria-label="Leituras de ${esc(ym)}">
      ${SEM_CURTA.map(d=>`<span class="cal-sem">${d}</span>`).join('')}
      ${semanas.flat().map(celula).join('')}
    </div>
    ${noMes.length?`<div class="cal-legenda">${noMes.map(l=>`<div class="cal-leg" data-livro="${l.id}" role="button" tabindex="0">${capa(l)}<div><b>${esc(l.titulo)}</b><span class="muted small">${l.inicio?dCurta(l.inicio):'?'} → ${l.fim?dCurta(l.fim):'lendo'}${l.inicio&&(l.fim||l.status==='lendo')?` · ${diasEntre(l.inicio,l.fim||hoje)+1} dias`:''}</span></div></div>`).join('')}</div>`:''}
    <span class="note">Os dias vêm das datas de início e fim de cada livro.${semDatas?` ${semDatas} livros lidos ainda não têm data de início; preencha na ficha para aparecerem aqui.`:''}</span>
  </div>`;
}

function htmlAnoEmLivros(anos){
  if(!anos.length) return '';
  const a=+f.anoVisto, L=lidos().filter(l=>anoDe(l)===a).sort((x,y)=>String(x.fim||'').localeCompare(String(y.fim||''))||x.titulo.localeCompare(y.titulo,'pt-BR'));
  const comData=L.filter(l=>l.fim), semData=L.filter(l=>!l.fim);
  const porMes={}; comData.forEach(l=>(porMes[+l.fim.slice(5,7)-1] ??= []).push(l));
  const mini=l=>`<div class="mini" data-livro="${l.id}" role="button" tabindex="0" title="${esc(l.titulo)}${l.nota?' · '+estrelas(l.nota):''}">${capa(l)}</div>`;
  return `<div class="panel"><div class="panel-h"><h2>${a} em livros</h2>
      <select id="pl-ano-visto" aria-label="Ano">${anos.map(x=>opt(x,x,a)).join('')}</select></div>
    <div class="ano-livros">${Object.keys(porMes).sort((x,y)=>x-y).map(m=>`<div class="ano-mes"><span class="eyebrow">${MESES[m]}</span><div class="ano-capas">${porMes[m].map(mini).join('')}</div></div>`).join('')}
      ${semData.length?`<div class="ano-mes"><span class="eyebrow">${comData.length?'Sem mês':'Livros do ano'}</span><div class="ano-capas">${semData.map(mini).join('')}</div></div>`:''}</div>
    <span class="muted small">${L.length} livros · ${fmtN0.format(sum(L.map(l=>l.paginas||0)))} páginas</span></div>`;
}

/* ---------- eventos da tela ---------- */
function ligarLeituras(){
  const v=$('v-pes-leituras');
  v.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>{ f.modo=b.dataset.modo; gravar('pes.modo',f.modo); desenharLeituras(); });
  $('pl-novo').onclick=()=>abrirFicha(null,{status:'lido'});
  $('pl-fila-add').onclick=()=>abrirFicha(null,{status:'quero_ler'});
  if($('pl-q')){
    const redesenhar=()=>{ const l=filtrados(); $('pl-corpo').innerHTML=f.modo==='lista'?htmlLista(l):htmlEstante(l); $('pl-cont').textContent=`${l.length} livro(s)`; };
    $('pl-q').oninput=e=>{ f.q=e.target.value; redesenhar(); };
    $('pl-st').onchange=e=>{ f.status=e.target.value; redesenhar(); };
    $('pl-ano').onchange=e=>{ f.ano=e.target.value; redesenhar(); };
    $('pl-gen').onchange=e=>{ f.genero=e.target.value; redesenhar(); };
  }
  if($('pl-ano-visto')) $('pl-ano-visto').onchange=e=>{ f.anoVisto=e.target.value; desenharLeituras(); };
  v.querySelectorAll('[data-pl-mes]').forEach(b=>b.onclick=()=>{ const n=+b.dataset.plMes; f.mes=n?mudarMes(f.mes,n):hojeISO().slice(0,7); desenharLeituras(); });
  // Meta do ano
  if($('pl-meta-ed')) $('pl-meta-ed').onclick=()=>{ metaAberta=true; desenharLeituras(); };
  if($('pl-meta-form')){
    $('pl-meta-x').onclick=()=>{ metaAberta=false; desenharLeituras(); };
    $('pl-meta-form').onsubmit=e=>{ e.preventDefault(); const ano=new Date().getFullYear();
      const l=$('pl-meta-l').value?Math.round(+$('pl-meta-l').value):null, p=$('pl-meta-p').value?Math.round(+$('pl-meta-p').value):null;
      if((l!=null&&l<=0)||(p!=null&&p<=0)){ S.toast('Use números maiores que zero.'); return; }
      metaAberta=false;
      gravarPes(async()=>{ await S.api.pesMeta(ano,'livros',l); await S.api.pesMeta(ano,'paginas',p); }, l||p?`Meta de ${ano} salva.`:'Meta removida.'); };
  }
  // Cliques em livros, ações rápidas e fila
  v.onclick=e=>{
    const t=e.target.closest('[data-terminei],[data-comecar],[data-subir],[data-descer],[data-livro]');
    if(!t||!v.contains(t)) return;
    if(t.dataset.terminei){ const l=S.P.livros.find(x=>x.id==t.dataset.terminei), hoje=hojeISO();
      gravarPes(()=>S.api.pesLivro(l.id,{status:'lido', fim:hoje, ano_leitura:+hoje.slice(0,4), inicio:l.inicio&&l.inicio<=hoje?l.inicio:hoje}), 'Parabéns! Dê uma nota e registre suas impressões.', ()=>abrirFicha(l.id)); return; }
    if(t.dataset.comecar){ const l=S.P.livros.find(x=>x.id==t.dataset.comecar);
      if(S.P.livros.some(x=>x.status==='lendo')&&!confirm(`Começar "${l.titulo}" junto com o livro que você já está lendo?`)) return;
      gravarPes(async()=>{ await S.api.pesLivro(l.id,{status:'lendo', inicio:hojeISO(), ordem:null}); await S.api.pesReordenar(fila().filter(x=>x.id!==l.id).map(x=>x.id)); }, `Boa leitura: ${l.titulo}.`); return; }
    if(t.dataset.subir||t.dataset.descer){ const ids=fila().map(x=>x.id), id=+(t.dataset.subir||t.dataset.descer), i=ids.indexOf(id), j=t.dataset.subir?i-1:i+1;
      if(j<0||j>=ids.length) return; [ids[i],ids[j]]=[ids[j],ids[i]]; gravarPes(()=>S.api.pesReordenar(ids)); return; }
    if(t.dataset.livro) abrirFicha(+t.dataset.livro);
  };
  v.onkeydown=e=>{ const t=e.target.closest('[data-livro]'); if(t&&(e.key==='Enter'||e.key===' ')&&t.getAttribute('role')==='button'){ e.preventDefault(); abrirFicha(+t.dataset.livro); } };
  const lista=$('pl-fila');
  if(lista){
    let arrastado=null;
    lista.addEventListener('dragstart',e=>{ arrastado=e.target.closest('[data-fila]'); arrastado?.classList.add('arrastando'); e.dataTransfer.effectAllowed='move'; });
    lista.addEventListener('dragend',()=>{ arrastado?.classList.remove('arrastando'); arrastado=null; });
    lista.addEventListener('dragover',e=>{ e.preventDefault(); const alvo=e.target.closest('[data-fila]'); if(!arrastado||!alvo||alvo===arrastado) return;
      const r=alvo.getBoundingClientRect(); lista.insertBefore(arrastado, e.clientY<r.top+r.height/2?alvo:alvo.nextSibling); });
    lista.addEventListener('drop',e=>{ e.preventDefault(); const ids=[...lista.querySelectorAll('[data-fila]')].map(x=>+x.dataset.fila);
      if(ids.join()!==fila().map(x=>x.id).join()) gravarPes(()=>S.api.pesReordenar(ids), 'Ordem da fila salva.'); });
  }
}

/* ---------- Ficha do livro ---------- */
async function reduzirImagem(arquivo){
  const img=await createImageBitmap(arquivo);
  const h=Math.min(900,img.height), w=Math.round(img.width*h/img.height);
  const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
  return new Promise((ok,erro)=>c.toBlob(b=>b?ok(b):erro(new Error('Não foi possível ler a imagem.')),'image/jpeg',0.86));
}
function abrirFicha(id, padrao={}){
  const novo = id==null;
  const l = novo ? {id:null,titulo:'',autor:'',generos:[],paginas:null,status:'quero_ler',inicio:null,fim:null,nota:null,ano:null,capa:null,editora:'',isbn:'',anotacoes:'',citacoes:'',origem:'manual',ordem:null,...padrao} : S.P.livros.find(x=>x.id===id);
  if(!l){ fichaId=null; return; }
  fichaId=id;
  const d=$('pl-ficha');
  d.innerHTML=`<form class="ficha-in" id="pf-form">
    <div class="ficha-capa">
      <div id="pf-prev">${capa(l,'grande')}</div>
      <label class="btn block" for="pf-arq">Enviar imagem</label><input type="file" id="pf-arq" accept="image/jpeg,image/png,image/webp" hidden>
      <button class="btn block" type="button" id="pf-link">Usar link de imagem</button>
      <button class="btn block" type="button" id="pf-buscar">Buscar na internet</button>
      ${l.capa?'<button class="linkbtn" type="button" id="pf-semcapa">Remover capa</button>':''}
      <div id="pf-res" class="ficha-res"></div>
    </div>
    <div class="ficha-campos">
      <div class="ficha-topo"><h2>${novo?(l.status==='quero_ler'?'Adicionar à fila':'Registrar livro'):'Ficha do livro'}</h2><button class="icon-btn" type="button" id="pf-x" aria-label="Fechar">✕</button></div>
      <div class="field"><label for="pf-titulo">Título</label><input type="text" id="pf-titulo" maxlength="300" required value="${esc(l.titulo)}"></div>
      <div class="form-row">
        <div class="field"><label for="pf-autor">Autor</label><input type="text" id="pf-autor" maxlength="200" value="${esc(l.autor)}"></div>
        <div class="field" style="flex:0 1 150px"><label for="pf-status">Status</label><select id="pf-status">${Object.entries(STATUS).map(([k,t])=>opt(k,t,l.status)).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="field" style="flex:0 1 150px"><label for="pf-ini">Início</label><input type="date" id="pf-ini" value="${l.inicio||''}"></div>
        <div class="field" style="flex:0 1 150px"><label for="pf-fim">Fim</label><input type="date" id="pf-fim" value="${l.fim||''}"></div>
        <div class="field" style="flex:0 1 110px"><label for="pf-ano">Ano (sem data)</label><input type="number" id="pf-ano" min="1990" max="2100" value="${l.fim?'':l.ano||''}" placeholder="—"></div>
        <div class="field" style="flex:0 1 100px"><label for="pf-pag">Páginas</label><input type="number" id="pf-pag" min="1" value="${l.paginas||''}"></div>
        <div class="field" style="flex:0 1 120px"><label for="pf-nota">Nota</label><select id="pf-nota">${opt('','—',l.nota??'')}${[5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map(n=>opt(n,estrelas(n),l.nota??'')).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="pf-gen">Gêneros (separe por vírgula)</label><input type="text" id="pf-gen" value="${esc(l.generos.join(', '))}" placeholder="Ficção, Romance"></div>
        <div class="field" style="flex:0 1 180px"><label for="pf-ed">Editora</label><input type="text" id="pf-ed" maxlength="120" value="${esc(l.editora)}"></div>
        <div class="field" style="flex:0 1 150px"><label for="pf-isbn">ISBN</label><input type="text" id="pf-isbn" maxlength="20" value="${esc(l.isbn)}"></div>
      </div>
      <input type="hidden" id="pf-capa" value="${esc(l.capa||'')}">
      <div class="field"><label for="pf-notas">Anotações e resenha</label><textarea id="pf-notas" rows="7" maxlength="50000" placeholder="O que ficou deste livro…">${esc(l.anotacoes)}</textarea></div>
      <div class="field"><label for="pf-cit">Citações</label><textarea id="pf-cit" rows="4" maxlength="50000" placeholder="Trechos que você marcou">${esc(l.citacoes)}</textarea></div>
      <div class="toolbar" style="justify-content:space-between">
        <span class="muted small">${novo?'':`Origem: ${{notion:'Notion',skoob:'Skoob',manual:'cadastro manual'}[l.origem]}${dias(l)!=null?` · ${dias(l)} dias de leitura`:''}`}</span>
        <div class="toolbar">${novo?'':'<button class="btn" type="button" id="pf-excluir" style="color:var(--neg)">Excluir</button>'}<button class="btn" type="button" id="pf-fechar">Fechar</button><button class="btn primary" type="submit">Salvar</button></div>
      </div>
    </div>
  </form>`;
  if(!d.open) d.showModal();
  const fechar=()=>{ fichaId=null; d.close(); };
  d.onclose=()=>{ fichaId=null; };
  $('pf-fechar').onclick=fechar; $('pf-x').onclick=fechar;
  d.onclick=e=>{ if(e.target===d) fechar(); };
  const usarCapa=url=>{ $('pf-capa').value=url||''; $('pf-prev').innerHTML=capa({...l, capa:url||null, titulo:$('pf-titulo').value||l.titulo},'grande'); };
  $('pf-arq').onchange=async e=>{ const arq=e.target.files?.[0]; if(!arq) return;
    if(!/^image\/(jpeg|png|webp)$/.test(arq.type)){ S.toast('Use uma imagem JPG, PNG ou WEBP.'); return; }
    try{ S.toast('Enviando a capa…'); const url=await S.api.pesEnviarCapa(await reduzirImagem(arq)); usarCapa(url); S.toast('Capa enviada. Clique em Salvar para gravar.'); }
    catch(err){ S.toast(err?.message||String(err), true); } };
  $('pf-link').onclick=()=>{ const u=prompt('Cole o endereço da imagem (começando com https://):'); if(u==null) return;
    if(!/^https:\/\/\S+$/i.test(u.trim())||u.trim().length>500){ S.toast('Endereço inválido: precisa começar com https://'); return; } usarCapa(u.trim()); };
  if($('pf-semcapa')) $('pf-semcapa').onclick=()=>usarCapa(null);
  $('pf-buscar').onclick=async()=>{
    const titulo=$('pf-titulo').value.trim(); if(!titulo){ S.toast('Escreva o título primeiro.'); return; }
    const box=$('pf-res'); box.innerHTML='<span class="muted small">Buscando…</span>';
    try{
      const r=await S.api.pesBuscarLivro(titulo, $('pf-autor').value.trim());
      box.innerHTML=r.length?r.map((x,i)=>`<button type="button" class="res" data-i="${i}" title="${esc(x.titulo)} · ${esc(x.autor)}${x.ano?' · '+x.ano:''}">${x.capa?`<img src="${esc(x.capa)}" alt="" referrerpolicy="no-referrer">`:'<span class="capa vazia"><span>sem capa</span></span>'}<span class="small">${esc(x.editora||x.autor||'')}</span></button>`).join(''):'<span class="muted small">Nada encontrado. Envie a imagem ou use um link.</span>';
      box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{ const x=r[+b.dataset.i];
        if(x.capa) usarCapa(x.capa);
        if(!$('pf-autor').value&&x.autor) $('pf-autor').value=x.autor;
        if(!$('pf-pag').value&&x.paginas) $('pf-pag').value=x.paginas;
        if(!$('pf-ed').value&&x.editora) $('pf-ed').value=x.editora;
        if(!$('pf-isbn').value&&x.isbn) $('pf-isbn').value=x.isbn;
        S.toast('Dados aplicados. Confira e salve.'); });
    }catch(e){ box.innerHTML=''; S.toast(e?.message||String(e), true); }
  };
  if($('pf-excluir')) $('pf-excluir').onclick=()=>{ if(!confirm(`Excluir "${l.titulo}"? As anotações deste livro também serão apagadas.`)) return; fechar(); gravarPes(()=>S.api.pesExcluirLivro(l.id),'Livro excluído.'); };
  $('pf-form').onsubmit=e=>{ e.preventDefault();
    const ini=$('pf-ini').value||null, fim=$('pf-fim').value||null, st=$('pf-status').value;
    if(ini&&fim&&fim<ini){ S.toast('O fim não pode ser antes do início.'); return; }
    const pag=$('pf-pag').value?+$('pf-pag').value:null, anoSem=$('pf-ano').value?+$('pf-ano').value:null;
    const campos={ titulo:$('pf-titulo').value.trim(), autor:$('pf-autor').value.trim()||null,
      generos:[...new Set($('pf-gen').value.split(',').map(g=>g.trim()).filter(Boolean))].slice(0,10),
      paginas:pag&&pag>0?Math.round(pag):null, status:st, inicio:ini, fim:fim,
      nota:$('pf-nota').value?+$('pf-nota').value:null, ano_leitura:fim?+fim.slice(0,4):anoSem,
      capa_url:$('pf-capa').value||null, editora:$('pf-ed').value.trim()||null, isbn:$('pf-isbn').value.trim()||null,
      anotacoes:$('pf-notas').value||null, citacoes:$('pf-cit').value||null };
    if(!campos.titulo){ S.toast('Informe o título.'); return; }
    if(st==='lido'&&!fim&&!anoSem&&!confirm('Marcar como lido sem data de fim nem ano?')) return;
    // Entrou na fila: vai para o fim. Saiu da fila: perde a posição.
    if(st==='quero_ler'&&l.status!=='quero_ler') campos.ordem=Math.max(0,...fila().map(x=>x.ordem||0))+1;
    if(st!=='quero_ler') campos.ordem=null;
    fechar();
    gravarPes(()=>S.api.pesLivro(l.id, campos), novo?(st==='quero_ler'?'Livro adicionado à fila.':'Livro registrado.'):'Livro salvo.');
  };
}
