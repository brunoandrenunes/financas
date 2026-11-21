// Metas e rotinas: checklist de hoje, semana das rotinas (com sequência e % do mês) e metas do ano
// (automáticas para leituras e treinos; personalizadas com valor atual informado à mão).
import { S, fmtP0, esc, $, hojeISO, dataDe, addDias, SEM_CURTA, opt, svg, ICONES, gravarPes, barraMeta,
  rotinasDoDia, marcada, dialogo, diaPorExtenso } from './pes-comum.js';

const mf = { ano: new Date().getFullYear() };
export function reiniciarMetas(){ mf.ano=new Date().getFullYear(); }

// Sequência: dias seguidos (programados) com a rotina feita, contando de hoje (ou ontem, se hoje ainda não marcou).
function sequencia(r){
  let d=hojeISO(), n=0;
  const vale=x=>r.dias.includes(dataDe(x).getDay()) && (!r.criado||r.criado<=x);
  if(vale(d)&&!marcada(r.id,d)) d=addDias(d,-1);
  for(let i=0;i<800;i++,d=addDias(d,-1)){ if(!vale(d)){ if(r.criado&&d<r.criado) break; continue; } if(!marcada(r.id,d)) break; n++; }
  return n;
}
// Cumprimento nos últimos 30 dias (só dias programados, depois de criada).
function cumprimento(r){
  let prog=0, feitos=0;
  for(let i=0;i<30;i++){ const d=addDias(hojeISO(),-i); if(!r.dias.includes(dataDe(d).getDay())||(r.criado&&d<r.criado)) continue; prog++; if(marcada(r.id,d)) feitos++; }
  return prog ? feitos/prog : null;
}
const diasTexto = dias => dias.length===7 ? 'todos os dias' : dias.join()==='1,2,3,4,5' ? 'dias úteis' : dias.join()==='0,6' ? 'fins de semana' : dias.map(d=>SEM_CURTA[d].toLowerCase()).join(', ');

// Lista de rotinas do dia com caixas de marcar. Também usada pela Agenda.
export function htmlChecklist(dia){
  const R=rotinasDoDia(dia), feitas=R.filter(r=>marcada(r.id,dia)).length, futuro=dia>hojeISO();
  if(!S.P.rotinas.length) return `<p class="muted small">Nenhuma rotina cadastrada. <a href="#pes-metas" class="linkbtn">Criar rotinas</a></p>`;
  if(!R.length) return `<p class="muted small">Nenhuma rotina para este dia.</p>`;
  return `<div class="check-topo"><b>${feitas} de ${R.length}</b><div class="minibar" style="flex:1"><i style="width:${feitas/R.length*100}%"></i></div></div>
    <ul class="checklist">${R.map(r=>{ const ok=marcada(r.id,dia);
      return `<li><button type="button" class="check${ok?' on':''}" data-marcar="${r.id}" data-dia="${dia}" aria-pressed="${ok}"${futuro?' disabled':''}><span class="caixa">${ok?svg(ICONES.ok):''}</span><span>${esc(r.nome)}</span></button></li>`; }).join('')}</ul>`;
}
// Clique numa caixa de rotina (em qualquer tela que use htmlChecklist).
export function tratarMarca(t){
  const id=+t.dataset.marcar, dia=t.dataset.dia, ok=t.getAttribute('aria-pressed')!=='true';
  if(dia>hojeISO()) return;
  t.classList.toggle('on',ok); t.setAttribute('aria-pressed',String(ok));
  gravarPes(()=>S.api.pesMarcar(id,dia,ok));
}

