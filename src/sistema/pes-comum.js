// Peças compartilhadas pelas telas da área pessoal (agenda, leituras, treinos, metas e rotinas).

export const S = { api: null, toast: null, P: null, render: () => {} };

export const fmtN0 = new Intl.NumberFormat('pt-BR');
export const fmtN1 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
export const fmtP0 = new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:0});
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dBR = iso => iso ? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4) : '';
export const dCurta = iso => iso ? iso.slice(8,10)+'/'+iso.slice(5,7) : '';
export const sum = a => a.reduce((x,y)=>x+y,0);
export const $ = id => document.getElementById(id);
export const isoDe = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const hojeISO = () => isoDe(new Date());
export const dataDe = iso => new Date(+iso.slice(0,4), +iso.slice(5,7)-1, +iso.slice(8,10), 12);
export const addDias = (iso, n) => { const d=dataDe(iso); d.setDate(d.getDate()+n); return isoDe(d); };
export const diasEntre = (a, b) => Math.round((dataDe(b)-dataDe(a))/86400000);
export const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
export const SEM_CURTA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const diaPorExtenso = iso => { const d=dataDe(iso); return `${SEMANA[d.getDay()].toLowerCase()}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`; };
export const ler = (k,pad) => { try{ return localStorage.getItem(k) || pad; }catch{ return pad; } };
export const gravar = (k,v) => { try{ localStorage.setItem(k,v); }catch{} };
export const opt = (v,t,sel) => `<option value="${esc(v)}"${String(sel)===String(v)?' selected':''}>${esc(t)}</option>`;
export const svg = (d, cls='') => `<svg class="ico ${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONES = {
  livro:'<path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z"/>',
  agenda:'<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  treino:'<path d="M2 8h12M4 5.5v5M12 5.5v5M2 6.5v3M14 6.5v3"/>',
  metas:'<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><path d="M8 8l4.5-4.5"/>',
  cima:'<path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7"/>', baixo:'<path d="M8 3.5v9M4.5 9 8 12.5 11.5 9"/>',
  arrastar:'<path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke-width="2.2"/>',
  esq:'<path d="M10 3.5 5.5 8l4.5 4.5"/>', dir:'<path d="M6 3.5 10.5 8 6 12.5"/>',
  ok:'<path d="m3.5 8.5 3 3 6-7"/>', mais:'<path d="M8 3v10M3 8h10"/>',
};

// Capa do livro (ou um retângulo com o título quando não há imagem).
export const capa = (l, cls='') => l.capa
  ? `<img class="capa ${cls}" src="${esc(l.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<div class="capa vazia ${cls}"><span>${esc(l.titulo)}</span></div>`;

// Semanas (domingo a sábado) que cobrem o mês. Cada semana é uma lista de 7 datas ISO.
export function gradeMes(ano, mes){
  const ini=new Date(ano,mes,1,12), off=ini.getDay(), nDias=new Date(ano,mes+1,0).getDate();
  const semanas=[], total=Math.ceil((off+nDias)/7)*7;
  for(let i=0;i<total;i+=7) semanas.push(Array.from({length:7},(_,k)=>isoDe(new Date(ano,mes,1-off+i+k,12))));
  return semanas;
}
export const mesISO = iso => iso.slice(0,7);
export const mudarMes = (ym, n) => { const d=new Date(+ym.slice(0,4), +ym.slice(5,7)-1+n, 1, 12); return isoDe(d).slice(0,7); };
export const nomeMes = ym => `${MESES[+ym.slice(5,7)-1]} de ${ym.slice(0,4)}`;
// Cabeçalho de navegação de mês: ‹ Mês de Ano › Hoje
export const navMes = (prefixo, ym) => `<div class="cal-nav">
  <button class="icon-btn" type="button" data-${prefixo}-mes="-1" aria-label="Mês anterior">${svg(ICONES.esq)}</button>
  <b class="cal-titulo">${nomeMes(ym)}</b>
  <button class="icon-btn" type="button" data-${prefixo}-mes="1" aria-label="Próximo mês">${svg(ICONES.dir)}</button>
  ${ym!==hojeISO().slice(0,7)?`<button class="btn" type="button" data-${prefixo}-mes="0">Hoje</button>`:''}</div>`;

