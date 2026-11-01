// Motor das telas, portado do protótipo aprovado (mesmo visual e mesmos cálculos).
// Cada tela é desenhada como HTML; todo texto vindo do banco passa por esc().
// As gravações vão para o banco por `api` (dados.ts); depois de cada uma, os dados
// são recarregados e as telas redesenhadas.

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const GRUPOS = ['Receita','Despesa','Investimento','Obra'];
const GCOLOR = {Receita:'var(--s1)',Despesa:'var(--s2)',Investimento:'var(--s3)',Obra:'var(--s4)'};
const TIPOS = {conta_corrente:'Conta corrente', investimento:'Investimento'};
const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmtN = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP = new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
const fmtP2 = new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2});
const R = v => fmtBRL.format(v);
const N = v => Math.abs(v) < 0.005 ? '–' : fmtN.format(v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dBR = iso => iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const compact = v => Math.abs(v) >= 1000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits: Math.abs(v)>=100000?0:1})+' mil' : v.toLocaleString('pt-BR',{maximumFractionDigits:0});
const sum = a => a.reduce((x,y)=>x+y,0);
const norm = s => String(s||'').trim().toLocaleLowerCase('pt-BR');
const hojeISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const $ = id => document.getElementById(id);

const VIEWS = [
  ['painel','Painel','<path d="M2 13h12M4 10v3m4-7v7m4-4v4"/>'],
  ['analises','Análises','<path d="M2.5 13.5 6 9l3 2.5 4.5-6"/><circle cx="13.5" cy="5.5" r="1"/>'],
  ['lancamentos','Lançamentos','<path d="M3 3h10v10H3zM3 6.5h10M6.5 6.5V13"/>'],
  ['dre','DRE','<path d="M3 4h10M3 8h10M3 12h6"/>'],
  ['orcamento','Orçamento','<circle cx="8" cy="8" r="5.5"/><path d="M8 8V2.5M8 8l4 3.5"/>'],
  ['conferencia','Conferência de saldos','<path d="m3 8.5 3 3 7-7"/>'],
  ['cadastros','Cadastros','<path d="M3 3.5h4v4H3zM9 3.5h4v4H9zM3 9.5h4v4H3zM9 11.5h4"/>'],
  ['virada','Virada de ano','<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5"/>'],
];

/* ---------- estado ---------- */
let api, D;
let YEAR, rows = [], budget = [], budgetProx = [], CATS = [], CONTAS = [], RECS = [], SALDO_INI = 0, FECHADO = false;
const dreOpen = new Set();
const lf = {q:'',m:'',g:''};
const sim = {total:1100000, inicio:null, fim:null, sobra:null, taxa:null, apto:null, aptoMes:null};
let cadGrupo = 'Despesa';
let confDate = null, confValores = null;
let editId = null;

function aplicar(d){
  const mudouAno = YEAR !== d.ano;
  D = d; YEAR = d.ano; rows = d.rows; budget = d.budget; budgetProx = d.budgetProx; CONTAS = d.contas; RECS = d.recebiveis;
  FECHADO = d.fechado; SALDO_INI = sum(d.saldoInicial.map(s=>s[1]));
  CATS = d.cats.map(c=>({...c, subs:[...c.subs]}));
  CATS.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')); CATS.forEach(c=>c.subs.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')));
  if(mudouAno){
    confDate = null; confValores = null; editId = null;
    Object.assign(sim,{inicio:`${YEAR+1}-01`, fim:`${YEAR+1}-12`, sobra:null, taxa:null, apto:null, aptoMes:null});
  }
  if(!confDate){ const h=hojeISO(); confDate = h.slice(0,4)==YEAR ? h : (+h.slice(0,4) > YEAR ? `${YEAR}-12-31` : `${YEAR}-01-31`); }
  if(!confValores){ confValores = {}; CONTAS.forEach(c=>confValores[c.id] = d.ultimaConf?.saldos[c.id] ?? 0); }
}

const catOf = (g,c) => CATS.find(x=>x.g===g && x.nome===c);
const usoCat = c => sum(c.subs.map(s=>s.uso));
const contaNome = c => c ? c.inst+' · '+c.nome : '—';

/* ---------- valores a receber (venda do apartamento) ---------- */
const recebido = r => sum(r.movs.filter(m=>m.tipo==='recebimento').map(m=>m.v));
const custoPago = r => sum(r.movs.filter(m=>m.tipo==='custo').map(m=>m.v));
const aReceber = r => r.contratado - r.recebidoAntes - recebido(r);
const custoAPagar = r => r.custoPrevisto - custoPago(r);
const liquidoAEntrar = r => aReceber(r) - custoAPagar(r);
const efeitoMov = m => m.tipo==='recebimento' ? m.v : -m.v;
const movsDoAno = () => RECS.flatMap(r=>r.movs).filter(m=>m.d.slice(0,4)==YEAR);
const pendentes = () => RECS.filter(r=>aReceber(r)>0.005 || custoAPagar(r)>0.005);

/* ---------- cálculos ---------- */
const mOf = r => +r.d.slice(5,7);
const lastDate = () => [...rows, ...movsDoAno()].reduce((m,r)=>r.d>m?r.d:m,'') || `${YEAR}-01-01`;
const nMeses = () => mOf({d:lastDate()});
const mesParcial = (d=lastDate()) => {
  return !['30','31'].includes(d.slice(8)) && !(d.slice(5,7)==='02'&&d.slice(8)>='28'); };
// Para médias: não conta meses futuros (lançamento agendado com data adiante).
const mesesCompletos = () => { const h=hojeISO(), d=lastDate(), ref=(h<d&&h.slice(0,4)==YEAR)?h:d; return Math.max(1, +ref.slice(5,7) - (mesParcial(ref)?1:0)); };
function byMonth(filter){ const a=Array(12).fill(0); rows.forEach(r=>{ if(filter(r)) a[mOf(r)-1]+=r.v; }); return a; }
function flows(){
  const rec=byMonth(r=>r.g==='Receita'), des=byMonth(r=>r.g==='Despesa'), inv=byMonth(r=>r.g==='Investimento'), obr=byMonth(r=>r.g==='Obra');
  const pat=Array(12).fill(0); movsDoAno().forEach(m=>{ pat[mOf(m)-1]+=efeitoMov(m); });
  const res=rec.map((v,i)=>v-des[i]);
  const varS=res.map((v,i)=>v-inv[i]-obr[i]+pat[i]);
  const saldo=[]; varS.reduce((acc,v,i)=>(saldo[i]=acc+v),SALDO_INI);
  return {rec,des,inv,obr,pat,res,varS,saldo};
}
// Mesma conta da função saldo_em do banco.
function saldoAte(iso){ return SALDO_INI + rows.reduce((a,r)=> r.d<=iso ? a + (r.g==='Receita'?r.v:-r.v) : a, 0)
  + movsDoAno().reduce((a,m)=> m.d<=iso ? a + efeitoMov(m) : a, 0); }
const supRows = () => rows.filter(r=>r.esup);
function realizado(b){ return sum(rows.filter(r=>r.g===b.g && (b.cid==null || r.c===b.c)).map(r=>r.v)); }
const supOf = b => b.sup ? sum(supRows().map(r=>r.v)) : 0;
function pace(){ const d=new Date(lastDate()+'T12:00:00'); const s=new Date(YEAR,0,1); return Math.min(1,(d-s)/86400000/365); }
function statusOf(pct,p){
  if(pct>1) return ['crit','Estourado','<path d="M8 4.5v4M8 11v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'];
  if(pct>p+0.03) return ['warn','Acima do ritmo','<path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'];
  return ['good','Dentro do ritmo','<path d="m4 8.5 2.5 2.5L12 5.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'];
}
const pillHTML = ([cls,label,icon]) => `<span class="pill ${cls}"><svg viewBox="0 0 16 16" aria-hidden="true">${icon}</svg>${label}</span>`;
const mesesLabels = nM => MESES.slice(0,nM).map((m,i)=>i===nM-1&&mesParcial()?m+'*':m);

