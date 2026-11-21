// Área de investimentos (carteira da filha), separada das finanças pessoais.
// O banco guarda só os movimentos; posição, custo em R$ e números do IR são calculados aqui.
//
// Custo em R$ ("o mais aproximado do que saiu do bolso"):
// - cada corretora em dólar tem um caixa em US$ com custo médio em R$;
// - envio de dinheiro (câmbio) entra pelo valor pago em reais, com IOF;
// - compra usa dólares do caixa pelo custo médio; venda, dividendo e imposto retido entram
//   e saem pela PTAX do dia (compra ou venda, conforme a escolha na tela de IR);
// - o que existia em 31/12/2025 entra pelo custo declarado no IR.

const fmtN = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtQ = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:8});
const fmtX = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtP = new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
const N = v => v==null||isNaN(v) ? '–' : Math.abs(v) < 0.005 ? '–' : fmtN.format(v);
const R = v => 'R$ '+fmtN.format(v);
const U = v => 'US$ '+fmtN.format(v);
const Q = v => v==null ? '' : fmtQ.format(v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dBR = iso => iso ? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4) : '';
const sum = a => a.reduce((x,y)=>x+y,0);
const $ = id => document.getElementById(id);
const hojeISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const cls = v => v < -0.005 ? ' neg' : '';

export const INV_VIEWS = [
  ['inv-carteira','Carteira','<path d="M2.5 5.5h11v8h-11zM5 5.5V3.5h6v2"/><path d="M2.5 9h11"/>'],
  ['inv-movimentos','Movimentos','<path d="M3 5h9m0 0-2.5-2.5M12 5l-2.5 2.5M13 11H4m0 0 2.5-2.5M4 11l2.5 2.5"/>'],
  ['inv-ir','Imposto de renda','<path d="M4 2.5h6l2.5 2.5v8.5H4z"/><path d="M6.5 8h4M6.5 10.5h4"/>'],
];
const TIPOS = {
  compra:'Compra', venda:'Venda', cambio_entrada:'Envio de reais (câmbio)', cambio_saida:'Remessa para o Brasil',
  dividendo:'Dividendo', imposto_retido:'Imposto retido', jcp:'JCP', rendimento:'Rendimento (FII)', taxa:'Taxa', saldo_inicial:'Posição inicial',
};
const ORDEM = {saldo_inicial:0,cambio_entrada:1,dividendo:2,jcp:2,rendimento:2,imposto_retido:3,venda:4,compra:5,taxa:6,cambio_saida:7};

let api, toast, I = null;
const filtro = {cid:'', tipo:'', ano:''};
let anoIR = null;
const ler = (k,pad) => { try{ return localStorage.getItem(k) || pad; }catch{ return pad; } };
const gravar = (k,v) => { try{ localStorage.setItem(k,v); }catch{} };
let modoPtax = ler('inv.modoPtax','compra');

/* ---------- cálculo ---------- */
const corretora = id => I.corretoras.find(c=>c.id===id);
const ativo = id => I.ativos.find(a=>a.id===id);
const emDolar = cid => corretora(cid)?.moeda === 'USD';
// PTAX do dia ou, em fim de semana e feriado, do último dia útil anterior.
function ptaxEm(iso){
  let r=null;
  for(const p of I.ptax){ if(p.d<=iso) r=p; else break; }
  return r;
}
const taxa = (iso, modo=modoPtax) => { const p=ptaxEm(iso); return p ? (modo==='venda'?p.v:p.c) : null; };