export function renderMetas(){
  const v=$('v-pes-metas'); if(!v) return;
  if(!S.P){ v.innerHTML='<div class="panel"><span class="muted">Carregando…</span></div>'; return; }
  const hoje=hojeISO(), ini=addDias(hoje,-dataDe(hoje).getDay()), semana=Array.from({length:7},(_,i)=>addDias(ini,i));
  const ativas=S.P.rotinas.filter(r=>r.ativa), arquivadas=S.P.rotinas.filter(r=>!r.ativa);
  v.innerHTML=`<div class="wrap" style="gap:18px">
    <div class="head"><div><h1>Metas e rotinas</h1><p>O que você quer fazer todo dia e aonde quer chegar no ano</p></div>
      <div class="toolbar"><button class="btn" type="button" id="pm-nova-rot">Nova rotina</button><button class="btn primary" type="button" id="pm-nova-meta">Nova meta</button></div></div>
    <div class="metas-topo">
      <div class="panel"><div class="panel-h"><h2>Hoje</h2><span class="muted small">${diaPorExtenso(hoje)}</span></div>${htmlChecklist(hoje)}</div>
      <div class="panel"><div class="panel-h"><h2>Rotinas da semana</h2><span class="muted small">Toque para marcar ou desmarcar</span></div>
        ${ativas.length?`<div class="tbl-rolagem"><table class="tbl-plain rot-semana"><thead><tr><th>Rotina</th>${semana.map(d=>`<th class="c${d===hoje?' hoje':''}">${SEM_CURTA[dataDe(d).getDay()].slice(0,1)}<small>${+d.slice(8,10)}</small></th>`).join('')}<th class="v" title="Dias seguidos">Seq.</th><th class="v" title="Últimos 30 dias">30d</th><th></th></tr></thead><tbody>
          ${ativas.map(r=>{ const c=cumprimento(r); return `<tr><td><b>${esc(r.nome)}</b><span class="muted small rot-dias">${diasTexto(r.dias)}</span></td>
            ${semana.map(d=>{ const vale=r.dias.includes(dataDe(d).getDay())&&(!r.criado||r.criado<=d), ok=marcada(r.id,d);
              return `<td class="c">${vale?`<button type="button" class="check mini${ok?' on':''}" data-marcar="${r.id}" data-dia="${d}" aria-pressed="${ok}" aria-label="${esc(r.nome)} em ${d}"${d>hoje?' disabled':''}><span class="caixa">${ok?svg(ICONES.ok):''}</span></button>`:'<span class="muted">·</span>'}</td>`; }).join('')}
            <td class="v">${sequencia(r)}</td><td class="v">${c==null?'–':fmtP0.format(c)}</td><td><button class="icon-btn" type="button" data-rotina="${r.id}" aria-label="Editar ${esc(r.nome)}">✎</button></td></tr>`; }).join('')}
          </tbody></table></div>${arquivadas.length?`<span class="note">${arquivadas.length} rotina(s) pausada(s): ${arquivadas.map(r=>`<button class="linkbtn" type="button" data-rotina="${r.id}">${esc(r.nome)}</button>`).join(', ')}</span>`:''}`
        :`<p class="muted">Crie rotinas como "Ler 20 páginas", "Beber 2 litros de água" ou "Meditar", escolhendo em que dias da semana valem. Depois é só marcar aqui ou na Agenda.</p>`}
      </div>
    </div>
    ${htmlMetas()}
  </div>`;
  ligar(v);
}

// Metas do ano: as de leituras e treinos se calculam sozinhas; as personalizadas usam o valor atual informado.
function cartoesMeta(ano){
  const lidos=S.P.livros.filter(l=>l.status==='lido'&&(l.fim?+l.fim.slice(0,4):l.ano)===ano);
  const treinos=S.P.treinos.filter(t=>+t.data.slice(0,4)===ano);
  const auto={
    'leituras/livros':{rot:'Livros lidos', feito:lidos.length, un:'livros', link:'pes-leituras'},
    'leituras/paginas':{rot:'Páginas lidas', feito:lidos.reduce((s,l)=>s+(l.paginas||0),0), un:'páginas', link:'pes-leituras'},
    'treinos/ano':{rot:'Treinos no ano', feito:treinos.length, un:'treinos', link:'pes-treinos'},
  };
  return S.P.metas.filter(m=>m.ano===ano&&!(m.area==='treinos'&&m.indicador==='semana')).map(m=>{
    const a=auto[`${m.area}/${m.indicador}`];
    return a ? {m, titulo:m.titulo||a.rot, feito:a.feito, un:a.un, auto:true, link:a.link} : {m, titulo:m.titulo||m.indicador, feito:m.atual||0, un:m.unidade, auto:false};
  });
}
function htmlMetas(){
  const anos=[...new Set([new Date().getFullYear(), new Date().getFullYear()+1, ...S.P.metas.map(m=>m.ano)])].sort((a,b)=>b-a);
  const C=cartoesMeta(mf.ano);
  return `<div class="panel"><div class="panel-h"><h2>Metas de ${mf.ano}</h2><select id="pm-ano" aria-label="Ano">${anos.map(a=>opt(a,a,mf.ano)).join('')}</select></div>
    ${C.length?`<div class="metas-grade">${C.map(c=>`<div class="meta-item">
        <div class="meta-item-h"><b>${esc(c.titulo)}</b><span class="pill ${c.auto?'good':'warn'}" title="${c.auto?'Calculada sozinha a partir dos registros':'Atualize o valor quando avançar'}">${c.auto?'automática':'manual'}</span></div>
        ${barraMeta(c.feito, c.m.alvo, c.un, mf.ano, {unidade:c.un})}
        <div class="toolbar">${c.auto?`<a class="linkbtn" href="#${c.link}">Ver detalhes</a>`:`<button class="btn" type="button" data-avancar="${c.m.id}">Atualizar valor</button>`}<button class="linkbtn" type="button" data-meta="${c.m.id}">Editar</button></div>
      </div>`).join('')}</div>`
    :`<p class="muted">Nenhuma meta para ${mf.ano}. Use "Nova meta": livros, páginas e treinos se calculam sozinhos; outras (viagem, curso, quilômetros, economia…) você atualiza à mão.</p>`}
    <span class="note">A meta semanal de treinos aparece na tela Treinos.</span></div>`;
}

