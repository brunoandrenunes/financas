// Área pessoal do painel. Por enquanto: Leituras (estante, lista, números e a ficha de cada livro).
// Agenda, treinos, metas e rotinas entram aqui nas próximas etapas.

const fmtN0 = new Intl.NumberFormat('pt-BR');
const fmtN1 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dBR = iso => iso ? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4) : '';
const sum = a => a.reduce((x,y)=>x+y,0);
const $ = id => document.getElementById(id);
const hojeISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

export const PES_VIEWS = [
  ['pes-leituras','Leituras','<path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z"/>'],
];
const STATUS = {lendo:'Lendo', quero_ler:'Quero ler', lido:'Lido', abandonado:'Abandonado'};
const ORDEM_STATUS = {lendo:0, quero_ler:1, lido:2, abandonado:3};

let api, toast, P = null;
const ler = (k,pad) => { try{ return localStorage.getItem(k) || pad; }catch{ return pad; } };
const gravar = (k,v) => { try{ localStorage.setItem(k,v); }catch{} };
const f = {modo: ler('pes.modo','estante'), q:'', status:'', ano:'', genero:''};
let fichaId = null;

/* ---------- auxiliares ---------- */
const anoDe = l => l.fim ? +l.fim.slice(0,4) : l.ano;
const dias = l => l.inicio && l.fim ? Math.round((new Date(l.fim)-new Date(l.inicio))/86400000) : null;
const estrelas = n => n==null ? '' : '★'.repeat(Math.floor(n)) + (n%1 ? '½' : '');
const lidos = () => P.livros.filter(l=>l.status==='lido');
function ordenar(a,b){
  return ORDEM_STATUS[a.status]-ORDEM_STATUS[b.status]
    || String(b.fim||b.inicio||(b.ano?b.ano+'-00':'')).localeCompare(String(a.fim||a.inicio||(a.ano?a.ano+'-00':'')))
    || a.titulo.localeCompare(b.titulo,'pt-BR');
}
function filtrados(){
  const q=norm(f.q);
  return P.livros.filter(l=>(!q||norm(l.titulo+' '+l.autor).includes(q))&&(!f.status||l.status===f.status)
    &&(!f.ano||(f.ano==='sem'?!anoDe(l)&&l.status==='lido':String(anoDe(l))===f.ano))&&(!f.genero||l.generos.includes(f.genero))).sort(ordenar);
}
const capa = (l, cls='') => l.capa
  ? `<img class="capa ${cls}" src="${esc(l.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<div class="capa vazia ${cls}"><span>${esc(l.titulo)}</span></div>`;

/* ---------- carga e gravação ---------- */
export function iniciarPes(apiDados, toastFn){ api=apiDados; toast=toastFn; P=null; fichaId=null; Object.assign(f,{q:'',status:'',ano:'',genero:''}); }
export async function carregarPes(){ P = await api.carregarPes(); renderPes(); }
let fila=Promise.resolve();
function gravarPes(fn, msg, depois){
  document.body.style.cursor='progress';
  fila=fila.then(async()=>{
    try{ await fn(); depois?.(); P=await api.carregarPes(); renderPes(); toast(msg); }
    catch(e){ toast(e?.message||String(e), true); }
    finally{ document.body.style.cursor=''; }
  });
  return fila;
}

export function renderPes(){
  if(!$('v-pes-leituras')) return;
  if(!P){ $('v-pes-leituras').innerHTML='<div class="panel"><span class="muted">Carregando leituras…</span></div>'; return; }
  renderLeituras();
}