function calcular(ate){
  const caixa={}, pos={}, vendas=[], rends=[], taxas=[], faltaPtax=new Set();
  const cx = cid => caixa[cid] ??= {cid, usd:0, brl:0};
  const ps = (cid,aid) => pos[cid+'|'+aid] ??= {cid, aid, q:0, usd:0, brl:0};
  const movs=[...I.movs].sort((a,b)=>a.d.localeCompare(b.d)||ORDEM[a.tipo]-ORDEM[b.tipo]||a.id-b.id);
  for(const m of movs){
    if(ate && m.d>ate) break;
    const usd=emDolar(m.cid), c=cx(m.cid);
    let px=1;
    if(usd && m.tipo!=='saldo_inicial' && m.tipo!=='cambio_entrada'){ px=taxa(m.d); if(px==null){ faltaPtax.add(m.d); px=NaN; } }
    const medio = () => !usd ? 1 : c.usd>0.005 ? c.brl/c.usd : px;
    const v=m.v;
    switch(m.tipo){
      case 'saldo_inicial':
        if(m.aid){ const p=ps(m.cid,m.aid); p.q+=m.q; p.usd+=usd?v:0; p.brl+=m.vb??v; }
        else if(usd){ c.usd+=v; c.brl+=m.vb??0; }
        break;
      case 'cambio_entrada': c.usd+=v; c.brl+=m.vb; break;
      case 'compra': { const r=medio(), p=ps(m.cid,m.aid); p.q+=m.q; p.usd+=usd?v:0; p.brl+=v*r; if(usd){ c.usd-=v; c.brl-=v*r; } break; }
      case 'venda': {
        const p=ps(m.cid,m.aid), fr=p.q>0?Math.min(1,m.q/p.q):0, cu=p.usd*fr, cb=p.brl*fr, rb=v*px;
        p.q-=m.q; p.usd-=cu; p.brl-=cb; if(p.q<1e-9){ p.q=0; p.usd=0; p.brl=0; }
        vendas.push({m, px, receitaBrl:rb, custoUsd:cu, custoBrl:cb, ganhoUsd:usd?v-cu:null, ganhoBrl:rb-cb});
        if(usd){ c.usd+=v; c.brl+=rb; }
        break;
      }
      case 'dividendo': case 'jcp': case 'rendimento':
        rends.push({m, px, brl:v*px}); if(usd){ c.usd+=v; c.brl+=v*px; } break;
      case 'imposto_retido':
        rends.push({m, px, brl:v*px}); if(usd){ c.usd-=v; c.brl-=v*px; } break;
      case 'taxa': { const r=medio(); taxas.push({m, brl:v*r}); if(usd){ c.usd-=v; c.brl-=v*r; } break; }
      case 'cambio_saida': { const r=medio(); if(usd){ c.usd-=v; c.brl-=v*r; } break; }
    }
    if(Math.abs(c.usd)<0.005){ c.usd=0; c.brl=0; }
  }
  return {caixa, pos:Object.values(pos).filter(p=>p.q>1e-9), vendas, rends, taxas, faltaPtax};
}

/* ---------- carga e gravação ---------- */
export function iniciarInv(apiDados, toastFn){ api=apiDados; toast=toastFn; I=null; Object.assign(filtro,{cid:'',tipo:'',ano:''}); anoIR=null; }
export async function carregarInv(){
  I = await api.carregarInv();
  renderInv();
}
let fila=Promise.resolve();
function gravarInv(fn, msg, depois){
  document.body.style.cursor='progress';
  fila=fila.then(async()=>{
    try{ const r=await fn(); depois?.(); I=await api.carregarInv(); renderInv(); toast(typeof msg==='function'?msg(r):msg); }
    catch(e){ toast(e?.message||String(e), true); }
    finally{ document.body.style.cursor=''; }
  });
  return fila;
}
const simbolo = a => a.moeda==='BRL' ? a.codigo+'.SA' : a.codigo;
function atualizarMercado(){
  const calc=calcular(), emCarteira=new Set(calc.pos.map(p=>p.aid));
  const simbolos=I.ativos.filter(a=>emCarteira.has(a.id)).map(a=>({id:a.id, simbolo:simbolo(a)}));
  const ultima=I.ptax.length?I.ptax[I.ptax.length-1].d:null;
  const primeiro=I.movs.reduce((m,x)=>x.d<m?x.d:m, hojeISO());
  const de = ultima && ultima>=primeiro ? ultima : primeiro;
  return gravarInv(()=>api.invAtualizarMercado(simbolos, de), r=>
    `Cotações atualizadas (${r.cotacoes}${r.faltaram?`; ${r.faltaram} sem resposta`:''}). `+(r.erroPtax?`Dólar: ${r.erroPtax}.`:`Dólar do Banco Central: ${r.ptax} dia(s) conferido(s).`));
}

export function renderInv(){
  if(!$('v-inv-carteira')) return;
  if(!I){ for(const [k] of INV_VIEWS) $('v-'+k).innerHTML='<div class="panel"><span class="muted">Carregando investimentos…</span></div>'; return; }
  renderCarteira(); renderMovs(); renderIR();
}