function ligar(v){
  v.onclick=e=>{
    const t=e.target.closest('[data-marcar],[data-rotina],[data-meta],[data-avancar],#pm-nova-rot,#pm-nova-meta');
    if(!t||!v.contains(t)) return;
    if(t.dataset.marcar) return tratarMarca(t);
    if(t.id==='pm-nova-rot') return abrirRotina(null);
    if(t.id==='pm-nova-meta') return abrirMeta(null);
    if(t.dataset.rotina) return abrirRotina(+t.dataset.rotina);
    if(t.dataset.meta) return abrirMeta(+t.dataset.meta);
    if(t.dataset.avancar){ const m=S.P.metas.find(x=>x.id===+t.dataset.avancar); if(!m) return;
      const r=prompt(`Valor atual de "${m.titulo}"${m.unidade?` (${m.unidade})`:''}:`, m.atual??0); if(r==null) return;
      const n=Number(String(r).replace(/\./g,'').replace(',','.')); if(!(n>=0)){ S.toast('Valor inválido.'); return; }
      gravarPes(()=>S.api.pesMetaLivre(m.id,{titulo:m.titulo,alvo:m.alvo,atual:n,unidade:m.unidade||null}), n>=m.alvo?'Meta batida! Parabéns.':'Progresso salvo.'); }
  };
  $('pm-ano').onchange=e=>{ mf.ano=+e.target.value; renderMetas(); };
}

function abrirRotina(id){
  const novo=id==null, r=novo?{nome:'',dias:[0,1,2,3,4,5,6],ativa:true}:S.P.rotinas.find(x=>x.id===id);
  if(!r) return;
  const d=dialogo('pm-dlg','Rotina');
  d.innerHTML=`<form class="dlg-in" id="pmr">
    <div class="ficha-topo"><h2>${novo?'Nova rotina':'Rotina'}</h2><button class="icon-btn" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <div class="field"><label for="pmr-nome">O que fazer</label><input type="text" id="pmr-nome" maxlength="80" required value="${esc(r.nome)}" placeholder="Ex.: Ler 20 páginas"></div>
    <div class="field"><span class="lbl-campo">Em quais dias</span><div class="pt-escolha dias" role="group" aria-label="Dias da semana">${SEM_CURTA.map((n,i)=>`<button type="button" data-dia-sem="${i}" aria-pressed="${r.dias.includes(i)}">${n}</button>`).join('')}</div>
      <div class="toolbar"><button class="linkbtn" type="button" data-atalho="0,1,2,3,4,5,6">Todos</button><button class="linkbtn" type="button" data-atalho="1,2,3,4,5">Dias úteis</button><button class="linkbtn" type="button" data-atalho="0,6">Fim de semana</button></div></div>
    ${novo?'':`<label class="check-linha"><input type="checkbox" id="pmr-ativa"${r.ativa?' checked':''}> Ativa (desmarque para pausar sem perder o histórico)</label>`}
    <div class="toolbar" style="justify-content:flex-end">${novo?'':'<button class="btn" type="button" id="pmr-exc" style="color:var(--neg);margin-right:auto">Excluir</button>'}<button class="btn" type="button" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form>`;
  if(!d.open) d.showModal();
  d.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>d.close());
  d.querySelectorAll('[data-dia-sem]').forEach(b=>b.onclick=()=>b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true')));
  d.querySelectorAll('[data-atalho]').forEach(b=>b.onclick=()=>{ const ds=b.dataset.atalho.split(','); d.querySelectorAll('[data-dia-sem]').forEach(x=>x.setAttribute('aria-pressed',String(ds.includes(x.dataset.diaSem)))); });
  if($('pmr-exc')) $('pmr-exc').onclick=()=>{ if(!confirm(`Excluir a rotina "${r.nome}" e todo o histórico de marcações? Para guardar o histórico, prefira desmarcar "Ativa".`)) return; d.close(); gravarPes(()=>S.api.pesExcluirRotina(r.id),'Rotina excluída.'); };
  $('pmr').onsubmit=e=>{ e.preventDefault();
    const nome=$('pmr-nome').value.trim(), dias=[...d.querySelectorAll('[data-dia-sem][aria-pressed="true"]')].map(b=>+b.dataset.diaSem);
    if(!nome){ S.toast('Escreva o nome da rotina.'); return; }
    if(!dias.length){ S.toast('Escolha pelo menos um dia.'); return; }
    const campos={nome, dias}; if(!novo) campos.ativa=$('pmr-ativa').checked;
    d.close(); gravarPes(()=>S.api.pesRotina(novo?null:r.id,campos), novo?'Rotina criada.':'Rotina salva.');
  };
}