// Grava em fila (uma coisa de cada vez), recarrega os dados e redesenha as telas.
let filaGravacao = Promise.resolve();
export function gravarPes(fn, msg, depois){
  document.body.style.cursor='progress';
  filaGravacao=filaGravacao.then(async()=>{
    try{ const r=await fn(); S.P=await S.api.carregarPes(); S.render(); depois?.(r); if(msg) S.toast(msg); }
    catch(e){ S.toast(e?.message||String(e), true); try{ S.P=await S.api.carregarPes(); S.render(); }catch{} }
    finally{ document.body.style.cursor=''; }
  });
  return filaGravacao;
}

/* ---------- regras que mais de uma tela usa ---------- */
export const meta = (ano, area, ind) => S.P.metas.find(m=>m.ano===ano&&m.area===area&&m.indicador===ind) ?? null;
export const fracaoDoAno = ano => { const a=new Date(ano,0,1), b=new Date(ano+1,0,1), h=new Date(); return Math.max(0,Math.min(1,(h-a)/(b-a))); };

// Barra de progresso de meta com marca do "onde deveria estar hoje".
export function barraMeta(feito, alvo, rotulo, ano, {unidade='', fmt=fmtN0}={}){
  const passado=ano===new Date().getFullYear()?fracaoDoAno(ano):ano<new Date().getFullYear()?1:0;
  const pct=Math.min(1,feito/alvo), prev=passado>0.02?Math.round(feito/passado):null;
  const msg = feito>=alvo ? 'Meta batida!'
    : passado>=1 ? `Ficou em ${fmtP0.format(feito/alvo)} da meta.`
    : feito>=alvo*passado ? `No ritmo${prev!=null?`: a projeção é de ${fmt.format(prev)} até dezembro`:''}.`
    : `Faltam ${fmt.format(Math.ceil(alvo*passado-feito))} para estar no ritmo${prev!=null?` · projeção de ${fmt.format(prev)}`:''}.`;
  return `<div class="meta-linha"><div class="meta-rot"><b>${fmt.format(feito)}</b> de ${fmt.format(alvo)} ${esc(unidade||rotulo)}<span class="muted small">${fmtP0.format(feito/alvo)}</span></div>
    <div class="meta-barra"><div class="meta-feito" style="width:${pct*100}%"></div>${passado>0&&passado<1?`<span class="pace" style="left:${passado*100}%" title="Onde deveria estar hoje"></span>`:''}</div>
    <span class="small ${feito>=alvo*passado?'up':'muted'}">${msg}</span></div>`;
}

// Livros lidos (ou em leitura) num dia: precisa ter início; sem fim só vale se ainda está lendo.
export function livrosNoDia(dia){
  const hoje=hojeISO();
  return S.P.livros.filter(l=>{
    if(l.status==='lendo') return l.inicio && l.inicio<=dia && dia<=hoje;
    if(l.status==='lido') return l.fim && (l.inicio ? l.inicio<=dia && dia<=l.fim : dia===l.fim);
    return false;
  });
}

// Treinos: ciclo (Treino 1, 2, 3, 4...) e o próximo da vez.
export function cicloTreinos(){
  if(S.P.ciclo?.length) return S.P.ciclo;
  const tipos=[...new Set(S.P.treinos.map(t=>t.tipo))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  return tipos.length ? tipos.slice(0,8) : ['Treino 1','Treino 2','Treino 3','Treino 4'];
}
export function proximoTreino(){
  const c=cicloTreinos(), T=S.P.treinos, ult=T[T.length-1];
  const i=ult?c.indexOf(ult.tipo):-1;
  const numero=Math.max(0,...T.map(t=>t.numero||0))+1;
  return { tipo: c[(i+1)%c.length], numero: Math.max(numero, T.length+1) };
}
export const corTipo = tipo => { const i=cicloTreinos().indexOf(tipo); return i<0 ? 'var(--ink-3)' : `var(--s${i%4+1})`; };
export const siglaTipo = tipo => { const m=String(tipo).match(/(\d+)\s*$/); return m ? 'T'+m[1] : String(tipo).slice(0,3); };

// Rotinas: valem no dia da semana escolhido e só depois de criadas.
export const rotinasDoDia = dia => S.P.rotinas.filter(r=>r.ativa && r.dias.includes(dataDe(dia).getDay()) && (!r.criado || r.criado<=dia));
export const marcada = (rotina, dia) => S.P.marcas.some(m=>m.rotina===rotina&&m.data===dia);

// Caixa de diálogo única, criada sob demanda no fim da página.
export function dialogo(id, rotulo){
  let d=$(id);
  if(!d){ d=document.createElement('dialog'); d.id=id; d.className='ficha dlg-peq'; d.setAttribute('aria-label',rotulo); document.body.appendChild(d); }
  d.onclick=e=>{ if(e.target===d) d.close(); };
  return d;
}