/* ---------- Carteira ---------- */
function renderCarteira(){
  const calc=calcular(), ultP=I.ptax[I.ptax.length-1], dolar=ultP?.c ?? NaN;
  const blocos=I.corretoras.map(c=>{
    const usd=c.moeda==='USD';
    const linhas=calc.pos.filter(p=>p.cid===c.id).map(p=>{
      const a=ativo(p.aid), cot=I.cotacoes[p.aid], preco=cot?.preco ?? NaN;
      const valor=p.q*preco, valorBrl=usd?valor*dolar:valor;
      return {p, a, cot, preco, valor, valorBrl, resUsd:usd?valor-p.usd:null, resBrl:valorBrl-p.brl};
    }).sort((x,y)=>(y.valorBrl||0)-(x.valorBrl||0));
    const cx=calc.caixa[c.id];
    if(!linhas.length && !(cx&&Math.abs(cx.usd)>0.005)) return null;
    return {c, usd, linhas, cx};
  }).filter(Boolean);
  const todas=blocos.flatMap(b=>b.linhas);
  const caixaUsd=sum(blocos.map(b=>b.cx?.usd||0)), caixaBrlCusto=sum(blocos.map(b=>b.cx?.brl||0));
  const totalBrl=sum(todas.map(l=>l.valorBrl))+caixaUsd*dolar, custoBrl=sum(todas.map(l=>l.p.brl))+caixaBrlCusto;
  const totalUsd=sum(blocos.filter(b=>b.usd).flatMap(b=>b.linhas).map(l=>l.valor))+caixaUsd;
  const ano=hojeISO().slice(0,4);
  const divAno=calc.rends.filter(r=>r.m.d.slice(0,4)===ano&&emDolar(r.m.cid));
  const divLiq=sum(divAno.map(r=>r.m.tipo==='imposto_retido'?-r.m.v:r.m.v));
  const atualizado=Object.values(I.cotacoes).reduce((m,c)=>c.em>m?c.em:m,'');
  const head=usd=>usd
    ? `<tr><th>Ativo</th><th class="v">Quantidade</th><th class="v">Preço médio</th><th class="v">Custo US$</th><th class="v">Custo R$</th><th class="v">Cotação</th><th class="v">Valor US$</th><th class="v">Valor R$</th><th class="v">Resultado US$</th><th class="v">Resultado R$</th></tr>`
    : `<tr><th>Ativo</th><th class="v">Quantidade</th><th class="v">Preço médio</th><th class="v">Custo R$</th><th class="v">Cotação</th><th class="v">Valor R$</th><th class="v">Resultado R$</th><th class="v">%</th></tr>`;
  const linha=(l,usd)=>usd
    ? `<tr><td><b>${esc(l.a.codigo)}</b><div class="muted small">${esc(l.a.nome)}</div></td><td class="v">${Q(l.p.q)}</td><td class="v">${N(l.p.usd/l.p.q)}</td><td class="v">${N(l.p.usd)}</td><td class="v">${N(l.p.brl)}</td><td class="v">${N(l.preco)}</td><td class="v">${N(l.valor)}</td><td class="v">${N(l.valorBrl)}</td><td class="v${cls(l.resUsd)}">${N(l.resUsd)}</td><td class="v${cls(l.resBrl)}">${N(l.resBrl)}</td></tr>`
    : `<tr><td><b>${esc(l.a.codigo)}</b><div class="muted small">${esc(l.a.nome)}</div></td><td class="v">${Q(l.p.q)}</td><td class="v">${N(l.p.brl/l.p.q)}</td><td class="v">${N(l.p.brl)}</td><td class="v">${N(l.preco)}</td><td class="v">${N(l.valorBrl)}</td><td class="v${cls(l.resBrl)}">${N(l.resBrl)}</td><td class="v${cls(l.resBrl)}">${l.p.brl?fmtP.format(l.resBrl/l.p.brl):'–'}</td></tr>`;
  const bloco=b=>{
    const t=k=>sum(b.linhas.map(l=>typeof k==='function'?k(l):l[k]));
    const cx=b.cx&&Math.abs(b.cx.usd)>0.005?b.cx:null;
    const cxLinha=cx?`<tr><td><b>Caixa em dólar</b><div class="muted small">Câmbio médio pago: ${fmtX.format(cx.brl/cx.usd)}</div></td><td class="v"></td><td class="v"></td><td class="v">${N(cx.usd)}</td><td class="v">${N(cx.brl)}</td><td class="v"></td><td class="v">${N(cx.usd)}</td><td class="v">${N(cx.usd*dolar)}</td><td class="v"></td><td class="v${cls(cx.usd*dolar-cx.brl)}">${N(cx.usd*dolar-cx.brl)}</td></tr>`:'';
    const foot=b.usd
      ? `<tr class="tot"><td><b>Total</b></td><td></td><td></td><td class="v"><b>${N(t(l=>l.p.usd)+(cx?.usd||0))}</b></td><td class="v"><b>${N(t(l=>l.p.brl)+(cx?.brl||0))}</b></td><td></td><td class="v"><b>${N(t('valor')+(cx?.usd||0))}</b></td><td class="v"><b>${N(t('valorBrl')+(cx?.usd||0)*dolar)}</b></td><td class="v"><b>${N(t('resUsd'))}</b></td><td class="v"><b>${N(t('resBrl')+(cx?cx.usd*dolar-cx.brl:0))}</b></td></tr>`
      : `<tr class="tot"><td><b>Total</b></td><td></td><td></td><td class="v"><b>${N(t(l=>l.p.brl))}</b></td><td></td><td class="v"><b>${N(t('valorBrl'))}</b></td><td class="v"><b>${N(t('resBrl'))}</b></td><td></td></tr>`;
    return `<div class="panel"><div class="panel-h"><h2>${esc(b.c.nome)}</h2><span class="muted small">${esc(b.c.obs)}${b.usd?' · valores em dólar':' · valores em reais'}</span></div>
      <div class="tbl-wrap" style="background:none;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none"><table><thead>${head(b.usd)}</thead><tbody>${b.linhas.map(l=>linha(l,b.usd)).join('')}${cxLinha}${foot}</tbody></table></div></div>`;
  };
  $('v-inv-carteira').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Carteira</h1><p>Investimentos para o futuro da filha · separados das finanças pessoais</p></div>
      <button class="btn" id="inv-atualizar" type="button">Atualizar cotações e dólar</button></div>
    ${calc.faltaPtax.size?`<div class="banner"><b>Falta o dólar oficial de ${calc.faltaPtax.size} dia(s).</b><span>Clique em "Atualizar cotações e dólar" para buscar no Banco Central.</span></div>`:''}
    <div class="grid g-kpi">
      <div class="panel kpi"><span class="eyebrow">Patrimônio</span><span class="big">${R(totalBrl)}</span><span class="sub">Dólar a ${isNaN(dolar)?'–':fmtX.format(dolar)} (PTAX de ${dBR(ultP?.d)})</span></div>
      <div class="panel kpi"><span class="eyebrow">Em dólar</span><span class="big">${U(totalUsd)}</span><span class="sub">Inter e Avenue, com o caixa</span></div>
      <div class="panel kpi"><span class="eyebrow">Resultado</span><span class="big ${totalBrl-custoBrl>=0?'up':'down'}">${R(totalBrl-custoBrl)}</span><span class="sub">Sobre ${R(custoBrl)} de custo em reais${custoBrl?' · '+fmtP.format((totalBrl-custoBrl)/custoBrl):''}</span></div>
      <div class="panel kpi"><span class="eyebrow">Dividendos ${ano}</span><span class="big">${U(divLiq)}</span><span class="sub">Líquidos do imposto retido nos EUA</span></div>
    </div>
    ${blocos.map(bloco).join('')}
    <div class="note">Cotações de ${atualizado?new Date(atualizado).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'–'}. O custo em reais é o que de fato saiu do bolso: os dólares comprados (com IOF) pelo custo médio; o que já existia em 31/12/2025 entra pelo valor declarado no IR. O resultado em reais inclui a variação do dólar.</div>
  </div>`;
  $('inv-atualizar').onclick=atualizarMercado;
}

/* ---------- Movimentos ---------- */
const CAMPOS = { // quais campos cada tipo usa
  compra:['ativo','q','p','v','liq'], venda:['ativo','q','p','v','liq'], cambio_entrada:['v','vb','iof'], cambio_saida:['v','vb'],
  dividendo:['ativo','v'], imposto_retido:['ativo','v'], jcp:['ativo','v'], rendimento:['ativo','v'], taxa:['v'],
};
function parseNum(s){
  s=String(s||'').trim().replace(/^(R\$|US\$)\s*/,'');
  if(!s) return null;
  if(/^-?\d+(\.\d+)?$/.test(s)) return +s;
  if(/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)||/^-?\d+(,\d+)?$/.test(s)) return +s.replace(/\./g,'').replace(',','.');
  return NaN;
}
function renderMovs(){
  const anos=[...new Set(I.movs.map(m=>m.d.slice(0,4)))].sort().reverse();
  const lista=I.movs.filter(m=>(!filtro.cid||m.cid==filtro.cid)&&(!filtro.tipo||m.tipo===filtro.tipo)&&(!filtro.ano||m.d.slice(0,4)===filtro.ano))
    .sort((a,b)=>b.d.localeCompare(a.d)||b.id-a.id);
  const opt=(v,l,sel)=>`<option value="${esc(v)}"${String(sel)===String(v)?' selected':''}>${esc(l)}</option>`;
  const moeda=m=>emDolar(m.cid)?'US$':'R$';
  $('v-inv-movimentos').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Movimentos</h1><p>Compras, vendas, dólar enviado, dividendos e taxas</p></div></div>
    <div class="panel"><h2>Lançar movimento</h2>
      <form class="form-row" id="im-form">
        <div class="field" style="flex:0 1 150px"><label for="im-c">Corretora</label><select id="im-c">${I.corretoras.filter(c=>c.ativa).map(c=>opt(c.id,c.nome,I.corretoras[0].id)).join('')}</select></div>
        <div class="field" style="flex:0 1 200px"><label for="im-t">Tipo</label><select id="im-t">${Object.keys(CAMPOS).map(k=>opt(k,TIPOS[k],'compra')).join('')}</select></div>
        <div class="field" style="flex:0 1 150px"><label for="im-d">Data</label><input type="date" id="im-d" value="${hojeISO()}" required></div>
        <div class="field" data-f="ativo" style="flex:0 1 150px"><label for="im-a">Ativo</label><select id="im-a"></select></div>
        <div class="field" data-f="q" style="flex:0 1 130px"><label for="im-q">Quantidade</label><input type="text" id="im-q" inputmode="decimal" placeholder="0,00000000"></div>
        <div class="field" data-f="p" style="flex:0 1 120px"><label for="im-p">Preço</label><input type="text" id="im-p" inputmode="decimal" placeholder="0,00"></div>
        <div class="field" data-f="v" style="flex:0 1 130px"><label for="im-v" id="im-v-l">Valor</label><input type="text" id="im-v" class="money" inputmode="decimal" placeholder="0,00"></div>
        <div class="field" data-f="vb" style="flex:0 1 150px"><label for="im-vb" id="im-vb-l">Reais pagos (com IOF)</label><input type="text" id="im-vb" class="money" inputmode="decimal" placeholder="0,00"></div>
        <div class="field" data-f="iof" style="flex:0 1 110px"><label for="im-iof">IOF</label><input type="text" id="im-iof" class="money" inputmode="decimal" placeholder="0,00"></div>
        <div class="field" data-f="liq" style="flex:0 1 150px"><label for="im-liq">Liquidação</label><input type="date" id="im-liq"></div>
        <div class="field"><label for="im-o">Observação</label><input type="text" id="im-o" maxlength="300" placeholder="Opcional"></div>
        <button class="btn primary" type="submit">Gravar</button>
      </form>
      <span class="muted small" id="im-dica"></span>
      <details><summary class="muted small" style="cursor:pointer">Cadastrar um ativo novo</summary>
        <form class="form-row" id="ia-form" style="margin-top:10px">
          <div class="field" style="flex:0 1 120px"><label for="ia-cod">Código</label><input type="text" id="ia-cod" maxlength="12" placeholder="Ex.: VOO" required></div>
          <div class="field"><label for="ia-nome">Nome</label><input type="text" id="ia-nome" maxlength="120" required></div>
          <div class="field" style="flex:0 1 110px"><label for="ia-tipo">Tipo</label><select id="ia-tipo">${['ETF','Ação','FII','ETN'].map(t=>opt(t,t,'ETF')).join('')}</select></div>
          <div class="field" style="flex:0 1 110px"><label for="ia-moeda">Moeda</label><select id="ia-moeda">${opt('USD','Dólar','USD')}${opt('BRL','Real','USD')}</select></div>
          <button class="btn" type="submit">Cadastrar</button>
        </form></details>
    </div>
    <div class="toolbar">
      <select id="if-c" aria-label="Corretora">${opt('','Todas as corretoras',filtro.cid)}${I.corretoras.map(c=>opt(c.id,c.nome,filtro.cid)).join('')}</select>
      <select id="if-t" aria-label="Tipo">${opt('','Todos os tipos',filtro.tipo)}${Object.entries(TIPOS).map(([k,l])=>opt(k,l,filtro.tipo)).join('')}</select>
      <select id="if-a" aria-label="Ano">${opt('','Todos os anos',filtro.ano)}${anos.map(a=>opt(a,a,filtro.ano)).join('')}</select>
      <span class="muted small">${lista.length} movimento(s)</span>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Corretora</th><th>Tipo</th><th>Ativo</th><th class="v">Quantidade</th><th class="v">Preço</th><th class="v">Valor</th><th class="v">Reais</th><th>Observação</th><th></th></tr></thead><tbody>
      ${lista.map(m=>`<tr><td class="num">${dBR(m.d)}</td><td>${esc(corretora(m.cid)?.nome)}</td><td>${TIPOS[m.tipo]||esc(m.tipo)}</td><td>${m.aid?esc(ativo(m.aid)?.codigo):''}</td>
        <td class="v">${Q(m.q)}</td><td class="v">${m.p!=null?N(m.p):''}</td><td class="v${m.tipo==='saldo_inicial'?cls(m.v):''}">${moeda(m)} ${N(m.v)}</td><td class="v">${m.vb!=null?N(m.vb):''}</td>
        <td class="small">${esc([m.obs,m.doc].filter(Boolean).join(' · '))}</td><td>${m.tipo==='saldo_inicial'?'':`<button class="linkbtn" type="button" data-del-im="${m.id}">excluir</button>`}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
  const f=$('im-form');
  const ajustar=()=>{
    const t=$('im-t').value, campos=CAMPOS[t], c=corretora(+$('im-c').value), usd=c?.moeda==='USD';
    f.querySelectorAll('[data-f]').forEach(el=>el.hidden=!campos.includes(el.dataset.f));
    if(!usd){ f.querySelector('[data-f="vb"]').hidden=true; f.querySelector('[data-f="iof"]').hidden=true; }
    const atual=$('im-a').value;
    $('im-a').innerHTML=I.ativos.filter(a=>a.moeda===c?.moeda).map(a=>opt(a.id,a.codigo,atual)).join('');
    $('im-v-l').textContent=t==='cambio_entrada'?'Dólares recebidos (US$)':t==='cambio_saida'?'Dólares enviados (US$)':`Valor (${usd?'US$':'R$'})`;
    $('im-vb-l').textContent=t==='cambio_saida'?'Reais recebidos (opcional)':'Reais debitados (com IOF)';
    $('im-dica').textContent={compra:'O valor é preenchido sozinho com quantidade × preço; ajuste se a corretora mostrar outro total.',
      cambio_entrada:'Lance cada conversão de reais para dólar: o total debitado na conta (com IOF) e os dólares que chegaram.',
      venda:'O custo da venda sai pelo preço médio; o ganho em reais aparece na tela de imposto de renda.'}[t]||'';
  };
  $('im-c').onchange=ajustar; $('im-t').onchange=ajustar; ajustar();
  const auto=()=>{ const q=parseNum($('im-q').value), p=parseNum($('im-p').value); if(q>0&&p>0) $('im-v').value=fmtN.format(Math.round(q*p*100)/100); };
  $('im-q').oninput=auto; $('im-p').oninput=auto;
  f.onsubmit=e=>{ e.preventDefault();
    const t=$('im-t').value, campos=CAMPOS[t], cid=+$('im-c').value, usd=emDolar(cid), d=$('im-d').value;
    const val=id=>parseNum($(id).value);
    const m={corretora_id:cid, tipo:t, data:d, ativo_id:campos.includes('ativo')?+$('im-a').value||null:null,
      quantidade:campos.includes('q')?val('im-q'):null, preco:campos.includes('p')?val('im-p'):null, valor:val('im-v'),
      valor_brl:campos.includes('vb')&&usd?val('im-vb'):null, iof:campos.includes('iof')&&usd?val('im-iof'):null,
      data_liquidacao:campos.includes('liq')&&$('im-liq').value?$('im-liq').value:null, observacao:$('im-o').value.trim()||null};
    if(!d){ toast('Informe a data.'); return; }
    if(campos.includes('ativo')&&!m.ativo_id){ toast('Escolha o ativo (ou cadastre um novo).'); return; }
    for(const [k,l] of [['quantidade','a quantidade'],['preco','o preço'],['valor','o valor'],['valor_brl','os reais'],['iof','o IOF']]){
      if(m[k]!=null&&(isNaN(m[k])||m[k]<0)){ toast(`Confira ${l}.`); return; }
    }
    if(!(m.valor>0)){ toast('Informe o valor.'); return; }
    if((t==='compra'||t==='venda')&&!(m.quantidade>0)){ toast('Informe a quantidade.'); return; }
    if(t==='cambio_entrada'&&!(m.valor_brl>0)){ toast('Informe os reais debitados na conta.'); return; }
    if(t==='venda'){ const p=calcular().pos.find(x=>x.cid===cid&&x.aid===m.ativo_id); if(!p||m.quantidade>p.q+1e-8){ toast(`A carteira tem ${Q(p?.q||0)} desse ativo nessa corretora.`, true); return; } }
    gravarInv(()=>api.invMovimento(m), `${TIPOS[t]} gravado.`, ()=>{ ['im-q','im-p','im-v','im-vb','im-iof','im-o','im-liq'].forEach(id=>$(id).value=''); });
  };
  $('ia-form').onsubmit=e=>{ e.preventDefault();
    const codigo=$('ia-cod').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{1,12}$/.test(codigo)){ toast('Código: só letras e números, sem ".SA".'); return; }
    gravarInv(()=>api.invNovoAtivo({codigo, nome:$('ia-nome').value.trim(), tipo:$('ia-tipo').value, moeda:$('ia-moeda').value}), `Ativo ${codigo} cadastrado.`);
  };
  $('if-c').onchange=e=>{ filtro.cid=e.target.value; renderMovs(); };
  $('if-t').onchange=e=>{ filtro.tipo=e.target.value; renderMovs(); };
  $('if-a').onchange=e=>{ filtro.ano=e.target.value; renderMovs(); };
  $('v-inv-movimentos').querySelectorAll('[data-del-im]').forEach(b=>b.onclick=()=>{
    const m=I.movs.find(x=>x.id==b.dataset.delIm);
    if(!confirm(`Excluir ${TIPOS[m.tipo].toLowerCase()} de ${dBR(m.d)}${m.aid?' · '+ativo(m.aid).codigo:''} (${N(m.v)})?`)) return;
    gravarInv(()=>api.invExcluirMovimento(m.id), 'Movimento excluído.');
  });
}