const TIPOS_META = [
  ['leituras/livros','Livros lidos no ano','livros'],
  ['leituras/paginas','Páginas lidas no ano','páginas'],
  ['treinos/ano','Treinos no ano','treinos'],
  ['pessoal/livre','Personalizada (eu atualizo)',''],
];
function abrirMeta(id){
  const novo=id==null, m=novo?null:S.P.metas.find(x=>x.id===id);
  if(!novo&&!m) return;
  const tipoAtual=m?(TIPOS_META.some(t=>t[0]===`${m.area}/${m.indicador}`)?`${m.area}/${m.indicador}`:'pessoal/livre'):'pessoal/livre';
  const d=dialogo('pm-dlg','Meta');
  d.innerHTML=`<form class="dlg-in" id="pmm">
    <div class="ficha-topo"><h2>${novo?'Nova meta':'Meta'}</h2><button class="icon-btn" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <div class="form-row">
      <div class="field"><label for="pmm-tipo">Tipo</label><select id="pmm-tipo"${novo?'':' disabled'}>${TIPOS_META.map(([k,l])=>opt(k,l,tipoAtual)).join('')}</select></div>
      <div class="field" style="flex:0 1 110px"><label for="pmm-ano">Ano</label><input type="number" id="pmm-ano" min="2000" max="2100" value="${m?.ano??mf.ano}"${novo?'':' disabled'}></div>
    </div>
    <div class="field"><label for="pmm-tit">Título</label><input type="text" id="pmm-tit" maxlength="120" value="${esc(m?.titulo||'')}" placeholder="Ex.: Correr 300 km"></div>
    <div class="form-row">
      <div class="field" style="flex:0 1 140px"><label for="pmm-alvo">Alvo</label><input type="number" id="pmm-alvo" min="0.01" step="any" required value="${m?.alvo??''}"></div>
      <div class="field livre" style="flex:0 1 140px"><label for="pmm-atual">Valor atual</label><input type="number" id="pmm-atual" min="0" step="any" value="${m?.atual??''}" placeholder="0"></div>
      <div class="field livre" style="flex:0 1 120px"><label for="pmm-un">Unidade</label><input type="text" id="pmm-un" maxlength="20" value="${esc(m?.unidade||'')}" placeholder="km, R$, cursos"></div>
    </div>
    <div class="toolbar" style="justify-content:flex-end">${novo?'':'<button class="btn" type="button" id="pmm-exc" style="color:var(--neg);margin-right:auto">Excluir</button>'}<button class="btn" type="button" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form>`;
  if(!d.open) d.showModal();
  const ajustar=()=>{ const livre=$('pmm-tipo').value==='pessoal/livre'; d.querySelectorAll('.livre').forEach(x=>x.hidden=!livre); $('pmm-tit').required=livre; };
  ajustar(); $('pmm-tipo').onchange=ajustar;
  d.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>d.close());
  if($('pmm-exc')) $('pmm-exc').onclick=()=>{ if(!confirm('Excluir esta meta?')) return; d.close(); gravarPes(()=>S.api.pesExcluirMeta(m.id),'Meta excluída.'); };
  $('pmm').onsubmit=e=>{ e.preventDefault();
    const [area,ind]=$('pmm-tipo').value.split('/'), ano=Math.round(+$('pmm-ano').value), alvo=+$('pmm-alvo').value;
    const titulo=$('pmm-tit').value.trim(), atual=$('pmm-atual').value===''?null:+$('pmm-atual').value, unidade=$('pmm-un').value.trim()||null;
    if(!(alvo>0)){ S.toast('O alvo precisa ser maior que zero.'); return; }
    if(!(ano>=2000&&ano<=2100)){ S.toast('Ano inválido.'); return; }
    if(area==='pessoal'&&!titulo){ S.toast('Dê um título para a meta.'); return; }
    const livre=area==='pessoal';
    const campos=livre?{titulo, alvo, atual:atual!=null&&atual>=0?atual:null, unidade}:{titulo:titulo||null, alvo, atual:null, unidade:null};
    if(novo){
      if(!livre&&S.P.metas.some(x=>x.ano===ano&&x.area===area&&x.indicador===ind)){ S.toast(`Já existe essa meta em ${ano}. Edite a que está na lista.`); return; }
      Object.assign(campos,{ano, area, indicador: livre?'p-'+crypto.randomUUID().slice(0,8):ind});
    }
    d.close(); gravarPes(()=>S.api.pesMetaLivre(novo?null:m.id,campos), novo?'Meta criada.':'Meta salva.');
  };
}