/* ---------- Leituras ---------- */
function renderLeituras(){
  const ano=new Date().getFullYear(), L=lidos(), doAno=L.filter(l=>anoDe(l)===ano);
  const lendo=P.livros.filter(l=>l.status==='lendo');
  const notas=L.filter(l=>l.nota!=null).map(l=>l.nota);
  const anos=[...new Set(L.map(anoDe).filter(Boolean))].sort((a,b)=>b-a);
  const generos=[...new Set(P.livros.flatMap(l=>l.generos))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const lista=filtrados();
  const opt=(v,l,sel)=>`<option value="${esc(v)}"${String(sel)===String(v)?' selected':''}>${esc(l)}</option>`;
  const corpo = f.modo==='lista' ? htmlLista(lista) : f.modo==='numeros' ? htmlNumeros() : htmlEstante(lista);
  $('v-pes-leituras').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Leituras</h1><p>${fmtN0.format(L.length)} livros lidos · ${fmtN0.format(sum(L.map(l=>l.paginas||0)))} páginas</p></div>
      <button class="btn primary" id="pl-novo" type="button">Novo livro</button></div>
    <div class="grid g-kpi">
      <div class="panel kpi"><span class="eyebrow">Lendo agora</span><span class="big" style="font-size:19px;line-height:1.25">${lendo.length?lendo.map(l=>esc(l.titulo)).join('<br>'):'—'}</span><span class="sub">${lendo.length&&lendo[0].inicio?`Desde ${dBR(lendo[0].inicio)} · ${Math.round((new Date(hojeISO())-new Date(lendo[0].inicio))/86400000)} dias`:''}</span></div>
      <div class="panel kpi"><span class="eyebrow">Lidos em ${ano}</span><span class="big">${doAno.length}</span><span class="sub">${fmtN0.format(sum(doAno.map(l=>l.paginas||0)))} páginas</span></div>
      <div class="panel kpi"><span class="eyebrow">Na fila</span><span class="big">${P.livros.filter(l=>l.status==='quero_ler').length}</span><span class="sub">Marcados como "quero ler"</span></div>
      <div class="panel kpi"><span class="eyebrow">Nota média</span><span class="big">${notas.length?fmtN1.format(sum(notas)/notas.length):'–'}</span><span class="sub">${notas.length} livros avaliados</span></div>
    </div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Visão">${[['estante','Estante'],['lista','Lista'],['numeros','Números']].map(([k,l])=>`<button type="button" data-modo="${k}" aria-pressed="${f.modo===k}">${l}</button>`).join('')}</div>
      ${f.modo==='numeros'?'':`<input type="search" id="pl-q" placeholder="Buscar título ou autor" value="${esc(f.q)}" style="min-width:220px">
      <select id="pl-st" aria-label="Status">${opt('','Todos os status',f.status)}${Object.entries(STATUS).map(([k,l])=>opt(k,l,f.status)).join('')}</select>
      <select id="pl-ano" aria-label="Ano">${opt('','Todos os anos',f.ano)}${anos.map(a=>opt(a,a,f.ano)).join('')}${opt('sem','Lidos sem data',f.ano)}</select>
      <select id="pl-gen" aria-label="Gênero">${opt('','Todos os gêneros',f.genero)}${generos.map(g=>opt(g,g,f.genero)).join('')}</select>
      <span class="muted small">${lista.length} livro(s)</span>`}
    </div>
    <div id="pl-corpo">${corpo}</div>
  </div>
  <dialog id="pl-ficha" class="ficha"></dialog>`;
  const v=$('v-pes-leituras');
  v.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>{ f.modo=b.dataset.modo; gravar('pes.modo',f.modo); renderLeituras(); });
  $('pl-novo').onclick=()=>abrirFicha(null);
  if($('pl-q')){
    $('pl-q').oninput=e=>{ f.q=e.target.value; $('pl-corpo').innerHTML=f.modo==='lista'?htmlLista(filtrados()):htmlEstante(filtrados()); };
    $('pl-st').onchange=e=>{ f.status=e.target.value; renderLeituras(); };
    $('pl-ano').onchange=e=>{ f.ano=e.target.value; renderLeituras(); };
    $('pl-gen').onchange=e=>{ f.genero=e.target.value; renderLeituras(); };
  }
  $('pl-corpo').onclick=e=>{ const el=e.target.closest('[data-livro]'); if(el) abrirFicha(+el.dataset.livro); };
  $('pl-corpo').onkeydown=e=>{ const el=e.target.closest('[data-livro]'); if(el&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); abrirFicha(+el.dataset.livro); } };
  if(fichaId!==null) abrirFicha(fichaId);
}

function htmlEstante(lista){
  if(!lista.length) return '<div class="panel"><span class="muted">Nenhum livro com esses filtros.</span></div>';
  return `<div class="estante">${lista.map(l=>`<div class="livro" data-livro="${l.id}" tabindex="0" role="button" aria-label="${esc(l.titulo)}">
    ${capa(l)}<b>${esc(l.titulo)}</b><span class="muted small">${esc(l.autor)}</span>
    <span class="small">${l.status==='lido'?`<span class="estrelas">${estrelas(l.nota)}</span>${anoDe(l)?` <span class="muted">· ${anoDe(l)}</span>`:''}`:`<span class="pill ${l.status==='lendo'?'good':l.status==='abandonado'?'crit':'warn'}">${STATUS[l.status]}</span>`}</span>
  </div>`).join('')}</div>`;
}

function htmlLista(lista){
  return `<div class="tbl-wrap"><table><thead><tr><th>Título</th><th>Autor</th><th>Status</th><th>Gêneros</th><th>Nota</th><th class="v">Início</th><th class="v">Fim</th><th class="v">Dias</th><th class="v">Páginas</th></tr></thead><tbody>
    ${lista.map(l=>`<tr data-livro="${l.id}" data-id="${l.id}" tabindex="0" style="cursor:pointer"><td><b>${esc(l.titulo)}</b></td><td>${esc(l.autor)}</td><td>${STATUS[l.status]}</td>
      <td>${l.generos.map(g=>`<span class="tag" style="margin:0 4px 0 0">${esc(g)}</span>`).join('')}</td><td class="estrelas">${estrelas(l.nota)}</td>
      <td class="v">${dBR(l.inicio)}</td><td class="v">${l.fim?dBR(l.fim):l.status==='lido'&&l.ano?l.ano:''}</td><td class="v">${dias(l)??''}</td><td class="v">${l.paginas?fmtN0.format(l.paginas):''}</td></tr>`).join('')}
    <tr class="tot"><td colspan="8"><b>${lista.length} livro(s)</b></td><td class="v"><b>${fmtN0.format(sum(lista.map(l=>l.paginas||0)))}</b></td></tr>
  </tbody></table></div>`;
}

function htmlNumeros(){
  const L=lidos(), porAno={};
  for(const l of L){ const a=anoDe(l)||'Sem data'; (porAno[a] ??= {n:0,pg:0,notas:[]}); porAno[a].n++; porAno[a].pg+=l.paginas||0; if(l.nota!=null) porAno[a].notas.push(l.nota); }
  const anos=Object.keys(porAno).sort((a,b)=>a==='Sem data'?1:b==='Sem data'?-1:b-a);
  const maxN=Math.max(1,...anos.map(a=>porAno[a].n));
  const contar=(arr)=>{ const m={}; arr.forEach(x=>m[x]=(m[x]||0)+1); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const gen=contar(L.flatMap(l=>l.generos)).slice(0,10), aut=contar(L.map(l=>l.autor).filter(Boolean)).slice(0,10);
  const comDatas=L.filter(l=>dias(l)!=null&&dias(l)>0);
  const barras=(itens,max,fmt)=>`<div class="hbars">${itens.map(([k,v])=>`<div class="hbar"><span class="lbl" title="${esc(k)}">${esc(k)}</span><div class="track"><div class="fill" style="width:${v/max*100}%"></div></div><span class="val">${fmt(v)}</span></div>`).join('')}</div>`;
  return `<div class="grid g-2">
    <div class="panel"><h2>Por ano</h2>
      <div class="tbl-wrap" style="background:none;border:0;box-shadow:none"><table><thead><tr><th>Ano</th><th></th><th class="v">Livros</th><th class="v">Páginas</th><th class="v">Nota média</th></tr></thead><tbody>
      ${anos.map(a=>{ const x=porAno[a]; return `<tr><td><b>${a}</b></td><td style="width:40%"><div class="hbar" style="grid-template-columns:minmax(0,1fr)"><div class="track"><div class="fill" style="width:${x.n/maxN*100}%;background:var(--s3)"></div></div></div></td><td class="v">${x.n}</td><td class="v">${fmtN0.format(x.pg)}</td><td class="v">${x.notas.length?fmtN1.format(sum(x.notas)/x.notas.length):'–'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <span class="note">Antes de 2023, o ano vem do Skoob e nem todo livro tem data. Os sem data aparecem em "Sem data".</span></div>
    <div class="grid" style="align-content:start">
      <div class="panel"><h2>Ritmo</h2><div class="stat-row">
        <div class="stat"><span class="eyebrow">Dias por livro</span><b>${comDatas.length?fmtN0.format(Math.round(sum(comDatas.map(dias))/comDatas.length)):'–'}</b><span class="muted small">média de ${comDatas.length} com datas</span></div>
        <div class="stat"><span class="eyebrow">Páginas por dia</span><b>${comDatas.length?fmtN1.format(sum(comDatas.map(l=>l.paginas||0))/sum(comDatas.map(dias))):'–'}</b><span class="muted small">nos livros com datas</span></div>
        <div class="stat"><span class="eyebrow">Maior livro</span><b>${fmtN0.format(Math.max(0,...L.map(l=>l.paginas||0)))}</b><span class="muted small">${esc(L.reduce((m,l)=>(l.paginas||0)>(m?.paginas||0)?l:m,null)?.titulo||'')}</span></div>
      </div></div>
      <div class="panel"><h2>Gêneros mais lidos</h2>${gen.length?barras(gen,gen[0][1],v=>v):'<span class="muted">Sem gêneros cadastrados.</span>'}<span class="note">Só os livros que vieram do Notion têm gênero; complete na ficha quando quiser.</span></div>
      <div class="panel"><h2>Autores mais lidos</h2>${barras(aut,aut[0]?.[1]||1,v=>v)}</div>
    </div>
  </div>`;
}

/* ---------- Ficha do livro ---------- */
function abrirFicha(id){
  const l = id==null ? {id:null,titulo:'',autor:'',generos:[],paginas:null,status:'quero_ler',inicio:null,fim:null,nota:null,ano:null,capa:null,editora:'',isbn:'',anotacoes:'',citacoes:'',origem:'manual'} : P.livros.find(x=>x.id===id);
  if(!l){ fichaId=null; return; }
  fichaId=id;
  const d=$('pl-ficha'), opt=(v,t,sel)=>`<option value="${esc(v)}"${String(sel)===String(v)?' selected':''}>${esc(t)}</option>`;
  d.innerHTML=`<form method="dialog" class="ficha-in" id="pf-form">
    <div class="ficha-capa">${capa(l,'grande')}<button class="btn" type="button" id="pf-buscar">Buscar capa e dados</button><div id="pf-res" class="ficha-res"></div></div>
    <div class="ficha-campos">
      <div class="field"><label for="pf-titulo">Título</label><input type="text" id="pf-titulo" maxlength="300" required value="${esc(l.titulo)}"></div>
      <div class="form-row">
        <div class="field"><label for="pf-autor">Autor</label><input type="text" id="pf-autor" maxlength="200" value="${esc(l.autor)}"></div>
        <div class="field" style="flex:0 1 150px"><label for="pf-status">Status</label><select id="pf-status">${Object.entries(STATUS).map(([k,t])=>opt(k,t,l.status)).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="field" style="flex:0 1 150px"><label for="pf-ini">Início</label><input type="date" id="pf-ini" value="${l.inicio||''}"></div>
        <div class="field" style="flex:0 1 150px"><label for="pf-fim">Fim</label><input type="date" id="pf-fim" value="${l.fim||''}"></div>
        <div class="field" style="flex:0 1 110px"><label for="pf-ano">Ano (sem data)</label><input type="number" id="pf-ano" min="1990" max="2100" value="${l.fim?'':l.ano||''}" placeholder="—"></div>
        <div class="field" style="flex:0 1 110px"><label for="pf-pag">Páginas</label><input type="number" id="pf-pag" min="1" value="${l.paginas||''}"></div>
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
        <span class="muted small">${l.id?`Origem: ${{notion:'Notion',skoob:'Skoob',manual:'cadastro manual'}[l.origem]}${dias(l)!=null?` · ${dias(l)} dias de leitura`:''}`:''}</span>
        <div class="toolbar">${l.id?'<button class="btn" type="button" id="pf-excluir" style="color:var(--neg)">Excluir</button>':''}<button class="btn" type="button" id="pf-fechar">Fechar</button><button class="btn primary" type="submit">Salvar</button></div>
      </div>
    </div>
  </form>`;
  if(!d.open) d.showModal();
  const fechar=()=>{ fichaId=null; d.close(); };
  d.onclose=()=>{ fichaId=null; };
  $('pf-fechar').onclick=fechar;
  d.onclick=e=>{ if(e.target===d) fechar(); };
  $('pf-buscar').onclick=async()=>{
    const titulo=$('pf-titulo').value.trim(); if(!titulo){ toast('Escreva o título primeiro.'); return; }
    const box=$('pf-res'); box.innerHTML='<span class="muted small">Buscando…</span>';
    try{
      const r=await api.pesBuscarLivro(titulo, $('pf-autor').value.trim());
      box.innerHTML=r.length?r.map((x,i)=>`<button type="button" class="res" data-i="${i}" title="${esc(x.titulo)} · ${esc(x.autor)}${x.ano?' · '+x.ano:''}">${x.capa?`<img src="${esc(x.capa)}" alt="" referrerpolicy="no-referrer">`:'<span class="capa vazia"><span>sem capa</span></span>'}<span class="small">${esc(x.editora||x.autor||'')}</span></button>`).join(''):'<span class="muted small">Nada encontrado. Tente só o título.</span>';
      box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{ const x=r[+b.dataset.i];
        if(x.capa){ $('pf-capa').value=x.capa; d.querySelector('.ficha-capa .capa').outerHTML=`<img class="capa grande" src="${esc(x.capa)}" alt="" referrerpolicy="no-referrer">`; }
        if(!$('pf-autor').value&&x.autor) $('pf-autor').value=x.autor;
        if(!$('pf-pag').value&&x.paginas) $('pf-pag').value=x.paginas;
        if(!$('pf-ed').value&&x.editora) $('pf-ed').value=x.editora;
        if(!$('pf-isbn').value&&x.isbn) $('pf-isbn').value=x.isbn;
        toast('Dados aplicados. Confira e salve.'); });
    }catch(e){ box.innerHTML=''; toast(e?.message||String(e), true); }
  };
  if($('pf-excluir')) $('pf-excluir').onclick=()=>{ if(!confirm(`Excluir "${l.titulo}"? As anotações deste livro também serão apagadas.`)) return; fechar(); gravarPes(()=>api.pesExcluirLivro(l.id),'Livro excluído.'); };
  $('pf-form').onsubmit=e=>{ e.preventDefault();
    const ini=$('pf-ini').value||null, fim=$('pf-fim').value||null, st=$('pf-status').value;
    if(ini&&fim&&fim<ini){ toast('O fim não pode ser antes do início.'); return; }
    const pag=$('pf-pag').value?+$('pf-pag').value:null, anoSem=$('pf-ano').value?+$('pf-ano').value:null;
    const campos={ titulo:$('pf-titulo').value.trim(), autor:$('pf-autor').value.trim()||null,
      generos:[...new Set($('pf-gen').value.split(',').map(g=>g.trim()).filter(Boolean))].slice(0,10),
      paginas:pag&&pag>0?Math.round(pag):null, status:st, inicio:ini, fim:fim,
      nota:$('pf-nota').value?+$('pf-nota').value:null, ano_leitura:fim?+fim.slice(0,4):anoSem,
      capa_url:$('pf-capa').value||null, editora:$('pf-ed').value.trim()||null, isbn:$('pf-isbn').value.trim()||null,
      anotacoes:$('pf-notas').value||null, citacoes:$('pf-cit').value||null };
    if(!campos.titulo){ toast('Informe o título.'); return; }
    if(st==='lido'&&!fim&&!anoSem&&!confirm('Marcar como lido sem data de fim nem ano?')) return;
    fechar();
    gravarPes(()=>api.pesLivro(l.id, campos), l.id?'Livro salvo.':'Livro cadastrado.');
  };
}