/* ---------- Imposto de renda ---------- */
function renderIR(){
  const anos=[...new Set(I.movs.filter(m=>m.tipo!=='saldo_inicial').map(m=>m.d.slice(0,4)))].sort().reverse();
  if(!anoIR||!anos.includes(anoIR)) anoIR=anos[0]||hojeISO().slice(0,4);
  const fimAnt=`${+anoIR-1}-12-31`, fim=`${anoIR}-12-31`;
  const antes=calcular(fimAnt), depois=calcular(fim);
  const doAno=x=>x.m.d.slice(0,4)===anoIR;
  const vendas=depois.vendas.filter(doAno), rends=depois.rends.filter(doAno);
  const falta=[...depois.faltaPtax].filter(d=>d.slice(0,4)===anoIR);
  const parcial=hojeISO()<fim;
  // Bens e direitos: todo ativo que estava em carteira em algum dos dois 31/12.
  const chaves=new Map();
  for(const [k,calc] of [['a',antes],['d',depois]]) for(const p of calc.pos) (chaves.get(p.cid+'|'+p.aid) ?? chaves.set(p.cid+'|'+p.aid,{cid:p.cid,aid:p.aid}).get(p.cid+'|'+p.aid))[k]=p;
  const bens=[...chaves.values()].sort((x,y)=>x.cid-y.cid||ativo(x.aid).codigo.localeCompare(ativo(y.aid).codigo));
  const ptaxFim=ptaxEm(fim), ptaxFimAnt=ptaxEm(fimAnt);
  const caixas=I.corretoras.filter(c=>c.moeda==='USD').map(c=>({c, a:antes.caixa[c.id], d:depois.caixa[c.id]})).filter(x=>Math.abs(x.a?.usd||0)>0.005||Math.abs(x.d?.usd||0)>0.005);
  const opt=(v,l,sel)=>`<option value="${esc(v)}"${String(sel)===String(v)?' selected':''}>${esc(l)}</option>`;
  const tv=(a,k)=>sum(a.map(k));
  // Dividendos no exterior: junta o dividendo e o imposto do mesmo dia e ativo.
  const div={};
  for(const r of rends.filter(r=>emDolar(r.m.cid))){
    const k=r.m.d+'|'+r.m.cid+'|'+r.m.aid, x=div[k] ??= {d:r.m.d, cid:r.m.cid, aid:r.m.aid, px:r.px, bruto:0, imp:0};
    if(r.m.tipo==='imposto_retido') x.imp+=r.m.v; else x.bruto+=r.m.v;
  }
  const divs=Object.values(div).sort((a,b)=>a.d.localeCompare(b.d));
  const br=rends.filter(r=>!emDolar(r.m.cid));
  const brPorAtivo={};
  for(const r of br){ const x=brPorAtivo[r.m.aid+'|'+r.m.tipo] ??= {aid:r.m.aid, tipo:r.m.tipo, v:0, n:0}; x.v+=r.m.v; x.n++; }
  $('v-inv-ir').innerHTML=`<div class="wrap" style="gap:16px">
    <div class="head"><div><h1>Imposto de renda ${esc(anoIR)}</h1><p>Números para conferir com os informes das corretoras${parcial?' · ano ainda em andamento':''}</p></div>
      <div class="toolbar"><select id="ir-ano" aria-label="Ano">${anos.map(a=>opt(a,a,anoIR)).join('')}</select>
        <label class="muted small" for="ir-ptax">Vendas e dividendos pela PTAX de</label><select id="ir-ptax">${opt('compra','compra',modoPtax)}${opt('venda','venda',modoPtax)}</select></div></div>
    ${falta.length?`<div class="banner"><b>Falta o dólar oficial de ${falta.length} dia(s).</b><span>Use "Atualizar cotações e dólar" na Carteira.</span></div>`:''}
    <div class="panel"><h2>Bens e direitos</h2>
      <div class="tbl-wrap" style="background:none;border:0;box-shadow:none"><table><thead><tr><th>Corretora</th><th>Ativo</th><th class="v">Qtd 31/12/${+anoIR-1}</th><th class="v">Custo R$ 31/12/${+anoIR-1}</th><th class="v">Qtd 31/12/${anoIR}</th><th class="v">Custo US$ 31/12/${anoIR}</th><th class="v">Custo R$ 31/12/${anoIR}</th></tr></thead><tbody>
        ${bens.map(b=>`<tr><td>${esc(corretora(b.cid).nome)}</td><td><b>${esc(ativo(b.aid).codigo)}</b></td><td class="v">${Q(b.a?.q)}</td><td class="v">${N(b.a?.brl)}</td><td class="v">${Q(b.d?.q)||'vendido'}</td><td class="v">${emDolar(b.cid)?N(b.d?.usd):''}</td><td class="v">${N(b.d?.brl)}</td></tr>`).join('')}
        ${caixas.map(x=>`<tr><td>${esc(x.c.nome)}</td><td><b>Saldo em dólar</b><div class="muted small">31/12/${anoIR}: US$ ${N(x.d?.usd)} × PTAX compra ${ptaxFim?fmtX.format(ptaxFim.c):'–'} = R$ ${ptaxFim?N((x.d?.usd||0)*ptaxFim.c):'–'}</div></td><td class="v">US$ ${N(x.a?.usd)}</td><td class="v">${ptaxFimAnt?N((x.a?.usd||0)*ptaxFimAnt.c):'–'}</td><td class="v"></td><td class="v">${N(x.d?.usd)}</td><td class="v">${N(x.d?.brl)}<div class="muted small">custo</div></td></tr>`).join('')}
      </tbody></table></div>
      <span class="note">Custo em R$ = valor declarado em 31/12/2025 mais as compras pelo custo dos dólares (com IOF). Saldo em dólar: o IR anterior usou a PTAX de compra de 31/12; o custo dos dólares aparece ao lado para comparação.</span></div>
    <div class="panel"><h2>Vendas no exterior</h2>
      ${vendas.filter(v=>emDolar(v.m.cid)).length?`<div class="tbl-wrap" style="background:none;border:0;box-shadow:none"><table><thead><tr><th>Pregão</th><th>Corretora</th><th>Ativo</th><th class="v">Quantidade</th><th class="v">Venda US$</th><th class="v">PTAX</th><th class="v">Venda R$</th><th class="v">Custo R$</th><th class="v">Resultado R$</th><th class="v">Resultado US$</th></tr></thead><tbody>
        ${vendas.filter(v=>emDolar(v.m.cid)).map(v=>`<tr><td class="num">${dBR(v.m.d)}</td><td>${esc(corretora(v.m.cid).nome)}</td><td><b>${esc(ativo(v.m.aid).codigo)}</b></td><td class="v">${Q(v.m.q)}</td><td class="v">${N(v.m.v)}</td><td class="v">${isNaN(v.px)?'–':fmtX.format(v.px)}</td><td class="v">${N(v.receitaBrl)}</td><td class="v">${N(v.custoBrl)}</td><td class="v${cls(v.ganhoBrl)}">${N(v.ganhoBrl)}</td><td class="v${cls(v.ganhoUsd)}">${N(v.ganhoUsd)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="4"><b>Total</b></td><td class="v"><b>${N(tv(vendas.filter(v=>emDolar(v.m.cid)),v=>v.m.v))}</b></td><td></td><td class="v"><b>${N(tv(vendas.filter(v=>emDolar(v.m.cid)),v=>v.receitaBrl))}</b></td><td class="v"><b>${N(tv(vendas.filter(v=>emDolar(v.m.cid)),v=>v.custoBrl))}</b></td><td class="v"><b>${N(tv(vendas.filter(v=>emDolar(v.m.cid)),v=>v.ganhoBrl))}</b></td><td class="v"><b>${N(tv(vendas.filter(v=>emDolar(v.m.cid)),v=>v.ganhoUsd))}</b></td></tr>
      </tbody></table></div>`:'<span class="muted">Nenhuma venda no exterior neste ano.</span>'}
      <span class="note">Custo pelo preço médio em reais. A venda é convertida pela PTAX de ${modoPtax} da data do pregão (troque acima se a regra que você usa for outra).</span></div>
    <div class="panel"><h2>Dividendos no exterior</h2>
      ${divs.length?`<div class="tbl-wrap" style="background:none;border:0;box-shadow:none"><table><thead><tr><th>Data</th><th>Corretora</th><th>Ativo</th><th class="v">Bruto US$</th><th class="v">Imposto US$</th><th class="v">PTAX</th><th class="v">Bruto R$</th><th class="v">Imposto R$</th></tr></thead><tbody>
        ${divs.map(x=>`<tr><td class="num">${dBR(x.d)}</td><td>${esc(corretora(x.cid).nome)}</td><td>${esc(ativo(x.aid).codigo)}</td><td class="v">${N(x.bruto)}</td><td class="v">${N(x.imp)}</td><td class="v">${isNaN(x.px)?'–':fmtX.format(x.px)}</td><td class="v">${N(x.bruto*x.px)}</td><td class="v">${N(x.imp*x.px)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="3"><b>Total</b></td><td class="v"><b>${N(tv(divs,x=>x.bruto))}</b></td><td class="v"><b>${N(tv(divs,x=>x.imp))}</b></td><td></td><td class="v"><b>${N(tv(divs,x=>x.bruto*x.px))}</b></td><td class="v"><b>${N(tv(divs,x=>x.imp*x.px))}</b></td></tr>
      </tbody></table></div>`:'<span class="muted">Nenhum dividendo no exterior neste ano.</span>'}
      <span class="note">Imposto retido nos EUA (30%). Convertido pela PTAX de ${modoPtax} da data do pagamento.</span></div>
    <div class="panel"><h2>Proventos no Brasil (B3)</h2>
      ${br.length?`<div class="tbl-wrap" style="background:none;border:0;box-shadow:none"><table><thead><tr><th>Ativo</th><th>Tipo</th><th class="v">Pagamentos</th><th class="v">Total R$</th></tr></thead><tbody>
        ${Object.values(brPorAtivo).map(x=>`<tr><td><b>${esc(ativo(x.aid).codigo)}</b></td><td>${x.tipo==='jcp'?'JCP (líquido, imposto já retido)':x.tipo==='rendimento'?'Rendimento de FII (isento)':'Dividendo (isento)'}</td><td class="v">${x.n}</td><td class="v">${N(x.v)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="3"><b>Total</b></td><td class="v"><b>${N(tv(br,r=>r.m.v))}</b></td></tr>
      </tbody></table></div>`:'<span class="muted">Nenhum provento no Brasil neste ano.</span>'}
      <span class="note">Créditos que caíram na conta do Inter ("Crédito Evento B3"). Confira com o informe de rendimentos de cada empresa.</span></div>
  </div>`;
  $('ir-ano').onchange=e=>{ anoIR=e.target.value; renderIR(); };
  $('ir-ptax').onchange=e=>{ modoPtax=e.target.value; gravar('inv.modoPtax',modoPtax); renderCarteira(); renderIR(); };
}