/* ---------- gráficos ---------- */
function niceMax(m){ if(m<=0) return 1; const raw=m/4, p=Math.pow(10,Math.floor(Math.log10(raw))); for(const k of [1,2,2.5,5,10]) if(k*p*4>=m) return k*p*4; return 40*p; }
function topRound(x,y,w,h,r){ if(h<=0) return ''; r=Math.min(r,h,w/2); return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`; }
function gridY(l,W,r,y,max,ticks=4,fmt=compact,min=0){ let g='<g class="grid">'; for(let i=0;i<=ticks;i++){ const v=min+(max-min)*i/ticks; g+=`<line x1="${l}" x2="${W-r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l-8}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`; } return g+'</g>'; }
function groupedBars(series, n, labels){
  const W=760,H=250,l=58,r=8,t=10,b=26, iw=W-l-r, ih=H-t-b;
  const max=niceMax(Math.max(...series.flatMap(s=>s.values.slice(0,n))));
  const y=v=>t+ih-(v/max)*ih, gw=iw/n, bw=Math.min(18,(gw-12)/series.length-2);
  let bars='', hits='';
  for(let i=0;i<n;i++){
    const gx=l+gw*i+gw/2-(series.length*(bw+2)-2)/2;
    series.forEach((s,k)=>{ const v=s.values[i]; if(v>0) bars+=`<path d="${topRound(gx+k*(bw+2),y(v),bw,ih+t-y(v),4)}" fill="${s.color}"/>`; });
    bars+=`<text x="${l+gw*i+gw/2}" y="${H-8}" text-anchor="middle">${labels[i]}</text>`;
    const tip=`<b>${labels[i]}/${YEAR}</b>`+series.map(s=>`<br>${s.name}: <span class="num">${R(s.values[i])}</span>`).join('');
    hits+=`<rect x="${l+gw*i}" y="${t}" width="${gw}" height="${ih}" fill="transparent" data-tip="${esc(tip)}"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas efetivas por mês">${gridY(l,W,r,y,max)}<line class="axis" x1="${l}" x2="${W-r}" y1="${t+ih}" y2="${t+ih}"/>${bars}${hits}</svg>`;
}
function stackedBars(series, n, labels, aria){
  const W=760,H=260,l=58,r=8,t=10,b=26, iw=W-l-r, ih=H-t-b;
  const tot=[...Array(n)].map((_,i)=>sum(series.map(s=>Math.max(0,s.values[i]))));
  const max=niceMax(Math.max(...tot)); const y=v=>t+ih-(v/max)*ih, gw=iw/n, bw=Math.min(30,gw-14);
  let bars='',hits='';
  for(let i=0;i<n;i++){ let acc=0; const x=l+gw*i+(gw-bw)/2; const segs=series.filter(s=>s.values[i]>0);
    segs.forEach((s,k)=>{ const v=s.values[i]; const y0=y(acc), y1=y(acc+v); const top=k===segs.length-1; const h=Math.max(0,y0-y1-(k?2:0));
      bars+= top ? `<path d="${topRound(x,y1,bw,h,4)}" fill="${s.color}"/>` : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${s.color}"/>`; acc+=v; });
    bars+=`<text x="${l+gw*i+gw/2}" y="${H-8}" text-anchor="middle">${labels[i]}</text>`;
    hits+=`<rect x="${l+gw*i}" y="${t}" width="${gw}" height="${ih}" fill="transparent" data-tip="${esc(`<b>${labels[i]}/${YEAR}</b>`+series.map(s=>`<br>${s.name}: <span class=num>${R(s.values[i])}</span>`).join('')+`<br><b>Total: <span class=num>${R(tot[i])}</span></b>`)}"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${gridY(l,W,r,y,max)}<line class="axis" x1="${l}" x2="${W-r}" y1="${t+ih}" y2="${t+ih}"/>${bars}${hits}</svg>`;
}
function lineChart(points, labels, o={}){
  if(points.length<2) return '<span class="muted small">Ainda não há meses suficientes para o gráfico.</span>';
  const W=o.W||420,H=o.H||250,l=o.l||52,r=o.r||54,t=14,b=26, iw=W-l-r, ih=H-t-b;
  let lo=Math.min(...points,o.floor??Infinity), hi=Math.max(...points);
  if(o.zero) lo=Math.min(lo,0);
  const step=niceMax(hi-lo||1)/4, mn=Math.floor(lo/step)*step, mx=mn+step*Math.max(1,Math.ceil((hi-mn)/step));
  const x=i=>l+iw*i/(points.length-1), y=v=>t+ih-(v-mn)/(mx-mn)*ih;
  const fmt=o.fmt||compact;
  let g='<g class="grid">'; for(let v=mn; v<=mx+step/2; v+=step){ g+=`<line x1="${l}" x2="${W-r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l-8}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`; } g+='</g>';
  const d=points.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(v).toFixed(1)).join('');
  const base=o.zero&&mn<0?y(0):t+ih;
  const area=d+`L${x(points.length-1)},${base}L${x(0)},${base}Z`;
  const every=Math.ceil(labels.length/(o.maxLabels||14));
  const xl=labels.map((s,i)=>i%every===0||i===labels.length-1?`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${s}</text>`:'').join('');
  const li=points.length-1;
  const zeroLine=o.zero&&mn<0?`<line x1="${l}" x2="${W-r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--crit)" stroke-width="1.5" stroke-dasharray="4 3"/>`:'';
  const avg=o.avg!=null?`<line x1="${l}" x2="${W-r}" y1="${y(o.avg)}" y2="${y(o.avg)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${W-r+6}" y="${y(o.avg)+4}" style="fill:var(--ink-2)">média</text>`:'';
  let hits=''; const w=iw/(points.length-1);
  points.forEach((v,i)=>{ hits+=`<rect x="${x(i)-w/2}" y="${t}" width="${w}" height="${ih}" fill="transparent" data-px="${x(i)}" data-py="${y(v)}" data-tip="${esc(`<b>${(o.tipLabels||labels)[i]}</b><br><span class="num">${(o.tipFmt||R)(v)}</span>`)}"/>`; });
  const color=o.color||'var(--s1)';
  return `<svg class="chart lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria||'Gráfico de linha')}">${g}${zeroLine}${avg}
    <path d="${area}" fill="${color}" opacity=".10"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <line class="xh" x1="0" x2="0" y1="${t}" y2="${t+ih}" stroke="var(--ink-3)" stroke-dasharray="3 3" visibility="hidden"/>
    <circle class="xd" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
    <circle cx="${x(li)}" cy="${y(points[li])}" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
    <text x="${x(li)+8}" y="${y(points[li])+4}" style="fill:var(--ink);font-weight:600">${fmt(points[li])}</text>
    ${xl}${hits}</svg>`;
}
function wireLines(root){
  root.querySelectorAll('svg.lc').forEach(svg=>{ const xh=svg.querySelector('.xh'), xd=svg.querySelector('.xd');
    svg.querySelectorAll('rect[data-px]').forEach(rc=>{
      rc.addEventListener('mouseenter',()=>{ const px=rc.dataset.px, py=rc.dataset.py; xh.setAttribute('x1',px); xh.setAttribute('x2',px); xh.setAttribute('visibility','visible'); xd.setAttribute('cx',px); xd.setAttribute('cy',py); xd.setAttribute('visibility','visible'); });
      rc.addEventListener('mouseleave',()=>{ xh.setAttribute('visibility','hidden'); xd.setAttribute('visibility','hidden'); });
    }); });
}

/* ---------- avisos ---------- */
function ultimoBackup(){ try{ return localStorage.getItem('ultimoBackup'); }catch{ return null; } }
function renderAvisos(){
  const av=[];
  if(FECHADO) av.push(`<b>Exercício ${YEAR} fechado.</b><span>Só consulta. Para corrigir algo, reabra em <a href="#virada" class="linkbtn">Virada de ano</a>.</span>`);
  if(!D.saldoInicial.length) av.push(`<b>Atenção.</b><span>${YEAR} está sem saldo inicial.</span>`);
  if(D.saldoFinalAnterior!=null && D.saldoInicial.length && Math.abs(D.saldoFinalAnterior-SALDO_INI)>0.005)
    av.push(`<b>Atenção.</b><span>O saldo inicial de ${YEAR} (${R(SALDO_INI)}) é diferente do saldo final de ${YEAR-1} (${R(D.saldoFinalAnterior)}). Houve alteração em ${YEAR-1} depois da abertura: feche ${YEAR-1} de novo para atualizar.</span>`);
  const ub=ultimoBackup(); const dias=ub?Math.floor((Date.now()-new Date(ub).getTime())/86400000):null;
  if(dias==null||dias>=7) av.push(`<b>Backup.</b><span>${dias==null?'Você ainda não baixou nenhum backup neste computador.':`Último backup há ${dias} dias.`} Use "Baixar backup" e salve no OneDrive.</span>`);
  $('avisos').innerHTML=av.map(a=>`<div class="banner" role="note">${a}</div>`).join('');
  $('ub').textContent='Último backup: '+(ub?new Date(ub).toLocaleDateString('pt-BR'):'nunca');
}

/* ---------- Painel ---------- */
function renderPainel(){
  const f=flows(), ld=lastDate(), nM=nMeses();
  const rec=sum(f.rec), des=sum(f.des), inv=sum(f.inv), obr=sum(f.obr), res=rec-des, saldo=SALDO_INI+rec-des-inv-obr+sum(f.pat);
  const p=pace();
  const desCat={}; rows.filter(r=>r.g==='Despesa').forEach(r=>desCat[r.c]=(desCat[r.c]||0)+r.v);
  const topCat=Object.entries(desCat).sort((a,b)=>b[1]-a[1]);
  const maxC=topCat[0]?.[1]||1;
  const obraB=budget.find(b=>b.g==='Obra'), obraCat={}; rows.filter(r=>r.g==='Obra').forEach(r=>obraCat[r.c]=(obraCat[r.c]||0)+r.v);
  const orcRows=budget.filter(b=>b.g!=='Obra').map(b=>{ const tot=b.b+supOf(b), re=realizado(b); return {...b,tot,re,pct:tot?re/tot:0}; }).sort((a,b)=>b.pct-a.pct).slice(0,6);
  const labels=mesesLabels(nM);
  const pend=pendentes();
  $('v-painel').innerHTML=`
  <div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Painel</h1><p>Posição em ${dBR(ld)} · ${fmtP.format(p)} do ano decorrido</p></div><a class="btn" href="#analises">Ver análises</a></div>
    <div class="grid g-kpi">
      <div class="panel kpi"><span class="eyebrow">Saldo atual</span><span class="big">${R(saldo)}</span><span class="sub"><span class="${saldo>=SALDO_INI?'up':'down'}">${saldo>=SALDO_INI?'+':''}${R(saldo-SALDO_INI)}</span> desde 01/01</span></div>
      <div class="panel kpi"><span class="eyebrow">Receitas no ano</span><span class="big">${R(rec)}</span><span class="sub">Média de ${R(rec/nM)} por mês</span></div>
      <div class="panel kpi"><span class="eyebrow">Despesas efetivas</span><span class="big">${R(des)}</span><span class="sub">Sem investimentos e obra</span></div>
      <div class="panel kpi"><span class="eyebrow">Sobra do consumo</span><span class="big">${R(res)}</span><span class="sub">${rec?fmtP.format(res/rec):'–'} das receitas</span></div>
    </div>
    <div class="grid g-2">
      <div class="panel"><div class="panel-h"><h2>Receitas x despesas efetivas</h2><div class="legend"><span><i style="background:var(--s1)"></i>Receitas</span><span><i style="background:var(--s2)"></i>Despesas efetivas</span></div></div>
        ${groupedBars([{name:'Receitas',color:'var(--s1)',values:f.rec},{name:'Despesas efetivas',color:'var(--s2)',values:f.des}], nM, labels)}
        ${mesParcial()?`<span class="muted small">* ${MESES[nM-1]} parcial (lançamentos até ${dBR(ld)})</span>`:''}</div>
      <div class="panel"><div class="panel-h"><h2>Onde foi o dinheiro</h2><span class="muted small">Despesas efetivas por categoria</span></div>
        <div class="hbars">${topCat.slice(0,9).map(([c,v])=>`<div class="hbar" data-tip="${esc(`<b>${esc(c)}</b><br><span class=num>${R(v)}</span> · ${fmtP.format(v/des)} das despesas`)}"><span class="lbl">${esc(c)}</span><div class="track"><div class="fill" style="width:${Math.max(0,v/maxC*100)}%"></div></div><span class="val">${N(v)}</span></div>`).join('') || '<span class="muted small">Sem despesas lançadas.</span>'}</div>
        ${topCat.length>9?`<span class="muted small">+ ${topCat.length-9} categorias menores somando ${R(sum(topCat.slice(9).map(x=>x[1])))}</span>`:''}</div>
    </div>
    <div class="grid g-3">
      <div class="panel"><div class="panel-h"><h2>Evolução do saldo</h2></div>
        ${lineChart([SALDO_INI,...f.saldo.slice(0,nM)],['Ini',...MESES.slice(0,nM)],{aria:'Evolução do saldo',tipLabels:['Saldo inicial',...MESES.slice(0,nM).map(m=>'Fim de '+m)]})}</div>
      <div class="panel"><div class="panel-h"><h2>Orçamento: maior consumo</h2><a href="#orcamento" class="small" style="color:var(--s1);font-weight:650">Ver tudo</a></div>
        <div class="hbars">${orcRows.map(o=>{ const st=statusOf(o.pct,p); return `<div class="hbar" data-tip="${esc(`<b>${esc(o.c)}</b><br>Realizado <span class=num>${R(o.re)}</span><br>Orçado <span class=num>${R(o.tot)}</span><br>${st[1]} (ritmo do ano: ${fmtP.format(p)})`)}"><span class="lbl">${esc(o.c)}</span><div class="track"><div class="fill" style="width:${Math.min(100,o.pct*100)}%;background:var(--${st[0]==='good'?'s1':st[0]==='warn'?'warn':'crit'})"></div><span class="pace" style="left:${p*100}%"></span></div><span class="val">${fmtP.format(o.pct)}</span></div>`; }).join('')}</div>
        <span class="muted small">A marca vertical é o ritmo do ano (${fmtP.format(p)}).</span></div>
      <div class="panel"><div class="panel-h"><h2>Obra</h2><span class="muted small">Saída de investimento</span></div>
        <div class="kpi" style="padding:0"><span class="big">${R(obr)}</span><span class="sub">${obraB&&obraB.b?`de ${R(obraB.b)} orçados para ${YEAR} · ${fmtP.format(obr/obraB.b)}`:'Sem orçamento de obra para o ano'}</span></div>
        <div class="hbars">${Object.entries(obraCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="hbar"><span class="lbl">${esc(c)}</span><div class="track"><div class="fill" style="width:${obr?v/obr*100:0}%;background:var(--s4)"></div></div><span class="val">${N(v)}</span></div>`).join('')}</div>
        <div class="note">${pend.map(r=>`${esc(r.descricao)}: falta receber <b class="num">${R(aReceber(r))}</b> até ${dBR(r.vencimento)}; líquido a entrar <b class="num">${R(liquidoAEntrar(r))}</b> · <a href="#conferencia" class="linkbtn">Registrar recebimento</a><br>`).join('')}Investimentos (poupança da filha): <b class="num">${R(inv)}</b></div></div>
    </div>
  </div>`;
  wireLines($('v-painel'));
}

/* ---------- Análises ---------- */
function analytics(){
  const f=flows(), nC=mesesCompletos();
  const rend=byMonth(r=>r.g==='Receita'&&r.c==='Rendimentos');
  const saldoIni=[SALDO_INI,...f.saldo.slice(0,11)];
  const taxaM=rend.map((v,i)=>saldoIni[i]?v/saldoIni[i]:0);
  const taxaMedia=sum(taxaM.slice(0,nC))/nC;
  const sobraSemRend=[...Array(nC)].map((_,i)=>f.rec[i]-rend[i]-f.des[i]-f.inv[i]);
  return {f,nC,rend,saldoIni,taxaM,taxaMedia,sobraMedia:sum(sobraSemRend)/nC,custoMedio:sum(f.des.slice(0,nC))/nC};
}
function waterfall(items){
  const W=760,H=290,l=58,r=8,t=22,b=44, iw=W-l-r, ih=H-t-b;
  let cum=0; const bars=items.map(it=>{ let y0,y1; if(it.type==='total'){ y0=0;y1=it.v;cum=it.v; } else if(it.type==='sub'){ y0=0;y1=cum; it.v=cum; } else { y0=cum;y1=cum+it.v;cum+=it.v; } return {...it,y0,y1}; });
  const max=niceMax(Math.max(...bars.map(b=>Math.max(b.y0,b.y1)))); const y=v=>t+ih-(v/max)*ih;
  const gw=iw/bars.length, bw=Math.min(44,gw-12);
  let out='';
  bars.forEach((b,i)=>{ const x=l+gw*i+(gw-bw)/2, top=y(Math.max(b.y0,b.y1)), h=Math.abs(y(b.y0)-y(b.y1));
    const color=b.type==='down'?'var(--s2)':(b.type==='total'||b.type==='up')?'var(--s1)':'var(--ink)';
    out+=`<rect x="${x}" y="${top}" width="${bw}" height="${Math.max(1,h)}" rx="4" fill="${color}" ${b.type==='sub'?'opacity=".82"':''}/>`;
    if(i<bars.length-1){ const ly=y(b.type==='down'?b.y1:Math.max(b.y0,b.y1)); out+=`<line x1="${x+bw}" x2="${l+gw*(i+1)+(gw-bw)/2}" y1="${ly}" y2="${ly}" stroke="var(--ink-3)" stroke-dasharray="2 2"/>`; }
    out+=`<text x="${x+bw/2}" y="${top-6}" text-anchor="middle" style="fill:var(--ink-2)">${b.type==='down'?'−':''}${compact(Math.abs(b.v))}</text>`;
    const words=b.label.split(' '); const l1=words.slice(0,Math.ceil(words.length/2)).join(' '), l2=words.slice(Math.ceil(words.length/2)).join(' ');
    out+=`<text x="${x+bw/2}" y="${H-26}" text-anchor="middle">${esc(l1)}</text>${l2?`<text x="${x+bw/2}" y="${H-13}" text-anchor="middle">${esc(l2)}</text>`:''}`;
    out+=`<rect x="${l+gw*i}" y="${t}" width="${gw}" height="${ih}" fill="transparent" data-tip="${esc(`<b>${esc(b.label)}</b><br><span class=num>${R(b.v)}</span>`)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cascata do resultado do ano">${gridY(l,W,r,y,max)}<line class="axis" x1="${l}" x2="${W-r}" y1="${t+ih}" y2="${t+ih}"/>${out}</svg>`;
}
function projecao(a){
  const ld=lastDate(); const saldo0=a.f.saldo[nMeses()-1];
  const gasto=sum(rows.filter(r=>r.g==='Obra').map(r=>r.v));
  const restante=Math.max(0,sim.total-gasto);
  const start=new Date(+ld.slice(0,4), +ld.slice(5,7)-1, 1);
  const toIdx=s=>{ const [yy,mm]=s.split('-').map(Number); return (yy-start.getFullYear())*12+(mm-1-start.getMonth()); };
  const iIni=Math.max(1,toIdx(sim.inicio)), iFim=Math.max(iIni,toIdx(sim.fim)), iApto=sim.aptoMes?Math.max(1,toIdx(sim.aptoMes)):-1;
  const meses=iFim-iIni+1, porMes=restante/meses;
  const pts=[saldo0], labs=[MESES[start.getMonth()]+'/'+String(start.getFullYear()).slice(2)];
  let s=saldo0, minV=s, minL=labs[0];
  for(let i=1;i<=Math.max(iFim,13);i++){ const dt=new Date(start.getFullYear(),start.getMonth()+i,1);
    s = s*(1+sim.taxa) + sim.sobra - (i>=iIni&&i<=iFim?porMes:0) + (i===iApto?sim.apto:0);
    pts.push(s); const lb=MESES[dt.getMonth()]+'/'+String(dt.getFullYear()).slice(2); labs.push(lb); if(s<minV){minV=s;minL=lb;} }
  return {pts,labs,gasto,restante,porMes,meses,minV,minL,fim:pts[pts.length-1]};
}
function renderAnalises(){
  const a=analytics(), f=a.f, nM=nMeses(), nC=a.nC;
  if(sim.sobra==null) sim.sobra=Math.round(a.sobraMedia);
  if(sim.taxa==null) sim.taxa=Math.round(a.taxaMedia*10000)/10000;
  if(sim.apto==null){ const p=pendentes(); sim.apto=Math.round(sum(p.map(liquidoAEntrar))*100)/100; sim.aptoMes=p[0]?p[0].vencimento.slice(0,7):`${YEAR}-12`; }
  const rec=sum(f.rec), inv=sum(f.inv), obr=sum(f.obr), pat=sum(f.pat);
  const saldo=f.saldo[nM-1];
  const desCat={}; rows.filter(r=>r.g==='Despesa').forEach(r=>desCat[r.c]=(desCat[r.c]||0)+r.v);
  const dc=Object.entries(desCat).sort((x,y)=>y[1]-x[1]);
  const items=[{label:'Receitas',v:rec,type:'total'},...dc.slice(0,6).map(([c,v])=>({label:c,v:-v,type:'down'})),{label:'Demais despesas',v:-sum(dc.slice(6).map(x=>x[1])),type:'down'},{label:'Resultado',type:'sub'},{label:'Investimentos',v:-inv,type:'down'},{label:'Obra',v:-obr,type:'down'},...(pat?[{label:'Venda do apartamento',v:pat,type:pat>0?'up':'down'}]:[]),{label:'Variação do saldo',type:'sub'}];
  const comp=[['Salário','var(--s1)'],['Diárias','var(--s2)'],['Rendimentos','var(--s3)'],['Diversas','var(--s4)']].map(([c,color])=>({name:c,color,values:byMonth(r=>r.g==='Receita'&&r.c===c)}));
  const labels=mesesLabels(nM);
  const tp=f.rec.slice(0,nC).map((v,i)=>v?f.res[i]/v:0); const recC=sum(f.rec.slice(0,nC)); const tpMed=recC?sum(f.res.slice(0,nC))/recC:0;
  const cats=[...new Set(rows.filter(r=>r.g==='Despesa').map(r=>r.c))].map(c=>({c,arr:byMonth(r=>r.g==='Despesa'&&r.c===c)})).sort((x,y)=>sum(y.arr)-sum(x.arr));
  const heatColor=(v,max)=>{ if(v<=0.005) return 'var(--surface-2)'; const q=v/max; return q>.8?'var(--h5)':q>.6?'var(--h4)':q>.4?'var(--h3)':q>.2?'var(--h2)':'var(--h1)'; };
  const subMap={}; rows.filter(r=>r.g==='Despesa'&&mOf(r)<=nC).forEach(r=>{ const k=r.c+' · '+r.s; (subMap[k]=subMap[k]||{k,m:new Set(),t:0}); subMap[k].m.add(mOf(r)); subMap[k].t+=r.v; });
  const fixos=Object.values(subMap).filter(x=>x.m.size>=Math.ceil(nC*0.7)&&x.t>0).sort((x,y)=>y.t-x.t);
  const fixoMes=sum(fixos.map(x=>x.t))/nC;
  const maiores=rows.filter(r=>r.g!=='Receita').sort((x,y)=>y.v-x.v).slice(0,10);
  const rendBars=a.rend.slice(0,nM);
  const anual=Math.pow(1+a.taxaMedia,12)-1;
  const pj=projecao(a);
  const pjStatus = pj.minV<0 ? ['crit','Saldo fica negativo','<path d="M8 4.5v4M8 11v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'] : pj.minV < a.custoMedio*6 ? ['warn','Reserva abaixo de 6 meses','<path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'] : ['good','Saldo cobre a obra','<path d="m4 8.5 2.5 2.5L12 5.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'];
  const rmax=niceMax(Math.max(...rendBars));
  $('v-analises').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Análises</h1><p>Visões complementares do ano. Meses completos considerados nas médias: ${nC} (${MESES[0]}–${MESES[nC-1]}).</p></div></div>
    <div class="grid g-kpi">
      <div class="panel kpi"><span class="eyebrow">Custo de vida médio</span><span class="big">${R(a.custoMedio)}</span><span class="sub">Despesas efetivas por mês</span></div>
      <div class="panel kpi"><span class="eyebrow">Taxa de poupança</span><span class="big">${fmtP.format(tpMed)}</span><span class="sub">Do que entra, quanto sobra do consumo</span></div>
      <div class="panel kpi"><span class="eyebrow">Rendimento médio</span><span class="big">${fmtP2.format(a.taxaMedia)} a.m.</span><span class="sub">≈ ${fmtP.format(anual)} ao ano sobre o saldo</span></div>
      <div class="panel kpi"><span class="eyebrow">Reserva</span><span class="big">${a.custoMedio?(saldo/a.custoMedio).toLocaleString('pt-BR',{maximumFractionDigits:0}):'–'} meses</span><span class="sub">O saldo atual cobre esse tempo de custo de vida</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Obra x saldo: projeção até ${pj.labs[pj.labs.length-1]}</h2>${pillHTML(pjStatus)}</div>
      <div class="sim-grid">
        <div class="field"><label for="sm-total">Custo total da obra (R$)</label><input type="text" class="money" id="sm-total" value="${N(sim.total)}"></div>
        <div class="field"><label for="sm-ini">Início dos pagamentos</label><input type="text" id="sm-ini" value="${sim.inicio}" placeholder="aaaa-mm"></div>
        <div class="field"><label for="sm-fim">Término</label><input type="text" id="sm-fim" value="${sim.fim}" placeholder="aaaa-mm"></div>
        <div class="field"><label for="sm-sobra">Sobra mensal sem rendimentos (R$)</label><input type="text" class="money" id="sm-sobra" value="${N(sim.sobra)}"></div>
        <div class="field"><label for="sm-taxa">Rendimento do saldo (% a.m.)</label><input type="text" class="money" id="sm-taxa" value="${(sim.taxa*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></div>
        <div class="field"><label for="sm-apto">Apartamento: a entrar, líquido (R$)</label><input type="text" class="money" id="sm-apto" value="${N(sim.apto)}"></div>
        <div class="field"><label for="sm-apmes">Mês da entrada</label><input type="text" id="sm-apmes" value="${sim.aptoMes}" placeholder="aaaa-mm"></div>
      </div>
      <div class="grid g-2" style="align-items:start">
        ${lineChart(pj.pts,pj.labs,{W:760,H:260,l:62,r:70,zero:true,aria:'Projeção do saldo com a obra',maxLabels:16})}
        <div class="stat-row" style="grid-template-columns:minmax(0,1fr)">
          <div class="stat"><span class="eyebrow">Obra já paga em ${YEAR}</span><b>${R(pj.gasto)}</b></div>
          <div class="stat"><span class="eyebrow">Falta pagar</span><b>${R(pj.restante)}</b><span class="muted small">${R(pj.porMes)} por mês, em ${pj.meses} meses</span></div>
          <div class="stat"><span class="eyebrow">Menor saldo projetado</span><b class="${pj.minV<0?'down':''}">${R(pj.minV)}</b><span class="muted small">em ${pj.minL}</span></div>
        </div>
      </div>
      <div class="note">Como funciona: a cada mês, saldo × (1 + rendimento) + sobra − parcela da obra; no mês indicado, entra o que falta do apartamento já descontada a corretagem. Os valores sugeridos vêm das suas médias de ${MESES[0]} a ${MESES[nC-1]}; altere qualquer campo para simular (nada é gravado). O rendimento cai sozinho à medida que o saldo é usado na obra.</div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Cascata do resultado de ${YEAR}</h2><div class="legend"><span><i style="background:var(--s1)"></i>Entradas</span><span><i style="background:var(--s2)"></i>Saídas</span><span><i style="background:var(--ink)"></i>Subtotais</span></div></div>
      ${waterfall(items)}</div>

    <div class="grid g-2">
      <div class="panel"><div class="panel-h"><h2>De onde vem o dinheiro</h2><div class="legend">${comp.map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div></div>
        ${stackedBars(comp,nM,labels,'Composição das receitas por mês')}</div>
      <div class="panel"><div class="panel-h"><h2>Taxa de poupança por mês</h2></div>
        ${lineChart(tp,MESES.slice(0,nC),{aria:'Taxa de poupança mensal',fmt:v=>fmtP.format(v),tipFmt:v=>fmtP.format(v),avg:tpMed,floor:0})}
        <span class="muted small">Resultado ÷ receitas. Linha tracejada: média do período.</span></div>
    </div>

    <div class="grid g-2">
      <div class="panel"><div class="panel-h"><h2>Rendimento das aplicações</h2><span class="muted small">R$ no mês e % sobre o saldo do início do mês</span></div>
        <svg class="chart" viewBox="0 0 760 240" role="img" aria-label="Rendimentos mensais">
          ${(()=>{ const W=760,H=240,l=58,r=8,t=22,b=26,iw=W-l-r,ih=H-t-b,y=v=>t+ih-(v/rmax)*ih,gw=iw/nM,bw=Math.min(30,gw-16); let s=gridY(l,W,r,y,rmax);
            rendBars.forEach((v,i)=>{ const x=l+gw*i+(gw-bw)/2; s+=`<path d="${topRound(x,y(v),bw,t+ih-y(v),4)}" fill="var(--s3)"/><text x="${x+bw/2}" y="${y(v)-6}" text-anchor="middle" style="fill:var(--ink-2)">${(a.taxaM[i]*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</text><text x="${x+bw/2}" y="${H-8}" text-anchor="middle">${labels[i]}</text><rect x="${l+gw*i}" y="${t}" width="${gw}" height="${ih}" fill="transparent" data-tip="${esc(`<b>${MESES[i]}</b><br>Rendimento <span class=num>${R(v)}</span><br>Saldo no início do mês <span class=num>${R(a.saldoIni[i])}</span><br>${fmtP2.format(a.taxaM[i])} no mês`)}"/>`; });
            return s+`<line class="axis" x1="${l}" x2="${W-r}" y1="${t+ih}" y2="${t+ih}"/>`; })()}
        </svg></div>
      <div class="panel"><div class="panel-h"><h2>Custos fixos do mês a mês</h2><span class="muted small">Presentes em pelo menos ${Math.ceil(nC*0.7)} de ${nC} meses</span></div>
        <div class="stat"><span class="eyebrow">Custo fixo estimado</span><b>${R(fixoMes)} por mês</b><span class="muted small">${a.custoMedio?fmtP.format(fixoMes/a.custoMedio):'–'} do custo de vida médio</span></div>
        <div class="tbl-wrap" style="box-shadow:none;background:transparent;border:0"><table><thead><tr><th>Subcategoria</th><th class="v">Meses</th><th class="v">Média mensal</th></tr></thead><tbody>
          ${fixos.slice(0,10).map(x=>`<tr><td>${esc(x.k)}</td><td class="v">${x.m.size}/${nC}</td><td class="v">${N(x.t/nC)}</td></tr>`).join('')}
        </tbody></table></div></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Mapa de calor: categoria x mês</h2><span class="muted small">A cor é relativa ao maior mês de cada categoria</span></div>
      <div style="overflow-x:auto"><table class="heat"><thead><tr><th></th>${MESES.slice(0,nM).map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead><tbody>
        ${cats.map(({c,arr})=>{ const mx=Math.max(...arr.slice(0,nM)); return `<tr><td class="lab">${esc(c)}</td>${arr.slice(0,nM).map((v,i)=>`<td class="cell" style="background:${heatColor(v,mx)}" data-tip="${esc(`<b>${esc(c)} · ${MESES[i]}</b><br><span class=num>${R(v)}</span>`)}"></td>`).join('')}<td class="lab num" style="text-align:right;padding-left:8px">${N(sum(arr))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="legend"><span>Menor</span>${['--h1','--h2','--h3','--h4','--h5'].map(h=>`<i style="background:var(${h});width:18px;border-radius:3px;margin:0"></i>`).join('')}<span>Maior</span></div></div>

    <div class="panel"><div class="panel-h"><h2>Maiores saídas do ano</h2></div>
      <div class="tbl-wrap" style="box-shadow:none;background:transparent;border:0"><table><thead><tr><th>Data</th><th>Grupo</th><th>Categoria</th><th>Descrição</th><th class="v">Valor</th></tr></thead><tbody>
        ${maiores.map(r=>`<tr><td class="num">${dBR(r.d)}</td><td><span class="chip"><i style="background:${GCOLOR[r.g]}"></i>${r.g}</span></td><td>${esc(r.c)} · ${esc(r.s)}</td><td>${esc(r.desc)}</td><td class="v">${N(r.v)}</td></tr>`).join('')}
      </tbody></table></div></div>
  </div>`;
  const v=$('v-analises'); wireLines(v);
  const bind=(id,fn)=>{ const el=v.querySelector('#'+id); el.onchange=()=>{ fn(el.value); renderAnalises(); }; };
  bind('sm-total',x=>{ const n=parseMoney(x); if(!isNaN(n)) sim.total=n; });
  bind('sm-ini',x=>{ if(/^\d{4}-\d{2}$/.test(x)) sim.inicio=x; });
  bind('sm-fim',x=>{ if(/^\d{4}-\d{2}$/.test(x)) sim.fim=x; });
  bind('sm-sobra',x=>{ const n=parseMoney(x); if(!isNaN(n)) sim.sobra=n; });
  bind('sm-taxa',x=>{ const n=parseMoney(x); if(!isNaN(n)) sim.taxa=n/100; });
  bind('sm-apto',x=>{ const n=parseMoney(x); if(!isNaN(n)) sim.apto=n; });
  bind('sm-apmes',x=>{ if(/^\d{4}-\d{2}$/.test(x)) sim.aptoMes=x; });
}

/* ---------- Lançamentos ---------- */
function fillCatSelects(atual){
  const g=$('n-g').value;
  const cats=CATS.filter(c=>c.g===g&&(c.ativa||(atual&&c.nome===atual.c&&g===atual.g)));
  const keep=atual&&g===atual.g?atual.c:$('n-c').value;
  $('n-c').innerHTML=cats.map(c=>`<option value="${esc(c.nome)}">${esc(c.nome)}${c.ativa?'':' (inativa)'}</option>`).join('');
  if(cats.some(c=>c.nome===keep)) $('n-c').value=keep;
  fillSubSelect(atual);
}
function fillSubSelect(atual){
  const k=catOf($('n-g').value,$('n-c').value);
  const mesma=atual&&k&&atual.g===k.g&&atual.c===k.nome;
  const subs=k?k.subs.filter(s=>s.ativa||(mesma&&s.nome===atual.s)):[];
  const keep=mesma?atual.s:$('n-s').value;
  $('n-s').innerHTML=subs.map(s=>`<option value="${s.id}">${esc(s.nome)}${s.ativa?'':' (inativa)'}</option>`).join('');
  const sel=subs.find(s=>s.nome===keep||String(s.id)===keep); if(sel) $('n-s').value=String(sel.id);
  const isRec=$('n-g').value==='Receita', auto=!!(k&&k.supAuto);
  $('n-sup-wrap').hidden=!isRec||auto; if(!isRec) $('n-sup').checked=false;
  $('n-msg').textContent= auto?`${k.nome} suplementa o orçamento automaticamente.`:'';
}
function abrirForm(r){
  editId=r?r.id:null;
  const form=$('f-novo'); form.hidden=false; $('f-colar').hidden=true;
  $('f-titulo').textContent=r?'Alterar lançamento':'Novo lançamento';
  $('n-excluir').hidden=!r; $('n-gravar').textContent=r?'Gravar alteração':'Gravar';
  $('f-dica').textContent=r?(r.origem==='conferencia'?'Este rendimento foi gerado por uma conferência de saldos.':`Origem: ${r.origem==='migracao'?'planilha 2026':'digitado'}`):'Enter grava e já abre o próximo';
  if(r){ $('n-d').value=r.d; $('n-g').value=r.g; fillCatSelects(r); $('n-v').value=fmtN.format(r.v); $('n-desc').value=r.desc; $('n-sup').checked=r.sup; }
  else { if(!$('n-d').value) $('n-d').value=FECHADO?`${YEAR}-12-31`:(hojeISO().slice(0,4)==YEAR?hojeISO():lastDate()); fillCatSelects(); $('n-v').value=''; $('n-desc').value=''; $('n-sup').checked=false; }
  (r?$('n-v'):$('n-c')).focus();
}
function avisoRetroativo(datas){
  const u=D.ultimaConf; if(!u) return '';
  return datas.some(d=>d<=u.data) ? ` Atenção: data igual ou anterior à última conferência (${dBR(u.data)}); o rendimento apurado nela não considerou este valor.` : '';
}
function renderLanc(){
  const el=$('v-lancamentos');
  if(!el.dataset.built){
    el.dataset.built='1';
    el.innerHTML=`<div class="wrap" style="gap:16px">
      <div class="head"><div><h1>Lançamentos</h1><p>Regime de caixa: lance na data do pagamento ou do recebimento. Clique num lançamento para alterar ou excluir.</p></div>
        <div class="toolbar"><button class="btn" id="b-colar" type="button">Colar do Excel</button><button class="btn primary" id="b-novo" type="button">+ Novo lançamento</button></div></div>
      <form class="panel" id="f-novo" hidden>
        <div class="panel-h"><h2 id="f-titulo">Novo lançamento</h2><span class="muted small" id="f-dica"></span></div>
        <div class="form-grid">
          <div class="field"><label for="n-d">Data</label><input type="date" id="n-d" required></div>
          <div class="field"><label for="n-g">Grupo</label><select id="n-g">${GRUPOS.map(g=>`<option>${g}</option>`).join('')}</select></div>
          <div class="field"><label for="n-c">Categoria</label><select id="n-c"></select></div>
          <div class="field"><label for="n-s">Subcategoria</label><select id="n-s"></select></div>
          <div class="field"><label for="n-v">Valor (R$)</label><input type="text" id="n-v" class="money" inputmode="decimal" placeholder="0,00" required style="width:100%"></div>
          <div class="field"><label for="n-desc">Descrição (opcional)</label><input type="text" id="n-desc" maxlength="300"></div>
        </div>
        <div class="toolbar" style="justify-content:space-between">
          <span class="note">Só aparecem as subcategorias da categoria escolhida. Faltou alguma? <a href="#cadastros" class="linkbtn">Cadastre em Cadastros</a>. Valor negativo numa despesa é estorno.</span>
          <label class="note" id="n-sup-wrap" hidden><input type="checkbox" id="n-sup"> Suplementar o orçamento com este valor</label>
          <span class="note" id="n-msg"></span>
          <div class="toolbar"><button class="btn" type="button" id="n-excluir" hidden style="color:var(--crit)">Excluir</button><button class="btn" type="button" id="n-cancel">Cancelar</button><button class="btn primary" type="submit" id="n-gravar">Gravar</button></div>
        </div>
      </form>
      <div class="panel" id="f-colar" hidden>
        <div class="panel-h"><h2>Colar do Excel</h2><span class="muted small">Colunas: Data · Grupo · Categoria · Subcategoria · Valor · Descrição</span></div>
        <textarea id="c-txt" placeholder="05/11/2026&#9;Despesa&#9;Casa&#9;Mercado&#9;412,90&#9;Atacadão"></textarea>
        <div class="toolbar" style="justify-content:space-between"><span class="note" id="c-msg">Copie as linhas da planilha e cole aqui. Só entram combinações cadastradas.</span><div class="toolbar"><button class="btn" type="button" id="c-cancel">Cancelar</button><button class="btn primary" type="button" id="c-ok" disabled>Incluir</button></div></div>
      </div>
      <div class="toolbar">
        <input type="search" id="l-q" placeholder="Buscar categoria, descrição ou valor" style="width:280px">
        <select id="l-m" aria-label="Mês"><option value="">Todos os meses</option>${MESES.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}</select>
        <select id="l-g" aria-label="Grupo"><option value="">Todos os grupos</option>${GRUPOS.map(g=>`<option>${g}</option>`).join('')}</select>
        <span class="muted small" id="l-count"></span>
      </div>
      <div class="tbl-wrap scroll-y"><table><thead><tr><th>Data</th><th>Grupo</th><th>Categoria</th><th>Subcategoria</th><th>Descrição</th><th class="v">Valor</th></tr></thead><tbody id="l-body"></tbody><tfoot id="l-foot"></tfoot></table></div>
    </div>`;
    $('l-q').oninput=e=>{lf.q=e.target.value.toLowerCase();fillLanc();};
    $('l-m').onchange=e=>{lf.m=e.target.value;fillLanc();};
    $('l-g').onchange=e=>{lf.g=e.target.value;fillLanc();};
    const form=$('f-novo');
    $('n-g').onchange=()=>fillCatSelects(); $('n-c').onchange=()=>fillSubSelect();
    $('b-novo').onclick=()=>abrirForm(null);
    $('n-cancel').onclick=()=>{ form.hidden=true; editId=null; };
    $('l-body').onclick=e=>{ const tr=e.target.closest('tr[data-id]'); if(!tr||FECHADO) return; const r=rows.find(x=>x.id==tr.dataset.id); if(r){ abrirForm(r); form.scrollIntoView({block:'nearest'}); } };
    $('n-excluir').onclick=()=>{ const r=rows.find(x=>x.id===editId); if(!r) return;
      if(!confirm(`Excluir o lançamento de ${dBR(r.d)} · ${r.c} · ${r.s} · ${R(r.v)}?${r.origem==='conferencia'?'\n\nEle foi gerado por uma conferência de saldos.':''}`)) return;
      agir(()=>api.excluirLancamento(r.id), 'Lançamento excluído.', ()=>{ form.hidden=true; editId=null; }); };
    form.onsubmit=e=>{ e.preventDefault(); const v=parseMoney($('n-v').value); if(isNaN(v)||v===0){ $('n-msg').textContent='Valor inválido. Use o formato 1.234,56.'; return; }
      if(!$('n-s').value){ $('n-msg').textContent='Escolha uma subcategoria.'; return; }
      const d=$('n-d').value; if(d.slice(0,4)!=YEAR){ $('n-msg').textContent=`A data precisa ser de ${YEAR}. Para outro ano, troque o exercício no menu.`; return; }
      const l={data:d,subcategoria_id:+$('n-s').value,valor:v,descricao:$('n-desc').value.trim()||null,suplementa_orcamento:!$('n-sup-wrap').hidden&&$('n-sup').checked};
      const aviso=avisoRetroativo([d]);
      if(editId!=null){ const id=editId; agir(()=>api.alterarLancamento(id,l), 'Lançamento alterado.'+aviso, ()=>{ form.hidden=true; editId=null; }); }
      else agir(()=>api.inserirLancamentos([l]), 'Lançamento gravado.'+aviso, ()=>{ ['n-v','n-desc'].forEach(id=>$(id).value=''); $('n-sup').checked=false; $('n-v').focus(); }); };
    $('b-colar').onclick=()=>{ $('f-colar').hidden=false; form.hidden=true; $('c-txt').focus(); };
    $('c-cancel').onclick=()=>{ $('f-colar').hidden=true; };
    let parsed=[];
    $('c-txt').oninput=()=>{ const res=parsePaste($('c-txt').value); parsed=res.ok; $('c-ok').disabled=!parsed.length||res.err.length>0; $('c-ok').textContent=parsed.length?`Incluir ${parsed.length} lançamento${parsed.length>1?'s':''}`:'Incluir';
      $('c-msg').innerHTML=(parsed.length?`${parsed.length} linha(s) válida(s). `:'')+(res.err.length?'<b>Corrija antes de incluir:</b> ':'')+res.err.map(e=>`<span class="err">${esc(e)}</span>`).join(' '); };
    $('c-ok').onclick=()=>{ const lista=parsed, aviso=avisoRetroativo(lista.map(l=>l.data));
      agir(()=>api.inserirLancamentos(lista), `${lista.length} lançamento(s) incluído(s).`+aviso, ()=>{ $('c-txt').value=''; $('c-txt').oninput(); $('f-colar').hidden=true; }); };
  }
  $('b-novo').disabled=FECHADO; $('b-colar').disabled=FECHADO;
  if(FECHADO){ $('f-novo').hidden=true; $('f-colar').hidden=true; }
  fillLanc();
}
function fillLanc(){
  const q=lf.q;
  const list=rows.filter(r=>(!lf.m||mOf(r)==+lf.m)&&(!lf.g||r.g===lf.g)&&(!q||[r.c,r.s,r.desc,r.g,N(r.v)].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.d.localeCompare(a.d)||b.id-a.id);
  $('l-body').innerHTML=list.map(r=>`<tr data-id="${r.id}"><td class="num">${dBR(r.d)}</td><td><span class="chip"><i style="background:${GCOLOR[r.g]}"></i>${r.g}</span></td><td>${esc(r.c)}</td><td>${esc(r.s)}</td><td>${esc(r.desc)}${r.comp?`<span class="tag" title="Composição do valor">${esc(r.comp)}</span>`:''}${r.esup?'<span class="tag">suplementa orçamento</span>':''}${r.origem==='conferencia'?'<span class="tag">conferência</span>':''}</td><td class="v${r.v<0?' neg':''}">${N(r.v)}${r.v<0?'<span class="tag">estorno</span>':''}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">Nenhum lançamento com esses filtros.</td></tr>`;
  const t=g=>sum(list.filter(r=>r.g===g).map(r=>r.v));
  $('l-foot').innerHTML=`<tr><td colspan="5">Receitas ${N(t('Receita'))} · Despesas ${N(t('Despesa'))} · Investimentos ${N(t('Investimento'))} · Obra ${N(t('Obra'))}</td><td class="v">${N(t('Receita')-t('Despesa')-t('Investimento')-t('Obra'))}</td></tr>`;
  $('l-count').textContent=`${list.length} de ${rows.length} lançamentos`;
}
function parseMoney(s){
  s=String(s).trim().replace(/^R\$\s?/,'').replace(/\s/g,''); if(!s) return NaN;
  if(/^-?\d+\.\d{1,2}$/.test(s)) return Math.round(parseFloat(s)*100)/100;            // 1234.56 (ponto decimal)
  if(!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(s)) return NaN;                     // 1.234,56 ou 1234,56
  return Math.round(parseFloat(s.replace(/\./g,'').replace(',','.'))*100)/100;
}
function parsePaste(txt){
  const ok=[],err=[];
  txt.split(/\r?\n/).forEach((line,i)=>{ if(!line.trim()) return; const c=line.split(/\t|;/).map(x=>x.trim());
    const m=(c[0]||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); const g=GRUPOS.find(x=>norm(x)===norm(c[1])); const v=parseMoney(c[4]);
    if(!m){err.push(`Linha ${i+1}: data inválida.`);return;} if(m[3]!=YEAR){err.push(`Linha ${i+1}: a data precisa ser de ${YEAR}.`);return;}
    if(!g){err.push(`Linha ${i+1}: grupo "${c[1]||''}" não existe.`);return;}
    const k=CATS.find(x=>x.g===g&&norm(x.nome)===norm(c[2]));
    if(!k||!k.ativa){err.push(`Linha ${i+1}: categoria "${c[2]||''}" não está cadastrada em ${g}.`);return;}
    const s=k.subs.find(x=>norm(x.nome)===norm(c[3]));
    if(!s||!s.ativa){err.push(`Linha ${i+1}: "${c[3]||''}" não é subcategoria de ${k.nome}.`);return;}
    if(isNaN(v)||v===0){err.push(`Linha ${i+1}: valor inválido.`);return;}
    ok.push({data:`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`,subcategoria_id:s.id,valor:v,descricao:c[5]||null}); });
  return {ok,err};
}

/* ---------- DRE ---------- */
function renderDRE(){
  const f=flows(), nM=nMeses(), partial=mesParcial();
  const cols=MESES.map((m,i)=>`<th class="v${i===nM-1&&partial?' partial':''}">${m}${i===nM-1&&partial?'*':''}</th>`).join('');
  const line=(label,arr,cls='',key='')=>`<tr class="${cls}"${key?` data-k="${esc(key)}"`:''}><td>${label}</td>${arr.map(v=>`<td class="v${v<0?' neg':''}">${N(v)}</td>`).join('')}<td class="v${sum(arr)<0?' neg':''}">${N(sum(arr))}</td></tr>`;
  const block=(g)=>{ const cats={}; rows.filter(r=>r.g===g).forEach(r=>{cats[r.c]=cats[r.c]||{};cats[r.c][r.s]=1;});
    return Object.keys(cats).map(c=>({c,arr:byMonth(r=>r.g===g&&r.c===c)})).sort((a,b)=>sum(b.arr)-sum(a.arr)).map(({c,arr})=>{
      const k=g+'|'+c, open=dreOpen.has(k);
      let h=line(esc(c),arr,'cat'+(open?' open':''),k);
      if(open) h+=Object.keys(cats[c]).map(s=>line(esc(s),byMonth(r=>r.g===g&&r.c===c&&r.s===s),'sub')).join('');
      return h; }).join(''); };
  const pctRow=f.rec.map((v,i)=>v?f.res[i]/v:0);
  $('v-dre').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>DRE gerencial ${YEAR}</h1><p>Clique numa categoria para abrir as subcategorias.</p></div><div class="toolbar"><button class="btn" id="dre-all" type="button">${dreOpen.size?'Recolher tudo':'Expandir tudo'}</button></div></div>
    <div class="tbl-wrap"><table class="dre"><thead><tr><th>Conta</th>${cols}<th class="v">Total</th></tr></thead><tbody>
      <tr class="sec"><td>Receitas</td><td colspan="13"></td></tr>${block('Receita')}${line('Total de receitas',f.rec,'tot')}
      <tr class="sec"><td>(−) Despesas efetivas</td><td colspan="13"></td></tr>${block('Despesa')}${line('Total de despesas efetivas',f.des,'tot')}
      ${line('(=) Resultado do período',f.res,'res hl')}
      <tr class="sub"><td>% das receitas</td>${pctRow.map(v=>`<td class="v">${v?fmtP.format(v):'–'}</td>`).join('')}<td class="v">${sum(f.rec)?fmtP.format(sum(f.res)/sum(f.rec)):'–'}</td></tr>
      <tr class="sec"><td>(−) Investimentos</td><td colspan="13"></td></tr>${block('Investimento')}
      <tr class="sec"><td>(−) Obra</td><td colspan="13"></td></tr>${block('Obra')}${line('Total obra',f.obr,'tot')}
      ${line('(+) Venda do apartamento (líquida)',f.pat,'tot')}
      ${line('(=) Variação do saldo',f.varS,'res')}
      <tr class="tot"><td>Saldo final</td>${f.saldo.map((v,i)=>`<td class="v">${i<nM?N(v):'–'}</td>`).join('')}<td class="v">${N(f.saldo[nM-1])}</td></tr>
    </tbody></table></div>
    <span class="muted small">Saldo inicial de ${R(SALDO_INI)}${D.saldoInicial.length>1?' = '+D.saldoInicial.map(s=>`${esc(s[0])} ${R(s[1])}`).join(' + '):''}.${partial?` * ${MESES[nM-1]} parcial.`:''}</span>
  </div>`;
  const v=$('v-dre');
  v.querySelectorAll('tr.cat').forEach(tr=>tr.firstElementChild.onclick=()=>{ const k=tr.dataset.k; if(dreOpen.has(k)) dreOpen.delete(k); else dreOpen.add(k); renderDRE(); });
  v.querySelector('#dre-all').onclick=()=>{ if(dreOpen.size) dreOpen.clear(); else rows.forEach(r=>dreOpen.add(r.g+'|'+r.c)); renderDRE(); };
}

/* ---------- Orçamento ---------- */
function renderOrc(){
  const p=pace();
  const mk=b=>{ const sup=supOf(b), tot=b.b+sup, re=realizado(b), pct=tot?re/tot:(re>0?2:0); return {b,sup,tot,re,pct,st:statusOf(pct,p)}; };
  const ord=(a,b)=>a.b.c.localeCompare(b.b.c,'pt-BR');
  const desp=budget.filter(b=>b.g==='Despesa').map(mk).sort(ord), inv=budget.filter(b=>b.g==='Investimento').map(mk).sort(ord), obra=budget.filter(b=>b.g==='Obra').map(mk);
  const sups=supRows();
  const semOrc=CATS.filter(c=>(c.g==='Despesa'||c.g==='Investimento')&&rows.some(r=>r.g===c.g&&r.c===c.nome)&&!budget.some(b=>b.cid===c.id));
  const row=o=>`<tr><td>${esc(o.b.c)}${o.sup?`<div class="muted small" data-tip="${esc('<b>Suplementações</b>'+sups.map(r=>`<br>${dBR(r.d)} · ${esc(r.c)}${r.sup?' (marcada)':' (automática)'} · <span class=num>${N(r.v)}</span>`).join(''))}" style="cursor:help;text-decoration:underline dotted">inclui ${sups.length} suplementações</div>`:''}</td>
    <td class="v"><input class="money" data-b="${o.b.id}" value="${o.b.b?N(o.b.b):''}" placeholder="0,00" aria-label="Orçado base de ${esc(o.b.c)}"${FECHADO?' disabled':''}></td>
    <td class="v">${N(o.sup)}</td><td class="v">${N(o.tot)}</td><td class="v">${N(o.re)}</td><td class="v${o.tot-o.re<0?' neg':''}">${N(o.tot-o.re)}</td>
    <td style="min-width:150px"><div class="hbar" style="grid-template-columns:minmax(0,1fr) 52px"><div class="track"><div class="fill" style="width:${Math.min(100,Math.max(0,o.pct*100))}%;background:var(--${o.st[0]==='good'?'s1':o.st[0]==='warn'?'warn':'crit'})"></div><span class="pace" style="left:${p*100}%"></span></div><span class="val">${o.tot?fmtP.format(o.pct):'–'}</span></div></td>
    <td>${pillHTML(o.st)}</td></tr>`;
  const foot=(label,list)=>{ const t=k=>sum(list.map(o=>o[k])); return `<tr class="tot"><td><b>${label}</b></td><td class="v"><b>${N(sum(list.map(o=>o.b.b)))}</b></td><td class="v"><b>${N(t('sup'))}</b></td><td class="v"><b>${N(t('tot'))}</b></td><td class="v"><b>${N(t('re'))}</b></td><td class="v"><b>${N(t('tot')-t('re'))}</b></td><td class="v"><b>${t('tot')?fmtP.format(t('re')/t('tot')):'–'}</b></td><td></td></tr>`; };
  const head=`<thead><tr><th>Categoria</th><th class="v">Orçado base</th><th class="v">Suplementações</th><th class="v">Orçado total</th><th class="v">Realizado</th><th class="v">Saldo</th><th>% consumido</th><th>Situação</th></tr></thead>`;
  const counts={crit:0,warn:0,good:0}; desp.forEach(o=>counts[o.st[0]]++);
  $('v-orcamento').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Orçamento ${YEAR}</h1><p>Anual por categoria. A marca vertical na barra é o ritmo do ano (${fmtP.format(p)} decorrido).</p></div>
      <div class="toolbar" id="orc-status"></div></div>
    ${semOrc.length?`<div class="banner"><b>Atenção.</b><span>Categoria com gasto e sem linha de orçamento: ${semOrc.map(c=>`${esc(c.nome)} <button class="linkbtn" type="button" data-novo-orc="${c.id}"${FECHADO?' disabled':''}>criar linha</button>`).join(' · ')}</span></div>`:''}
    <h2>Despesas efetivas</h2>
    <div class="tbl-wrap"><table>${head}<tbody>${desp.map(row).join('')}${foot('Total despesas',desp)}</tbody></table></div>
    <h2>Investimentos e obra</h2>
    <div class="tbl-wrap"><table>${head}<tbody>${inv.map(row).join('')}${obra.map(row).join('')}</tbody></table></div>
    <div class="note">Diárias recebidas suplementam o orçado de "Outros" automaticamente. Outras receitas não previstas só suplementam quando você marca isso no lançamento. Altere o orçado base direto na tabela: grava ao sair do campo.</div>
  </div>`;
  $('orc-status').innerHTML=['crit','warn','good'].map(k=>{ const st=statusOf(k==='crit'?2:k==='warn'?p+0.05:0,p); return `<span class="pill ${k}"><svg viewBox="0 0 16 16" aria-hidden="true">${st[2]}</svg>${counts[k]} ${st[1].toLowerCase()}</span>`; }).join('');
  document.querySelectorAll('#v-orcamento input[data-b]').forEach(inp=>inp.onchange=()=>{ const v=parseMoney(inp.value||'0'); const b=budget.find(x=>x.id==inp.dataset.b);
    if(isNaN(v)||v<0){ inp.value=b.b?N(b.b):''; toast('Valor inválido.'); return; } agir(()=>api.orcamento(b.id,v), `Orçado de ${b.c} gravado.`); });
  document.querySelectorAll('#v-orcamento [data-novo-orc]').forEach(bt=>bt.onclick=()=>{ const c=CATS.find(x=>x.id==bt.dataset.novoOrc); agir(()=>api.novoOrcamento(YEAR,c.g,c.id), `Linha de orçamento criada para ${c.nome}. Informe o valor.`); });
}

/* ---------- Conferência ---------- */
const novaContaForm = (pfx) => `<form class="form-row" id="${pfx}-form">
  <div class="field"><label for="${pfx}-inst">Instituição</label><input type="text" id="${pfx}-inst" placeholder="Ex.: XP" required maxlength="60"></div>
  <div class="field"><label for="${pfx}-nome">Nome da conta ou aplicação</label><input type="text" id="${pfx}-nome" placeholder="Ex.: CDB liquidez diária" required maxlength="80"></div>
  <div class="field" style="flex:0 1 170px"><label for="${pfx}-tipo">Tipo</label><select id="${pfx}-tipo"><option value="conta_corrente">Conta corrente</option><option value="investimento" selected>Investimento</option></select></div>
  <button class="btn primary" type="submit">Adicionar conta</button></form>`;
function bindNovaConta(pfx){
  const f=$(pfx+'-form'); if(!f) return;
  f.onsubmit=e=>{ e.preventDefault(); const inst=f.querySelector('#'+pfx+'-inst').value.trim(), nome=f.querySelector('#'+pfx+'-nome').value.trim(), tipo=f.querySelector('#'+pfx+'-tipo').value;
    if(!inst||!nome) return; if(CONTAS.some(c=>norm(c.inst)===norm(inst)&&norm(c.nome)===norm(nome))){ toast('Essa conta já existe.'); return; }
    agir(()=>api.novaConta(inst,nome,tipo), `Conta "${inst} · ${nome}" cadastrada.`); };
}
function recCard(r, ativas){
  return `<div class="panel" data-rec="${r.id}"><div class="panel-h"><h2>${esc(r.descricao)}</h2><span class="muted small">Vence em ${dBR(r.vencimento)}</span></div>
    <div class="stat-row">
      <div class="stat"><span class="eyebrow">Valor contratado</span><b>${R(r.contratado)}</b></div>
      <div class="stat"><span class="eyebrow">Já recebido</span><b>${R(r.recebidoAntes+recebido(r))}</b></div>
      <div class="stat"><span class="eyebrow">Falta receber</span><b>${R(aReceber(r))}</b></div>
    </div>
    <div class="stat-row">
      <div class="stat"><span class="eyebrow">${esc(r.custoDesc)} a pagar</span><b>${R(custoAPagar(r))}</b></div>
      <div class="stat"><span class="eyebrow">Líquido que ainda vai entrar</span><b>${R(liquidoAEntrar(r))}</b></div>
    </div>
    <div class="note">Receber não é receita: é venda de um bem. O valor entra no saldo abaixo do resultado, na linha "Venda do apartamento" da DRE, e o pagamento do custo sai na mesma linha.${r.recebidoAntes?` Os ${R(r.recebidoAntes)} recebidos antes do sistema estão no saldo inicial de 2026.`:''}</div>
    ${r.movs.length?`<table><thead><tr><th>Data</th><th>Movimento</th><th>Conta</th><th class="v">Valor</th></tr></thead><tbody>
      ${r.movs.map(m=>`<tr><td class="num">${dBR(m.d)}</td><td>${m.tipo==='recebimento'?'Recebimento':esc(r.custoDesc)+' paga'}</td><td>${esc(contaNome(CONTAS.find(x=>x.id===m.conta)))}</td><td class="v${m.tipo==='custo'?' neg':''}">${N(efeitoMov(m))}${FECHADO||m.d.slice(0,4)!=YEAR?'':` <button class="linkbtn" type="button" data-del-mov="${m.id}">excluir</button>`}</td></tr>`).join('')}
    </tbody></table>`:''}
    ${(aReceber(r)>0.005||custoAPagar(r)>0.005)&&!FECHADO?`<form class="form-row" data-rec-form="${r.id}">
      <div class="field" style="flex:0 1 190px"><label>Movimento</label><select name="tipo"><option value="recebimento">Recebimento</option><option value="custo">Pagamento: ${esc(r.custoDesc)}</option></select></div>
      <div class="field" style="flex:0 1 150px"><label>Data</label><input type="date" name="data" value="${hojeISO().slice(0,4)==YEAR?hojeISO():`${YEAR}-12-31`}" required></div>
      <div class="field" style="flex:0 1 130px"><label>Valor (R$)</label><input type="text" class="money" name="valor" placeholder="0,00" style="width:100%" required></div>
      <div class="field"><label data-conta-l>Conta de destino</label><select name="conta">${ativas.map(c=>`<option value="${c.id}">${esc(contaNome(c))}</option>`).join('')}</select></div>
      <button class="btn primary" type="submit">Registrar</button>
    </form>`:''}
  </div>`;
}
function renderConf(){
  const el=$('v-conferencia');
  const ativas=CONTAS.filter(c=>c.ativa);
  const hist=D.conferencias.slice(-8).reverse();
  el.innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Conferência de saldos</h1><p>Informe o saldo real de cada conta. O sistema apura o rendimento pela diferença e lança em Receita | Rendimentos.</p></div>
      <button class="btn" type="button" id="cf-add">+ Nova conta</button></div>
    <div class="panel" id="cf-add-panel" hidden><div class="panel-h"><h2>Nova conta</h2><span class="muted small">Aparece na conferência a partir de agora</span></div>${novaContaForm('cfn')}</div>
    <div class="grid g-2">
      <div class="tbl-wrap"><table><thead><tr><th>Instituição</th><th>Posição</th><th>Tipo</th><th class="v">Saldo informado</th></tr></thead><tbody>
        ${ativas.map(c=>`<tr><td>${esc(c.inst)}</td><td>${esc(c.nome)}${c.obs?`<div class="muted small">${esc(c.obs)}</div>`:''}</td><td class="muted small">${TIPOS[c.tipo]||esc(c.tipo)}</td><td class="v"><input class="money" data-conta="${c.id}" value="${confValores[c.id]?N(confValores[c.id]):''}" placeholder="0,00" aria-label="Saldo de ${esc(c.inst+' '+c.nome)}"${FECHADO?' disabled':''}></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">Total informado</td><td class="v" id="cf-tot"></td></tr></tfoot></table>
      <div class="note" style="padding:10px 14px">${D.ultimaConf?`Valores sugeridos: os da última conferência, de ${dBR(D.ultimaConf.data)}. Atualize cada um.`:'Primeira conferência: informe o saldo de cada conta.'}</div></div>
      <div class="grid" style="gap:16px">
        <div class="panel"><h2>Apuração</h2>
          <div class="field"><label for="cf-d">Data da conferência</label><input type="date" id="cf-d" value="${confDate}" min="${YEAR}-01-01" max="${YEAR}-12-31"></div>
          <table><tbody>
            <tr><td>Saldo calculado pelos lançamentos</td><td class="v" id="cf-calc"></td></tr>
            <tr><td>(−) Total informado nas contas</td><td class="v" id="cf-inf"></td></tr>
            <tr class="tot"><td><b>Rendimento apurado</b></td><td class="v" id="cf-ren" style="font-weight:700"></td></tr>
          </tbody></table>
          <div class="note" id="cf-note"></div>
          <button class="btn primary" type="button" id="cf-ok"${FECHADO?' disabled':''}></button>
        </div>
        ${RECS.map(r=>recCard(r,ativas)).join('')}
        ${hist.length?`<div class="panel"><h2>Últimas conferências</h2><table><thead><tr><th>Data</th><th class="v">Total informado</th><th class="v">Rendimento</th></tr></thead><tbody>
          ${hist.map(c=>`<tr><td class="num">${dBR(c.data)}</td><td class="v">${N(c.total)}</td><td class="v${c.rend<0?' neg':''}">${N(c.rend)}${FECHADO||c.data.slice(0,4)!=YEAR?'':` <button class="linkbtn" type="button" data-del-conf="${c.id}">excluir</button>`}</td></tr>`).join('')}</tbody></table></div>`:''}
      </div>
    </div></div>`;
  $('cf-add').onclick=()=>{ $('cf-add-panel').hidden=!$('cf-add-panel').hidden; if(!$('cf-add-panel').hidden) $('cfn-inst').focus(); };
  bindNovaConta('cfn');
  el.querySelectorAll('input[data-conta]').forEach(inp=>inp.onchange=()=>{ const v=parseMoney(inp.value||'0'); confValores[inp.dataset.conta]=isNaN(v)?0:v; inp.value=confValores[inp.dataset.conta]?N(confValores[inp.dataset.conta]):''; calcConf(); });
  $('cf-d').onchange=e=>{ confDate=e.target.value; calcConf(); };
  $('cf-ok').onclick=()=>{ const ren=calcConf();
    if(confDate.slice(0,4)!=YEAR){ toast(`A data precisa ser de ${YEAR}.`); return; }
    const ult=D.conferencias.filter(c=>c.data.slice(0,4)==YEAR).map(c=>c.data).sort().pop();
    if(ult&&confDate<ult){ toast(`Já existe conferência em ${dBR(ult)}, posterior a esta data. Exclua-a antes, se precisar refazer.`, true); return; }
    if(D.conferencias.some(c=>c.data===confDate)&&!confirm(`Já existe uma conferência em ${dBR(confDate)}. Registrar outra?`)) return;
    const saldos=ativas.map(c=>({conta_id:c.id,saldo:confValores[c.id]||0}));
    agir(()=>api.conferencia(confDate,saldos), Math.abs(ren)<0.005?`Conferência de ${dBR(confDate)} registrada, sem diferença.`:`Conferência de ${dBR(confDate)} registrada. Rendimento de ${R(ren)} lançado.`); };
  el.querySelectorAll('[data-del-mov]').forEach(b=>b.onclick=()=>{ const m=RECS.flatMap(r=>r.movs).find(x=>x.id==b.dataset.delMov);
    if(!confirm(`Excluir o movimento de ${dBR(m.d)} no valor de ${R(m.v)}?`)) return;
    agir(()=>api.excluirRecebimento(m.id), 'Movimento excluído.', ()=>{ if(m.conta!=null) confValores[m.conta]=Math.round(((confValores[m.conta]||0)-efeitoMov(m))*100)/100; }); });
  el.querySelectorAll('[data-del-conf]').forEach(b=>b.onclick=()=>{ const c=D.conferencias.find(x=>x.id==b.dataset.delConf);
    if(!confirm(`Excluir a conferência de ${dBR(c.data)}?${c.rend?`\n\nO lançamento de rendimento de ${R(c.rend)} gerado por ela também será excluído.`:''}`)) return;
    agir(()=>api.excluirConferencia(c.id), `Conferência de ${dBR(c.data)} excluída.`); });
  el.querySelectorAll('form[data-rec-form]').forEach(f=>{
    const r=RECS.find(x=>x.id==f.dataset.recForm);
    f.elements.tipo.onchange=()=>{ const rc=f.elements.tipo.value==='recebimento'; f.querySelector('[data-conta-l]').textContent=rc?'Conta de destino':'Conta de onde saiu'; if(!rc) f.elements.valor.value=fmtN.format(custoAPagar(r)); };
    f.onsubmit=e=>{ e.preventDefault(); const tipo=f.elements.tipo.value, v=parseMoney(f.elements.valor.value), data=f.elements.data.value, conta=+f.elements.conta.value;
      if(isNaN(v)||v<=0){ toast('Informe um valor válido.'); return; }
      if(data.slice(0,4)!=YEAR){ toast(`A data precisa ser de ${YEAR}.`); return; }
      if(tipo==='recebimento'&&v>aReceber(r)+0.005){ toast('O valor é maior do que falta receber.'); return; }
      if(tipo==='custo'&&v>custoAPagar(r)+0.005){ toast(`O valor é maior do que ${r.custoDesc.toLowerCase()} a pagar.`); return; }
      const c=CONTAS.find(x=>x.id===conta);
      const fim=tipo==='recebimento'&&aReceber(r)-v<0.005&&custoAPagar(r)>0.005?` Parcela 100% recebida: falta pagar ${r.custoDesc.toLowerCase()} de ${R(custoAPagar(r))}.`:'';
      agir(()=>api.movimentoRecebivel({recebivel_id:r.id,data,tipo,valor:v,conta_id:conta}),
        (tipo==='recebimento'?`Recebimento de ${R(v)} registrado em ${contaNome(c)}. Entra no saldo como venda do apartamento, não como receita.`:`Pagamento de ${R(v)} registrado.`)+fim,
        ()=>{ confValores[conta]=Math.round(((confValores[conta]||0)+(tipo==='recebimento'?v:-v))*100)/100; }); };
  });
  calcConf();
}
function calcConf(){
  const inf=Math.round(sum(CONTAS.filter(c=>c.ativa).map(c=>confValores[c.id]||0))*100)/100;
  const calc=saldoAte(confDate), ren=inf-calc;
  $('cf-tot').textContent=N(inf); $('cf-calc').textContent=N(calc); $('cf-inf').textContent=N(inf); $('cf-ren').textContent=N(ren); $('cf-ren').className='v'+(ren<0?' neg':'');
  $('cf-note').textContent= ren<0 ? 'Diferença negativa: pode ser um lançamento esquecido, ou IR de resgate. Confira antes de registrar.' : 'A diferença vira um lançamento em Receita | Rendimentos | Rendimentos. IR de resgate já está descontado, porque os saldos são líquidos.';
  $('cf-ok').textContent= Math.abs(ren)<0.005 ? 'Registrar conferência (sem diferença)' : `Registrar e lançar rendimento de ${R(ren)}`;
  return ren;
}

/* ---------- Cadastros ---------- */
function renderCad(){
  const el=$('v-cadastros');
  const list=CATS.filter(c=>c.g===cadGrupo);
  el.innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Cadastros</h1><p>Plano de categorias e contas. Os lançamentos só aceitam o que estiver cadastrado aqui.</p></div></div>
    <div class="panel">
      <div class="panel-h"><h2>Plano de categorias</h2>
        <div class="seg" role="group" aria-label="Grupo">${GRUPOS.map(g=>`<button type="button" data-grupo="${g}" aria-pressed="${g===cadGrupo}">${g} <span class="muted small">${CATS.filter(c=>c.g===g).length}</span></button>`).join('')}</div></div>
      <ul class="rules">
        <li>Cada subcategoria pertence a uma única categoria: "Pneus" em Carro não aparece em Casa.</li>
        <li>Renomear muda o nome em todo o histórico: é só o rótulo, os valores não mudam.</li>
        <li>Categoria ou subcategoria já usada não pode ser excluída nem mudar de grupo. Desative para sumir dos novos lançamentos.</li>
        <li>Desativadas continuam no histórico, na DRE e nos relatórios.</li>
      </ul>
      <form class="inline-add" id="cad-newcat" style="max-width:520px"><input type="text" id="cad-newcat-nome" placeholder="Nova categoria em ${cadGrupo}" aria-label="Nome da nova categoria" maxlength="60"><button class="btn primary" type="submit">+ Categoria</button></form>
      <div class="catlist">
        ${list.map(c=>{ const u=usoCat(c); return `<div class="catcard${c.ativa?'':' off'}" data-cat="${c.id}">
          <div class="cat-h"><div><b data-name>${esc(c.nome)}</b><div class="muted small">${u} lançamento${u===1?'':'s'}${c.ativa?'':' · desativada'}</div></div>
            <div style="display:flex;gap:2px"><button class="icon-btn" type="button" data-act="ren-cat" title="Renomear categoria" aria-label="Renomear ${esc(c.nome)}">✎</button><button class="icon-btn" type="button" data-act="tog-cat" title="${c.ativa?'Desativar':'Ativar'}">${c.ativa?'Desativar':'Ativar'}</button></div></div>
          <div class="subs">${c.subs.map(s=>`<span class="subchip${s.ativa?'':' off'}" data-sub="${s.id}" title="${s.uso} lançamento(s)"><span data-name>${esc(s.nome)}</span><button type="button" data-act="ren-sub" aria-label="Renomear ${esc(s.nome)}">✎</button><button type="button" data-act="tog-sub" aria-label="${s.ativa?'Desativar':'Ativar'} ${esc(s.nome)}">${s.ativa?'×':'↺'}</button></span>`).join('')}</div>
          <form class="inline-add" data-act="add-sub"><input type="text" placeholder="Nova subcategoria" aria-label="Nova subcategoria em ${esc(c.nome)}" maxlength="60"><button class="btn" type="submit">Adicionar</button></form>
        </div>`; }).join('')}
      </div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Contas e aplicações</h2><span class="muted small">Usadas na conferência de saldos</span></div>
      <div class="tbl-wrap" style="box-shadow:none"><table><thead><tr><th>Instituição</th><th>Nome</th><th>Tipo</th><th>Situação</th><th></th></tr></thead><tbody>
        ${CONTAS.map(c=>`<tr><td>${esc(c.inst)}</td><td>${esc(c.nome)}</td><td>${TIPOS[c.tipo]||esc(c.tipo)}</td><td>${c.ativa?'<span class="pill good">Ativa</span>':'<span class="pill warn">Inativa</span>'}</td><td><button class="linkbtn" type="button" data-act="tog-conta" data-id="${c.id}">${c.ativa?'Desativar':'Reativar'}</button></td></tr>`).join('')}
      </tbody></table></div>
      ${novaContaForm('cdn')}
      <div class="note">Conta zerada ou encerrada: desative. Ela sai da conferência, mas o histórico das conferências antigas continua.</div>
    </div>
  </div>`;
  bindNovaConta('cdn');
}
function inlineEdit(span, onSave){
  const old=span.textContent; const inp=document.createElement('input'); inp.type='text'; inp.value=old; inp.maxLength=60; inp.style.cssText='padding:2px 8px;font:inherit;width:'+Math.max(80,old.length*9)+'px';
  span.replaceWith(inp); inp.focus(); inp.select();
  let done=false; const finish=save=>{ if(done) return; done=true; const v=inp.value.trim(); if(save&&v&&v!==old){ if(onSave(v)!==false) return; } renderCad(); };
  inp.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault();finish(true);} if(e.key==='Escape') finish(false); };
  inp.onblur=()=>finish(true);
}
function onCadClick(e){
  const gb=e.target.closest('[data-grupo]'); if(gb){ cadGrupo=gb.dataset.grupo; renderCad(); return; }
  const b=e.target.closest('[data-act]'); if(!b||b.tagName==='FORM') return;
  const act=b.dataset.act;
  if(act==='tog-conta'){ const c=CONTAS.find(x=>x.id==b.dataset.id); agir(()=>api.conta(c.id,{ativa:!c.ativa}), `Conta ${c.ativa?'desativada':'reativada'}.`); return; }
  const cardEl=b.closest('[data-cat]'); const cat=CATS.find(x=>x.id==cardEl.dataset.cat);
  if(act==='ren-cat') inlineEdit(cardEl.querySelector('.cat-h [data-name]'), v=>{ if(CATS.some(x=>x.g===cat.g&&x!==cat&&norm(x.nome)===norm(v))){ toast('Já existe uma categoria com esse nome.'); return false; } agir(()=>api.categoria(cat.id,{nome:v}), `Categoria renomeada para "${v}" em todo o histórico.`); });
  if(act==='tog-cat') agir(()=>api.categoria(cat.id,{ativa:!cat.ativa}), `Categoria ${cat.ativa?'desativada':'ativada'}.`);
  const subEl=b.closest('[data-sub]'); if(!subEl) return; const sub=cat.subs.find(x=>x.id==subEl.dataset.sub);
  if(act==='ren-sub') inlineEdit(subEl.querySelector('[data-name]'), v=>{ if(cat.subs.some(x=>x!==sub&&norm(x.nome)===norm(v))){ toast('Já existe essa subcategoria nesta categoria.'); return false; } agir(()=>api.subcategoria(sub.id,{nome:v}), `Subcategoria renomeada para "${v}".`); });
  if(act==='tog-sub') agir(()=>api.subcategoria(sub.id,{ativa:!sub.ativa}), `Subcategoria ${sub.ativa?'desativada':'ativada'}.`);
}
function onCadSubmit(e){
  if(e.target.id==='cad-newcat'){ e.preventDefault(); const v=e.target.querySelector('input').value.trim(); if(!v) return;
    if(CATS.some(x=>x.g===cadGrupo&&norm(x.nome)===norm(v))){ toast('Já existe uma categoria com esse nome.'); return; }
    agir(()=>api.novaCategoria(cadGrupo,v), `Categoria "${v}" criada. Agora adicione as subcategorias dela.`); return; }
  if(e.target.dataset.act==='add-sub'){ e.preventDefault(); const cat=CATS.find(x=>x.id==e.target.closest('[data-cat]').dataset.cat); const v=e.target.querySelector('input').value.trim(); if(!v) return;
    if(cat.subs.some(x=>norm(x.nome)===norm(v))){ toast('Essa subcategoria já existe nesta categoria.'); return; }
    agir(()=>api.novaSubcategoria(cat.id,v), `"${v}" adicionada em ${cat.nome}.`); }
}

/* ---------- Virada ---------- */
function renderVirada(){
  const f=flows(), nM=nMeses(), saldo=f.saldo[nM-1];
  const prox=D.anos.find(a=>a.ano===YEAR+1);
  const conf31=D.conferencias.find(c=>c.data===`${YEAR}-12-31`);
  const mapa=b=>budget.find(x=>x.g===b.g&&x.cid===b.cid);
  const list=budgetProx.map(b=>{ const a=mapa(b); return {...b, orc:a?a.b+supOf(a):0, re:a?realizado(a):0}; });
  $('v-virada').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Virada de ano: ${YEAR} → ${YEAR+1}</h1><p>${FECHADO?`${YEAR} está fechado.`:'Prévia do fechamento do exercício com a posição de hoje.'}</p></div>
      <div class="toolbar">
        ${prox?'':`<button class="btn" type="button" id="vr-abrir">Abrir exercício ${YEAR+1}</button>`}
        ${FECHADO?`<button class="btn" type="button" id="vr-reabrir">Reabrir ${YEAR}</button>`:`<button class="btn primary" type="button" id="vr-fechar">Fechar exercício ${YEAR}</button>`}
        ${prox?`<button class="btn" type="button" id="vr-ir">Ir para ${YEAR+1}</button>`:''}
      </div></div>
    <div class="grid g-2">
      <div class="panel"><h2>O que acontece</h2>
        <ol class="steps">
          <li><span><b>Abrir ${YEAR+1}</b> pode ser feito antes de fechar ${YEAR}, para você lançar janeiro enquanto confere dezembro. O saldo inicial fica provisório.</span></li>
          <li><span>Ao <b>fechar ${YEAR}</b>, o saldo de cada conta na conferência de 31/12 vira o <b>saldo inicial de ${YEAR+1}</b>. Sem essa conferência, entra um saldo único.</span></li>
          <li><span>O orçamento de ${YEAR+1} começa <b>zerado</b>, com o realizado de ${YEAR} ao lado para referência.</span></li>
          <li><span>${YEAR} fica <b>bloqueado para edição</b> e continua disponível para consulta. Dá para reabrir se precisar corrigir algo; depois, feche de novo para atualizar o saldo inicial de ${YEAR+1}.</span></li>
        </ol>
        <div class="note">Conferência de 31/12/${YEAR}: ${conf31?`registrada (total ${R(conf31.total)}).`:'ainda não registrada.'}</div></div>
      <div class="panel"><h2>Transporte de saldo</h2>
        <div class="carry"><div class="box"><span class="eyebrow">Saldo final ${YEAR}</span><span class="big num" style="font-size:20px">${R(saldo)}</span><span class="muted small">posição em ${dBR(lastDate())}</span></div><span class="arrow" aria-hidden="true">→</span><div class="box"><span class="eyebrow">Saldo inicial ${YEAR+1}</span><span class="big num" style="font-size:20px">${R(saldo)}</span><span class="muted small">em 01/01/${YEAR+1}</span></div></div>
        <div class="note">O valor definitivo sai depois dos lançamentos de dezembro e da conferência de 31/12.</div></div>
    </div>
    <h2>Orçamento ${YEAR+1}</h2>
    ${prox?`<div class="tbl-wrap"><table><thead><tr><th>Categoria</th><th class="v">Orçado ${YEAR}</th><th class="v">Realizado ${YEAR}</th><th class="v">Orçado ${YEAR+1}</th></tr></thead><tbody>
      ${list.map(x=>`<tr><td>${esc(x.c)}${x.g==='Obra'?'<span class="tag">obra</span>':x.g==='Investimento'?'<span class="tag">investimento</span>':''}</td><td class="v">${N(x.orc)}</td><td class="v">${N(x.re)}</td><td class="v"><input class="money" data-bp="${x.id}" value="${x.b?N(x.b):''}" placeholder="0,00" aria-label="Orçado ${YEAR+1} de ${esc(x.c)}"${prox.status==='fechado'?' disabled':''}></td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="v">${N(sum(list.map(x=>x.orc)))}</td><td class="v">${N(sum(list.map(x=>x.re)))}</td><td class="v">${N(sum(list.map(x=>x.b)))}</td></tr></tfoot></table></div>`
      :`<div class="note">Abra o exercício ${YEAR+1} para preencher o orçamento. As linhas de ${YEAR} são copiadas com valor zero.</div>`}
  </div>`;
  const v=$('v-virada');
  v.querySelector('#vr-abrir')?.addEventListener('click',()=>{ if(!confirm(`Abrir o exercício ${YEAR+1}?\n\nO saldo inicial fica provisório até você fechar ${YEAR}.`)) return; agir(()=>api.abrirExercicio(YEAR+1), `Exercício ${YEAR+1} aberto. Preencha o orçamento abaixo.`); });
  v.querySelector('#vr-fechar')?.addEventListener('click',()=>{
    const av=[]; if(!conf31) av.push(`- Ainda não há conferência de saldos em 31/12/${YEAR}; o saldo inicial de ${YEAR+1} entra como valor único.`);
    if(hojeISO()<`${YEAR}-12-31`) av.push(`- O ano ainda não terminou.`);
    if(!confirm(`Fechar o exercício ${YEAR}?\n\n${YEAR} fica bloqueado para edição (dá para reabrir) e o saldo final vira o saldo inicial de ${YEAR+1}.${av.length?'\n\n'+av.join('\n'):''}`)) return;
    let modo=''; agir(async()=>{ modo=await api.fecharExercicio(YEAR); }, ()=>`Exercício ${YEAR} fechado. Saldo inicial de ${YEAR+1} transportado ${modo}.`); });
  v.querySelector('#vr-reabrir')?.addEventListener('click',()=>{ if(!confirm(`Reabrir ${YEAR} para correções?\n\nDepois de corrigir, feche de novo para atualizar o saldo inicial de ${YEAR+1}.`)) return; agir(()=>api.reabrirExercicio(YEAR), `${YEAR} reaberto.`); });
  v.querySelector('#vr-ir')?.addEventListener('click',()=>trocarAno(YEAR+1));
  v.querySelectorAll('input[data-bp]').forEach(inp=>inp.onchange=()=>{ const val=parseMoney(inp.value||'0'); const b=budgetProx.find(x=>x.id==inp.dataset.bp);
    if(isNaN(val)||val<0){ inp.value=b.b?N(b.b):''; toast('Valor inválido.'); return; } agir(()=>api.orcamento(b.id,val), `Orçado ${YEAR+1} de ${b.c} gravado.`); });
}

/* ---------- infraestrutura ---------- */
function rerender(){
  renderAno(); renderAvisos(); renderPainel(); renderAnalises(); renderLanc(); renderDRE(); renderOrc(); renderConf(); renderCad(); renderVirada();
}
// Gravações entram numa fila: uma de cada vez, nenhuma é descartada.
let fila=Promise.resolve(), pendentesFila=0;
function agir(fn, msg, depois){
  pendentesFila++; document.body.style.cursor='progress';
  fila=fila.then(async()=>{
    try{ await fn(); depois?.(); if(pendentesFila===1){ aplicar(await api.carregar(YEAR)); rerenderSeguro(); } toast(typeof msg==='function'?msg():msg); }
    catch(e){ toast(e?.message||String(e), true); try{ aplicar(await api.carregar(YEAR)); rerenderSeguro(); }catch{} }
    finally{ if(--pendentesFila===0) document.body.style.cursor=''; }
  });
}
// Não redesenha a tela em que há um campo sendo digitado; redesenha quando o foco sair dela.
const VIEW_RENDER={painel:()=>renderPainel(),analises:()=>renderAnalises(),lancamentos:()=>renderLanc(),dre:()=>renderDRE(),orcamento:()=>renderOrc(),conferencia:()=>renderConf(),cadastros:()=>renderCad(),virada:()=>renderVirada()};
function rerenderSeguro(){
  const ativo=document.activeElement;
  renderAno(); renderAvisos();
  for(const [k,fn] of Object.entries(VIEW_RENDER)){
    const sec=$('v-'+k);
    if(k!=='lancamentos'&&ativo&&sec.contains(ativo)&&/^(INPUT|SELECT|TEXTAREA)$/.test(ativo.tagName)){
      sec.addEventListener('focusout',e=>{ if(!sec.contains(e.relatedTarget)) fn(); },{once:true});
    } else fn();
  }
}
function renderAno(){ $('ano-sel').innerHTML=D.anos.map(a=>`<option value="${a.ano}"${a.ano===YEAR?' selected':''}>Exercício ${a.ano}${a.status==='fechado'?' (fechado)':''}</option>`).join(''); }
async function trocarAno(ano){
  try{ aplicar(await api.carregar(ano)); rerender(); window.scrollTo(0,0); }catch(e){ toast(e?.message||String(e), true); }
}
function show(v){ if(!VIEWS.some(x=>x[0]===v)) v='painel'; document.querySelectorAll('[data-view]').forEach(s=>s.hidden=s.id!=='v-'+v); document.querySelectorAll('#nav a').forEach(a=>a.dataset.v===v?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')); }
let toastT; function toast(msg, erro){ const t=$('toast'); t.textContent=msg; t.hidden=false; t.style.background=erro?'var(--crit)':''; t.style.color=erro?'#fff':''; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true, erro?7000:Math.max(3200,msg.length*45)); }

let ouvintes=false;
export async function iniciar(raiz, apiDados){
  api=apiDados; YEAR=undefined; confDate=null; confValores=null; editId=null; dreOpen.clear(); Object.assign(lf,{q:'',m:'',g:''});
  raiz.innerHTML=`<div class="bg" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="app">
  <aside class="side">
    <div class="brand"><span class="mark">B</span><div><b>Finanças do Bruno</b><select id="ano-sel" class="ano-sel" aria-label="Exercício"></select></div></div>
    <nav class="nav" id="nav" aria-label="Seções">${VIEWS.map(([k,l,ic])=>`<a href="#${k}" data-v="${k}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>${l}</a>`).join('')}</nav>
    <div class="side-foot">
      <button class="btn block" id="btn-backup" type="button">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v2h10v-2"/></svg>
        Baixar backup (.xlsx)
      </button>
      <span class="muted small" id="ub"></span>
      <button class="linkbtn" id="btn-sair" type="button">Sair</button>
    </div>
  </aside>
  <main class="main"><div class="wrap">
    <div id="avisos" style="display:grid;gap:10px"></div>
    ${VIEWS.map(([k],i)=>`<section id="v-${k}" data-view${i?' hidden':''}></section>`).join('')}
  </div></main>
</div>
<div id="tip" hidden></div>
<div id="toast" hidden></div>`;
  $('v-painel').innerHTML='<div class="panel"><span class="muted">Carregando seus dados…</span></div>';
  $('ano-sel').onchange=e=>trocarAno(+e.target.value);
  $('btn-sair').onclick=()=>api.sair();
  $('btn-backup').onclick=async()=>{ const b=$('btn-backup'); b.disabled=true; toast('Gerando backup…');
    try{ await api.backup(); try{ localStorage.setItem('ultimoBackup', new Date().toISOString()); }catch{} renderAvisos(); toast('Backup baixado. Salve o arquivo na sua pasta do OneDrive.'); }
    catch(e){ toast('Não foi possível gerar o backup: '+(e?.message||e), true); } finally{ b.disabled=false; } };
  const cad=$('v-cadastros'); cad.addEventListener('click',onCadClick); cad.addEventListener('submit',onCadSubmit);
  if(ouvintes){ show((location.hash||'#painel').slice(1)); try{ aplicar(await api.carregar()); rerender(); }catch(e){ toast(e?.message||String(e), true); } return; }
  ouvintes=true;
  document.addEventListener('click',e=>{ const a=e.target.closest('a[href^="#"]'); if(a){ e.preventDefault(); const v=a.getAttribute('href').slice(1); show(v); try{history.replaceState(null,'','#'+v);}catch{} window.scrollTo(0,0); } });
  document.addEventListener('mouseover',e=>{ const tip=$('tip'), t=e.target.closest('[data-tip]'); if(t){ tip.innerHTML=t.getAttribute('data-tip'); tip.hidden=false; } });
  document.addEventListener('mousemove',e=>{ const tip=$('tip'); if(tip.hidden) return; const w=tip.offsetWidth,h=tip.offsetHeight; let x=e.clientX+14,y=e.clientY+14; if(x+w>innerWidth-8) x=e.clientX-w-14; if(y+h>innerHeight-8) y=e.clientY-h-14; tip.style.left=x+'px'; tip.style.top=y+'px'; });
  document.addEventListener('mouseout',e=>{ const t=e.target.closest('[data-tip]'); if(t && !t.contains(e.relatedTarget)) $('tip').hidden=true; });
  show((location.hash||'#painel').slice(1));
  try{ aplicar(await api.carregar()); rerender(); show((location.hash||'#painel').slice(1)); }
  catch(e){ $('v-painel').innerHTML=`<div class="panel"><h2>Não foi possível carregar os dados</h2><p class="muted">${esc(e?.message||e)}</p></div>`; }
}
