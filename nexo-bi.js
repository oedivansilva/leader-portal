(function(){
  const BI = window.NexoBI = window.NexoBI || {}
  BI.charts = BI.charts || {}
  window.NEXO_BI_STATE = window.NEXO_BI_STATE || {}

  const esc = value => window.escapeHTML ? escapeHTML(value) : String(value ?? '')
  const pct = value => value == null || value === '' || Number.isNaN(Number(value)) ? '—' : `${Number(value).toFixed(1)}%`
  const number = value => Number(value || 0)

  function ensureModal(){
    if(document.getElementById('nexoBiModal')) return
    const modal = document.createElement('div')
    modal.id = 'nexoBiModal'
    modal.className = 'nexo-bi-modal hidden'
    modal.innerHTML = `<div class="nexo-bi-modal-card"><div class="nexo-bi-modal-head"><div><h2 id="nexoBiModalTitle">Detalhes</h2><div id="nexoBiModalSubtitle" class="muted"></div></div><button class="btn btn-light" type="button" id="nexoBiModalClose">Fechar</button></div><div id="nexoBiModalBody" class="nexo-bi-modal-body"></div></div>`
    document.body.appendChild(modal)
    modal.addEventListener('click',e=>{ if(e.target===modal) BI.closeModal() })
    document.getElementById('nexoBiModalClose').onclick=()=>BI.closeModal()
  }

  BI.openModal = function(title,subtitle,html){
    ensureModal()
    nexoBiModalTitle.textContent = title || 'Detalhes'
    nexoBiModalSubtitle.textContent = subtitle || ''
    nexoBiModalBody.innerHTML = html || ''
    nexoBiModal.classList.remove('hidden')
  }
  BI.closeModal = function(){ document.getElementById('nexoBiModal')?.classList.add('hidden') }

  BI.makeClickable = function(el,handler){
    if(!el || el.dataset.biBound==='1') return
    el.dataset.biBound='1'
    el.classList.add('nexo-bi-clickable')
    el.tabIndex = 0
    el.addEventListener('click',handler)
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handler(e)}})
  }

  BI.renderDonut = function(canvasId,labels,data,title='',settings={}){
    if(!window.Chart) return
    const canvas = document.getElementById(canvasId)
    if(!canvas) return

    const colors = settings.colors || ['#EE4D2D','#FFB000','#2EC4B6','#7C5CFC','#6F7480','#3B82F6','#22C55E','#0EA5E9']
    const numericData = (data || []).map(value => Number(value) || 0)
    const suffix = settings.suffix || ''
    const format = value => {
      const n = Number(value) || 0
      const rendered = n.toLocaleString('pt-BR',{maximumFractionDigits:Number.isInteger(n)?0:1})
      return `${rendered}${suffix}`
    }

    BI.charts[canvasId]?.destroy()
    BI.charts[canvasId] = new Chart(canvas,{
      type:'doughnut',
      data:{
        labels,
        datasets:[{
          data:numericData,
          backgroundColor:labels.map((_,index)=>colors[index % colors.length]),
          borderWidth:0,
          hoverOffset:4
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:settings.cutout || '64%',
        layout:{padding:{top:8,right:12,bottom:4,left:12}},
        plugins:{
          title:{display:false,text:title},
          legend:{
            position:settings.legendPosition || 'bottom',
            labels:{
              boxWidth:9,
              boxHeight:9,
              usePointStyle:true,
              pointStyle:'circle',
              padding:10,
              font:{size:10},
              generateLabels(chart){
                const ds=chart.data.datasets[0]
                return chart.data.labels.map((label,index)=>({
                  text:`${label} (${format(ds.data[index])})`,
                  fillStyle:ds.backgroundColor[index],
                  strokeStyle:ds.backgroundColor[index],
                  lineWidth:0,
                  hidden:!chart.getDataVisibility(index),
                  index
                }))
              }
            }
          },
          nexoValueLabels:{
            display:true,
            hideZero:true,
            formatter:value=>format(value)
          },
          nexoDoughnutCenter:{
            display:settings.showTotal !== false,
            label:settings.centerLabel || 'Total',
            formatter:total=>format(total)
          },
          tooltip:{
            callbacks:{
              label(context){
                const total=numericData.reduce((sum,value)=>sum+value,0)
                const value=Number(context.raw)||0
                const percent=total ? (value/total*100).toFixed(1).replace('.',',') : '0,0'
                return `${context.label}: ${format(value)} (${percent}%)`
              }
            }
          }
        }
      }
    })
  }

  function chartCard(id,title,subtitle=''){
    return `<div class="nexo-bi-chart-card"><h4>${esc(title)}</h4><p>${esc(subtitle)}</p><div class="nexo-bi-chart-box"><canvas id="${id}"></canvas></div></div>`
  }

  function kpis(items){
    return `<div class="nexo-bi-kpis">${items.map(([label,value])=>`<div class="nexo-bi-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`
  }

  function simpleTable(headers,rows){
    if(!rows?.length) return '<div class="people-empty">Sem dados para o filtro atual.</div>'
    return `<div class="table-wrap"><table class="nexo-bi-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell==null?'—':cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  }


  // Tradução humana dos indicadores: o gestor entende o número sem precisar
  // conhecer a fórmula antes. O detalhamento técnico continua disponível no clique.
  function setHumanSummary(card,text){
    if(!card) return
    let summary=card.querySelector('.nexo-bi-human-summary')
    if(!summary){
      summary=document.createElement('div')
      summary.className='nexo-bi-human-summary'
      const strong=card.querySelector('strong')
      if(strong) strong.insertAdjacentElement('afterend',summary)
      else card.appendChild(summary)
    }
    summary.textContent=text||''
    summary.classList.toggle('hidden',!text)
  }

  function explainBox(text,formula=''){
    return `<div class="nexo-bi-explainer"><div class="nexo-bi-explainer-label">Em uma frase</div><div class="nexo-bi-explainer-text">${esc(text)}</div>${formula?`<div class="nexo-bi-formula">${esc(formula)}</div>`:''}</div>`
  }

  function avgFiveFromPercent(value){
    const n=Number(value)
    return Number.isFinite(n)?(n/20).toFixed(2).replace('.',','):'—'
  }

  function overviewHumanSummary(id,s){
    const absTotal=s.absences?.length||0
    const planned=s.planned||0
    const avgHead=Number(s.averageHead||0).toFixed(1).replace('.',',')
    const admissions=s.admitted?.length||0
    const terminations=s.terminated?.length||0
    const value=document.getElementById(id)?.textContent||'—'
    const map={
      metricAbs: planned ? `${absTotal} ausência${absTotal===1?'':'s'} em ${planned.toLocaleString('pt-BR')} jornadas previstas no mês.` : 'Sem jornadas previstas suficientes para calcular o ABS.',
      metricJustified: `${s.justifiedCount||0} ausência${Number(s.justifiedCount||0)===1?'':'s'} justificada${Number(s.justifiedCount||0)===1?'':'s'} no mês.`,
      metricUnjustified: `${s.unjustifiedCount||0} falta${Number(s.unjustifiedCount||0)===1?'':'s'}/NS no mês.`,
      metricWarnings: `${s.warnings?.length||0} advertência${(s.warnings?.length||0)===1?'':'s'} registrada${(s.warnings?.length||0)===1?'':'s'} no mês.`,
      metricSuspensions: `${s.suspensions?.length||0} ${(s.suspensions?.length||0)===1?'suspensão registrada':'suspensões registradas'} no mês.`,
      metricApplicationTime: `Tempo médio entre a ocorrência e a aplicação das medidas concluídas: ${value}.`,
      metricOldest: `Média usando a ocorrência mais antiga de cada medida aplicada: ${value}.`,
      metricNewest: `Média usando a ocorrência mais recente de cada medida aplicada: ${value}.`,
      metricOccurrenceAverage: `Média do tempo das ocorrências que compõem as medidas aplicadas: ${value}.`,
      metricActiveHeadcount: `${s.headEnd||0} colaborador${Number(s.headEnd||0)===1?'':'es'} ativo${Number(s.headEnd||0)===1?'':'s'} no último dia do mês.`,
      metricAdmissions: `${admissions} admissão${admissions===1?'':'ões'} no mês.`,
      metricTerminations: `${terminations} desligamento${terminations===1?'':'s'} no mês.`,
      metricGeneralTurnover: `${admissions} admissão${admissions===1?'':'ões'} + ${terminations} desligamento${terminations===1?'':'s'} sobre quadro médio de ${avgHead}.`,
      metricTurnover: `${terminations} desligamento${terminations===1?'':'s'} sobre quadro médio de ${avgHead}.`,
      metricVoluntary: `${s.voluntary||0} desligamento${Number(s.voluntary||0)===1?'':'s'} voluntário${Number(s.voluntary||0)===1?'':'s'} no mês.`,
      metricInvoluntary: `${s.involuntary||0} desligamento${Number(s.involuntary||0)===1?'':'s'} involuntário${Number(s.involuntary||0)===1?'':'s'} no mês.`
    }
    return map[id]||''
  }

  // ================================================================
  // VISÃO GERAL
  // ================================================================
  const overviewMetricMap = {
    metricAbs:['ABS total','abs'], metricJustified:['Faltas justificadas','abs'], metricUnjustified:['Faltas injustificadas','abs'],
    metricWarnings:['Advertências','discipline'], metricSuspensions:['Suspensões','discipline'], metricApplicationTime:['Tempo médio de aplicação','time'],
    metricOldest:['Tempo desde ocorrência mais antiga','time'], metricNewest:['Tempo desde ocorrência mais recente','time'], metricOccurrenceAverage:['Média por ocorrência','time'],
    metricActiveHeadcount:['Quadro ativo','turnover'], metricAdmissions:['Admissões','turnover'], metricTerminations:['Desligamentos','turnover'],
    metricGeneralTurnover:['Turnover geral','turnover'], metricTurnover:['Turnover de desligamentos','turnover'], metricVoluntary:['Desligamentos voluntários','turnover'], metricInvoluntary:['Desligamentos involuntários','turnover']
  }

  BI.refreshOverview = function(){
    const state = NEXO_BI_STATE.dashboard
    const overview = document.getElementById('overview')
    if(!state || !overview) return

    const toolbar = overview.querySelector('.toolbar')
    let charts = document.getElementById('overviewBiCharts')
    if(!charts){
      charts = document.createElement('div'); charts.id='overviewBiCharts'; charts.className='nexo-bi-charts'
      charts.innerHTML = chartCard('biOverviewStatus','Status das solicitações','Pendentes, geradas e aplicadas')+
        chartCard('biOverviewAbs','Perfil das ausências','Justificadas x injustificadas')+
        chartCard('biOverviewMeasures','Medidas disciplinares','Advertências x suspensões')+
        chartCard('biOverviewTurnover','Movimentação','Admissões x desligamentos')
      ;(toolbar?.parentNode || overview).insertBefore(charts, toolbar?.nextSibling || overview.firstChild)
    }
    BI.renderDonut('biOverviewStatus',Object.keys(state.statusCounts||{}),Object.values(state.statusCounts||{}))
    BI.renderDonut('biOverviewAbs',['Justificadas','Injustificadas'],[state.justifiedCount||0,state.unjustifiedCount||0])
    BI.renderDonut('biOverviewMeasures',['Advertências','Suspensões'],[state.warnings?.length||0,state.suspensions?.length||0])
    BI.renderDonut('biOverviewTurnover',['Admissões','Desligamentos'],[state.admitted?.length||0,state.terminated?.length||0])

    let insights = document.getElementById('overviewBiInsights')
    if(!insights){ insights=document.createElement('div');insights.id='overviewBiInsights';insights.className='nexo-bi-insights';charts.insertAdjacentElement('afterend',insights) }
    const topAbs = Object.entries(state.absenceByOperation||{}).sort((a,b)=>b[1]-a[1])[0]
    const topLeader = (state.leaders||[]).slice().sort((a,b)=>b.value-a.value)[0]
    const items=[]
    if(topAbs) items.push(`Maior volume de ausências no filtro: ${topAbs[0]} (${topAbs[1]} registro(s)).`)
    if(topLeader) items.push(`Maior volume de medidas disciplinares por liderança: ${topLeader.label} (${topLeader.value}).`)
    if(state.averageHead) items.push(`Quadro médio no período: ${Number(state.averageHead).toFixed(1)} colaborador(es).`)
    if(state.planned) items.push(`ABS: ${state.absences?.length||0} ausência(s) em ${state.planned.toLocaleString('pt-BR')} jornadas previstas no mês.`)
    insights.innerHTML=`<h4>Insights do período</h4><div class="nexo-bi-insight-list">${items.map(x=>`<div class="nexo-bi-insight">${esc(x)}</div>`).join('')||'<div class="muted">Sem dados suficientes para gerar insights.</div>'}</div>`

    Object.entries(overviewMetricMap).forEach(([id,[label,type]])=>{
      const strong=document.getElementById(id); const card=strong?.closest('.stat')
      setHumanSummary(card,overviewHumanSummary(id,state))
      BI.makeClickable(card,()=>BI.openOverviewDetail(type,label,id))
    })
  }

  BI.openOverviewDetail = function(type,label,id){
    const s=NEXO_BI_STATE.dashboard||{}
    const value=document.getElementById(id)?.textContent||'—'
    const subtitle=`${s.selectedMonth||''}${s.operationLabel?' · '+s.operationLabel:''}`
    let html=''

    if(type==='abs'){
      const absTotal=s.absences?.length||0
      const other=s.otherAbsenceCount||0
      const opNames=[...new Set([...Object.keys(s.plannedByOperation||{}),...Object.keys(s.absenceByOperation||{})])]
      const byOp=opNames.map(name=>{
        const journeys=Number(s.plannedByOperation?.[name]||0)
        const abs=Number(s.absenceByOperation?.[name]||0)
        const employees=Number(s.plannedEmployeeCountByOperation?.[name]||0)
        const rate=journeys?`${(abs/journeys*100).toFixed(2).replace('.',',')}%`:'—'
        return [esc(name),employees,journeys.toLocaleString('pt-BR'),abs,rate]
      }).sort((a,b)=>Number(String(b[3]).replace(/\D/g,''))-Number(String(a[3]).replace(/\D/g,'')))
      const byScale=(s.scaleAbsenceRows||[]).map(r=>[esc(r.label),r.absences,r.medicalCertificates])

      let human=''
      let formula=''
      if(id==='metricAbs'){
        human=s.planned
          ? `${absTotal} ausência${absTotal===1?'':'s'} em ${Number(s.planned).toLocaleString('pt-BR')} jornadas previstas no mês resultam em ${value}.`
          : 'Não há jornadas previstas suficientes para calcular o ABS deste filtro.'
        formula=s.planned ? `${absTotal} ÷ ${Number(s.planned).toLocaleString('pt-BR')} × 100 = ${value}` : ''
      } else if(id==='metricJustified'){
        human=`Foram registradas ${s.justifiedCount||0} ausência${Number(s.justifiedCount||0)===1?'':'s'} justificada${Number(s.justifiedCount||0)===1?'':'s'} no mês selecionado.`
        formula='AM/FJ são exibidos como ausências justificadas.'
      } else {
        human=`Foram registradas ${s.unjustifiedCount||0} falta${Number(s.unjustifiedCount||0)===1?'':'s'}/NS sem justificativa no mês selecionado.`
        formula='F/NS são exibidos como ausências injustificadas.'
      }

      html=explainBox(human,formula)+
        kpis([
          ['Indicador',value],
          ['Jornadas previstas no mês',Number(s.planned||0).toLocaleString('pt-BR')],
          ['Colaboradores considerados',s.consideredEmployees||0],
          ['Ausências consideradas',absTotal]
        ])+
        `<div class="nexo-bi-note"><strong>O que significa “jornadas previstas”?</strong><br>É a soma dos dias em que cada colaborador deveria trabalhar dentro do mês, conforme a escala vigente. Não são ${Number(s.planned||0).toLocaleString('pt-BR')} dias corridos: são jornadas acumuladas do efetivo considerado.${other?` Há também ${other} ausência(s) classificada(s) em outros códigos de ausência que compõem o ABS total.`:''}</div>`+
        `<div class="nexo-bi-section"><h3>Composição por operação</h3>${simpleTable(['Operação','Colaboradores','Jornadas previstas','Ausências','ABS'],byOp)}</div>`+
        `<div class="nexo-bi-section"><h3>Por turno / escala</h3>${simpleTable(['Turno / escala','F/NS','AM'],byScale)}</div>`
    } else if(type==='discipline'){
      const byRegion=(s.regions||[]).map(r=>[esc(r.label),r.value])
      const byLeader=(s.leaders||[]).map(r=>[esc(r.label),r.value])
      const isWarning=id==='metricWarnings'
      const count=isWarning?(s.warnings?.length||0):(s.suspensions?.length||0)
      const human=`${count} ${isWarning?(count===1?'advertência foi registrada':'advertências foram registradas'):(count===1?'suspensão foi registrada':'suspensões foram registradas')} no mês selecionado.`
      html=explainBox(human,'Contagem das medidas disciplinares emitidas no período selecionado.')+
        kpis([['Indicador',value],['Advertências',s.warnings?.length||0],['Suspensões',s.suspensions?.length||0],['Total de medidas',(s.rows||[]).length]])+
        `<div class="nexo-bi-section"><h3>Por região</h3>${simpleTable(['Região','Medidas'],byRegion)}</div>`+
        `<div class="nexo-bi-section"><h3>Por liderança</h3>${simpleTable(['Liderança','Medidas'],byLeader)}</div>`
    } else if(type==='time'){
      const descriptions={
        metricApplicationTime:'tempo médio entre as ocorrências registradas e a aplicação da medida',
        metricOldest:'tempo médio considerando a ocorrência mais antiga de cada medida',
        metricNewest:'tempo médio considerando a ocorrência mais recente de cada medida',
        metricOccurrenceAverage:'tempo médio das ocorrências que compõem as medidas aplicadas'
      }
      html=explainBox(`O indicador mostra ${descriptions[id]||'o tempo médio de aplicação'}: ${value}.`,'São consideradas somente medidas aplicadas dentro do período selecionado.')+
        kpis([['Indicador',value],['Medidas aplicadas',s.applied?.length||0],['Desde a mais antiga',s.timeOldest||'—'],['Desde a mais recente',s.timeNewest||'—']])+
        `<div class="nexo-bi-note">O NEXO compara a data de aplicação com as datas das ocorrências registradas. Assim, o gestor consegue entender se a aplicação ocorreu rapidamente ou se houve demora no processo.</div>`
    } else {
      const admissions=s.admitted?.length||0
      const terminations=s.terminated?.length||0
      const avg=Number(s.averageHead||0)
      const avgText=avg.toFixed(1).replace('.',',')
      const rows=(s.movements||[]).map(m=>[esc(m.type),esc(m.employee?.registration||'—'),esc(m.employee?.full_name||'—'),window.formatDate?formatDate(m.date):m.date])
      let human=''
      let formula=''
      if(id==='metricGeneralTurnover'){
        human=`${admissions} admissão${admissions===1?'':'ões'} e ${terminations} desligamento${terminations===1?'':'s'} foram comparados com um quadro médio de ${avgText} colaborador(es), resultando em ${value}.`
        formula=avg?`(( ${admissions} + ${terminations} ) ÷ 2) ÷ ${avgText} × 100 = ${value}`:''
      } else if(id==='metricTurnover'){
        human=`${terminations} desligamento${terminations===1?'':'s'} sobre um quadro médio de ${avgText} colaborador(es) resultam em ${value}.`
        formula=avg?`${terminations} ÷ ${avgText} × 100 = ${value}`:''
      } else if(id==='metricActiveHeadcount'){
        human=`O mês terminou com ${s.headEnd||0} colaborador(es) ativo(s) no filtro selecionado.`
      } else if(id==='metricAdmissions'){
        human=`Foram admitidos ${admissions} colaborador(es) durante o mês selecionado.`
      } else if(id==='metricTerminations'){
        human=`Foram desligados ${terminations} colaborador(es) durante o mês selecionado.`
      } else if(id==='metricVoluntary'){
        human=`Dos ${terminations} desligamentos do mês, ${s.voluntary||0} foram classificados como voluntários.`
      } else if(id==='metricInvoluntary'){
        human=`Dos ${terminations} desligamentos do mês, ${s.involuntary||0} foram classificados como involuntários.`
      } else {
        human=`O indicador considera as movimentações registradas no mês selecionado.`
      }
      html=explainBox(human,formula)+
        kpis([['Indicador',value],['Quadro inicial',s.headStart||0],['Quadro final',s.headEnd||0],['Quadro médio',avgText]])+
        `<div class="nexo-bi-section"><h3>Movimentações consideradas</h3>${simpleTable(['Movimentação','MAT','Colaborador','Data'],rows)}</div>`
    }
    BI.openModal(label,subtitle,html)
  }

  // ================================================================
  // NOVOS CONTRATADOS
  // ================================================================
  const hireMetricMeta = {
    hires:{label:'Contratados',source:'Cadastro de acompanhamentos',prefixes:[]},
    recruitment:{label:'Qualidade do recrutamento',source:'Respostas do colaborador',prefixes:['bpo_'],reviewers:['employee']},
    adaptation:{label:'Adaptação',source:'Avaliação da liderança',prefixes:['employee_'],reviewers:['leader']},
    onboarding:{label:'Onboarding',source:'Respostas do colaborador',prefixes:['onboarding_'],reviewers:['employee']},
    leadership:{label:'Liderança',source:'Colaborador + RH',prefixes:['leader_','rh_'],reviewers:['employee','hr']},
    attendance:{label:'Assiduidade F/NS',source:'Controle de Presença',prefixes:[]}
  }

  BI.ensureHireAdvancedFilters = async function(){
    if(document.getElementById('hireBiAdvancedFilters') || !document.getElementById('hireAnalyticsAdmin')) return
    const panel=document.createElement('div');panel.id='hireBiAdvancedFilters';panel.className='nexo-bi-filter-row'
    panel.innerHTML=`
      <div class="field"><label>Operação</label><select id="hireBiOperation" class="input"><option value="">Todas</option></select></div>
      <div class="field"><label>Líder</label><select id="hireBiLeader" class="input"><option value="">Todos</option></select></div>
      <div class="field"><label>Etapa</label><select id="hireBiCheckpoint" class="input"><option value="">Todas</option><option value="7">D+7</option><option value="30">D+30</option><option value="60">D+60</option><option value="90">D+90</option></select></div>
      <div class="field"><label>Respondente</label><select id="hireBiReviewer" class="input"><option value="">Todos</option><option value="employee">Colaborador</option><option value="leader">Líder</option><option value="hr">RH</option></select></div>`
    const target=document.querySelector('#hireAnalyticsAdmin .hire-dashboard-filters')||document.querySelector('#hireAnalyticsAdmin .toolbar')
    target?.insertAdjacentElement('afterend',panel)
    const [ops,leaders]=await Promise.all([db.from('operations').select('id,cost_center,department').order('cost_center'),db.from('profiles').select('id,full_name').eq('role','leader').eq('active',true).order('full_name')])
    if(!ops.error) hireBiOperation.innerHTML='<option value="">Todas</option>'+(ops.data||[]).map(o=>`<option value="${o.id}">${esc(o.cost_center)}${o.department?' — '+esc(o.department):''}</option>`).join('')
    if(!leaders.error) hireBiLeader.innerHTML='<option value="">Todos</option>'+(leaders.data||[]).map(l=>`<option value="${l.id}">${esc(l.full_name)}</option>`).join('')
    ;[hireBiOperation,hireBiLeader,hireBiCheckpoint,hireBiReviewer].forEach(el=>el.addEventListener('change',()=>window.loadHireAnalytics?.()))
  }

  BI.renderHireDashboard = function(detail){
    if(!detail) return
    ;(detail.evaluations||[]).forEach(e=>{
      const values=(prefixes)=>Object.entries(e.answers||{}).filter(([k,v])=>prefixes.some(p=>k.startsWith(p))&&Number.isFinite(Number(v))).map(([,v])=>Number(v))
      const score=prefixes=>{const arr=values(prefixes);return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length*20:null}
      e.respondent_label=e.reviewer_type==='employee'?'Colaborador':e.reviewer_type==='leader'?'Líder':'RH'
      e.metric_pct={recruitment:score(['bpo_']),adaptation:score(['employee_']),onboarding:score(['onboarding_']),leadership:score(['leader_','rh_'])}
    })
    ;(detail.questions||[]).forEach(q=>{q.respondent_label=q.reviewer_type==='employee'?'Colaborador':q.reviewer_type==='leader'?'Líder':'RH'})
    NEXO_BI_STATE.newHires=detail
    const summary=detail.summary||{}
    const container=document.getElementById('hireOverallCards')
    if(container){
      const totalPlanned=(detail.cases||[]).reduce((sum,c)=>sum+Number(c.planned_days||0),0)
      const totalFn=(summary.f_count||0)+(summary.ns_count||0)
      const defs=[
        ['hires','Contratados',summary.hires??0,`${summary.hires??0} pessoa(s) no filtro atual.`],
        ['recruitment','Qualidade do recrutamento',pct(summary.recruitment_pct),summary.recruitment_pct==null?'Sem respostas suficientes.':`Média ${avgFiveFromPercent(summary.recruitment_pct)}/5 nas respostas dos colaboradores sobre o recrutamento.`],
        ['adaptation','Adaptação',pct(summary.adaptation_pct),summary.adaptation_pct==null?'Sem avaliações suficientes.':`Média ${avgFiveFromPercent(summary.adaptation_pct)}/5 nas avaliações feitas pela liderança.`],
        ['onboarding','Onboarding',pct(summary.onboarding_pct),summary.onboarding_pct==null?'Sem respostas suficientes.':`Média ${avgFiveFromPercent(summary.onboarding_pct)}/5 nas respostas dos colaboradores sobre integração e início da jornada.`],
        ['leadership','Liderança',pct(summary.leadership_pct),summary.leadership_pct==null?'Sem avaliações suficientes.':`Média ${avgFiveFromPercent(summary.leadership_pct)}/5 combinando percepção dos colaboradores e avaliação do RH.`],
        ['attendance','Assiduidade F/NS',pct(summary.attendance_pct),`${totalFn} F/NS em ${totalPlanned.toLocaleString('pt-BR')} jornadas previstas no acompanhamento.`]
      ]
      container.innerHTML=defs.map(([key,label,value,human])=>`<div class="people-mini-stat nexo-bi-clickable" data-bi-hire="${key}" tabindex="0"><span>${label}</span><strong>${value}</strong><div class="nexo-bi-human-summary">${esc(human)}</div></div>`).join('')
      container.querySelectorAll('[data-bi-hire]').forEach(el=>{el.onclick=()=>BI.openHireDetail(el.dataset.biHire);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();BI.openHireDetail(el.dataset.biHire)}}})
    }

    let charts=document.getElementById('hireBiCharts')
    if(!charts){charts=document.createElement('div');charts.id='hireBiCharts';charts.className='nexo-bi-charts';container?.insertAdjacentElement('afterend',charts)}
    charts.innerHTML=chartCard('biHireSource','Origem das contratações','BPO x Interno')+chartCard('biHireResponses','Quem respondeu','Colaborador, Líder e RH')+chartCard('biHireStatus','Status das avaliações','Concluídas x pendentes')+chartCard('biHireStages','Etapas avaliadas','D+7 a D+90')
    const d=detail.distributions||{}
    BI.renderDonut('biHireSource',(d.source||[]).map(x=>x.label),(d.source||[]).map(x=>x.value))
    BI.renderDonut('biHireResponses',(d.reviewers||[]).map(x=>x.label),(d.reviewers||[]).map(x=>x.value))
    BI.renderDonut('biHireStatus',(d.status||[]).map(x=>x.label),(d.status||[]).map(x=>x.value))
    BI.renderDonut('biHireStages',(d.stages||[]).map(x=>x.label),(d.stages||[]).map(x=>x.value))

    let insights=document.getElementById('hireBiInsights')
    if(!insights){insights=document.createElement('div');insights.id='hireBiInsights';insights.className='nexo-bi-insights';charts.insertAdjacentElement('afterend',insights)}
    const qs=(detail.questions||[]).filter(q=>q.average_pct!=null).sort((a,b)=>a.average_pct-b.average_pct)
    const low=qs[0], high=qs[qs.length-1]
    const pending=(d.status||[]).find(x=>String(x.label).toLowerCase().includes('pend'))?.value||0
    const items=[]
    if(low)items.push(`Maior ponto de atenção: ${low.question_label} (${pct(low.average_pct)}).`)
    if(high)items.push(`Melhor resultado: ${high.question_label} (${pct(high.average_pct)}).`)
    if(pending)items.push(`${pending} avaliação(ões) ainda pendente(s) no filtro atual.`)
    if(summary.medical_certificates)items.push(`${summary.medical_certificates} atestado(s) médico(s) no período, exibidos apenas como contexto.`)
    insights.innerHTML=`<h4>Insights do filtro</h4><div class="nexo-bi-insight-list">${items.map(x=>`<div class="nexo-bi-insight">${esc(x)}</div>`).join('')||'<div class="muted">Sem dados suficientes para gerar insights.</div>'}</div>`
  }

  BI.openHireDetail = function(metric){
    const d=NEXO_BI_STATE.newHires||{}, meta=hireMetricMeta[metric]||hireMetricMeta.hires, s=d.summary||{}
    const value=metric==='hires'?s.hires:metric==='attendance'?pct(s.attendance_pct):pct(s[`${metric}_pct`])

    if(metric==='hires'){
      const rows=(d.cases||[]).map(c=>[esc(c.employee_name),esc(c.registration),esc(c.operation_name),esc(c.leader_name||'—'),esc(c.source_name||'Interno'),window.formatDate?formatDate(c.admission_date):c.admission_date])
      const human=`${s.hires||0} novo(s) contratado(s) estão dentro do filtro atual; ${s.bpo_hires||0} vieram de BPO e ${s.internal_hires||0} de recrutamento interno.`
      return BI.openModal(meta.label,`Fonte: ${meta.source}`,
        explainBox(human,'Contagem dos acompanhamentos de novos contratados que atendem aos filtros selecionados.')+
        kpis([['Total',value],['BPO',s.bpo_hires||0],['Interno',s.internal_hires||0],['Ativos no acompanhamento',s.tracking_hires||0]])+
        `<div class="nexo-bi-section"><h3>Colaboradores considerados</h3>${simpleTable(['Colaborador','MAT','Operação','Líder','Origem','Admissão'],rows)}</div>`)
    }

    if(metric==='attendance'){
      const rows=(d.cases||[]).map(c=>[esc(c.employee_name),c.planned_days??0,c.f_count??0,c.ns_count??0,c.am_count??0,pct(c.attendance_pct)])
      const planned=(d.cases||[]).reduce((sum,c)=>sum+Number(c.planned_days||0),0)
      const f=Number(s.f_count||0), ns=Number(s.ns_count||0), fn=f+ns
      const human=`Foram registrados ${fn} F/NS em ${planned.toLocaleString('pt-BR')} jornadas previstas nos acompanhamentos do filtro. O indicador mostrado (${value}) é a média das taxas individuais de assiduidade.`
      return BI.openModal(meta.label,`Fonte: ${meta.source}`,
        explainBox(human,'Para cada contratado: (jornadas previstas − F − NS) ÷ jornadas previstas × 100. O painel exibe a média dessas taxas individuais.')+
        kpis([['Indicador',value],['Jornadas previstas',planned.toLocaleString('pt-BR')],['Faltas F',f],['No-show NS',ns]])+
        `<div class="nexo-bi-note">Atestados AM (${s.medical_certificates||0}) aparecem apenas como contexto e não reduzem automaticamente a assiduidade nem a nota da contratação.</div>`+
        `<div class="nexo-bi-section"><h3>Por colaborador</h3>${simpleTable(['Colaborador','Jornadas previstas','F','NS','AM','Assiduidade'],rows)}</div>`)
    }

    const qs=(d.questions||[]).filter(q=>meta.prefixes.some(p=>String(q.question_key||'').startsWith(p)))
    const evals=(d.evaluations||[]).filter(e=>meta.reviewers?.includes(e.reviewer_type)).filter(e=>Object.keys(e.answers||{}).some(k=>meta.prefixes.some(p=>k.startsWith(p))))
    const qrows=qs.map(q=>[esc(q.question_label),`<span class="nexo-bi-score-badge">${pct(q.average_pct)}</span>`,q.response_count||0,esc(q.respondent_label||'')])
    const erows=evals.map(e=>[esc(e.employee_name),`D+${e.checkpoint_day}`,esc(e.reviewer_name||e.respondent_label||'—'),esc(e.respondent_label||''),`<span class="nexo-bi-score-badge">${pct(e.metric_pct?.[metric])}</span>`])
    const comments=evals.filter(e=>e.comment).map(e=>`<div class="nexo-bi-comment"><strong>${esc(e.employee_name)} · D+${e.checkpoint_day}</strong><div>${esc(e.comment)}</div><div class="nexo-bi-source">${esc(e.respondent_label)}: ${esc(e.reviewer_name||'—')}</div></div>`).join('')
    const percentValue=Number(s[`${metric}_pct`])
    const avg=avgFiveFromPercent(percentValue)
    const sourceText={
      recruitment:'novos contratados sobre o processo de recrutamento',
      adaptation:'líderes sobre a adaptação dos novos contratados',
      onboarding:'novos contratados sobre onboarding e início da jornada',
      leadership:'colaboradores e RH sobre a atuação da liderança'
    }[metric]||meta.source
    const human=Number.isFinite(percentValue)
      ? `A média das respostas foi ${avg}/5, equivalente a ${value}, com base nas avaliações de ${sourceText}.`
      : `Ainda não há respostas suficientes para formar este indicador no filtro atual.`

    BI.openModal(meta.label,`Fonte principal: ${meta.source}`,
      explainBox(human,'Cada resposta usa escala de 1 a 5. A média é convertida em percentual: média ÷ 5 × 100.')+
      kpis([['Indicador',value],['Média equivalente',`${avg}/5`],['Avaliações consideradas',evals.length],['Colaboradores',new Set(evals.map(e=>e.employee_id)).size]])+
      `<div class="nexo-bi-section"><h3>Resultado por pergunta</h3>${simpleTable(['Pergunta','Média','Respostas','Quem responde'],qrows)}</div>`+
      `<div class="nexo-bi-section"><h3>Avaliações que compõem o indicador</h3>${simpleTable(['Colaborador','Etapa','Quem respondeu','Perfil','Nota desta dimensão'],erows)}</div>`+
      `${comments?`<div class="nexo-bi-section"><h3>Comentários registrados</h3>${comments}</div>`:''}`)
  }

  // ================================================================
  // PESSOAS & DESENVOLVIMENTO
  // ================================================================
  BI.refreshPeople = function(moduleKey){
    const state=NEXO_BI_STATE.people?.[moduleKey]
    if(!state) return
    const section=document.getElementById(moduleKey)
    if(!section) return

    if(moduleKey==='pdi' && !section.querySelector('.people-mini-grid')){
      const pdis=state.pdis||[]
      const actions=pdis.flatMap(p=>p.people_pdi_actions||[])
      const summary=document.createElement('div')
      summary.id='peopleBiSummary-pdi'
      summary.className='people-mini-grid'
      summary.style.margin='0 0 16px'
      summary.innerHTML=`<div class="people-mini-stat"><span>PDIs</span><strong>${pdis.length}</strong></div><div class="people-mini-stat"><span>Ativos</span><strong>${pdis.filter(p=>p.status!=='completed').length}</strong></div><div class="people-mini-stat"><span>Concluídos</span><strong>${pdis.filter(p=>p.status==='completed').length}</strong></div><div class="people-mini-stat"><span>Ações</span><strong>${actions.length}</strong></div>`
      section.querySelector('.page-head')?.insertAdjacentElement('afterend',summary)
    }

    const cards=[...section.querySelectorAll('.people-mini-stat')]
    const human=[]
    if(moduleKey==='mood'){
      human.push(
        `${state.total||0} check-in(s) de humor no período.`,
        state.total?`Média ${Number(state.average||0).toFixed(2).replace('.',',')}/5 em ${state.total} resposta(s).`:'Sem respostas no período.',
        `${state.positive||0} de ${state.total||0} resposta(s) ficaram entre 4 e 5.`,
        `${state.critical||0} de ${state.total||0} resposta(s) ficaram entre 1 e 2.`
      )
    } else if(moduleKey==='climate'){
      const p=state.participation||{}
      human.push(
        `${p.invited||0} colaborador(es) foram convidados.`,
        `${p.responded||0} de ${p.invited||0} convidado(s) responderam.`,
        `${p.responded||0} resposta(s) de ${p.invited||0} convite(s) = ${pct(p.participation_pct||0)} de participação.`,
        state.anonymous?'As respostas desta pesquisa são anônimas.':'As respostas desta pesquisa são identificadas.'
      )
    } else if(moduleKey==='performance'){
      human.push(
        `${state.total||0} avaliação(ões) fazem parte do ciclo.`,
        `${state.selfDone||0} de ${state.total||0} autoavaliação(ões) foram concluídas.`,
        `${state.mgrDone||0} de ${state.total||0} avaliação(ões) da liderança foram concluídas.`,
        `${state.completed||0} de ${state.total||0} avaliação(ões) têm as duas etapas concluídas.`
      )
    } else if(moduleKey==='pdi'){
      const pdis=state.pdis||[];const actions=pdis.flatMap(p=>p.people_pdi_actions||[])
      human.push(
        `${pdis.length} plano(s) de desenvolvimento cadastrado(s).`,
        `${pdis.filter(p=>p.status!=='completed').length} PDI(s) ainda em acompanhamento.`,
        `${pdis.filter(p=>p.status==='completed').length} PDI(s) concluído(s).`,
        `${actions.length} ação(ões) cadastrada(s) nos planos.`
      )
    } else if(moduleKey==='people_analytics'){
      human.push(
        state.moodAverage==null?'Sem check-ins de humor no mês.':`Humor médio do mês: ${Number(state.moodAverage).toFixed(2).replace('.',',')}/5.`,
        state.climatePct==null?'Sem pesquisa de clima disponível.':`${pct(state.climatePct)} dos convidados responderam à pesquisa considerada.`,
        state.performancePct==null?'Sem ciclo de desempenho disponível.':`${pct(state.performancePct)} das avaliações do ciclo estão concluídas.`,
        `${state.pdiActive||0} PDI(s) permanecem ativos.`
      )
    }
    cards.forEach((card,index)=>{setHumanSummary(card,human[index]||'');BI.makeClickable(card,()=>BI.openPeopleDetail(moduleKey,index))})

    let charts=document.getElementById(`peopleBiCharts-${moduleKey}`)
    if(!charts){
      charts=document.createElement('div');charts.id=`peopleBiCharts-${moduleKey}`;charts.className='nexo-bi-charts'
      const anchor=section.querySelector('.people-mini-grid')||section.querySelector('.page-head')
      anchor?.insertAdjacentElement('afterend',charts)
    }
    if(!charts?.isConnected) return

    if(moduleKey==='mood'){
      charts.innerHTML=chartCard('biMoodDistribution','Distribuição do humor','Críticos, neutros e positivos')+chartCard('biMoodOperations','Participação por operação','Volume de respostas')
      BI.renderDonut('biMoodDistribution',['Críticos (1–2)','Neutro (3)','Positivos (4–5)'],[state.critical||0,state.neutral||0,state.positive||0])
      BI.renderDonut('biMoodOperations',(state.rows||[]).map(r=>r.operation_name),(state.rows||[]).map(r=>Number(r.response_count||0)))
    } else if(moduleKey==='climate'){
      charts.innerHTML=chartCard('biClimateParticipation','Participação','Responderam x pendentes')+chartCard('biClimateEnps','eNPS','Promotores, passivos e detratores')
      BI.renderDonut('biClimateParticipation',['Responderam','Pendentes'],[state.participation?.responded||0,Math.max(0,(state.participation?.invited||0)-(state.participation?.responded||0))])
      const enps=(state.summary||[]).find(q=>q.question_type==='enps_0_10')
      BI.renderDonut('biClimateEnps',['Promotores','Passivos','Detratores'],[enps?.promoter_count||0,enps?.passive_count||0,enps?.detractor_count||0])
    } else if(moduleKey==='performance'){
      charts.innerHTML=chartCard('biPerformanceCompletion','Conclusão do ciclo','Concluídas x pendentes')+chartCard('biPerformanceActors','Etapas respondidas','Autoavaliação x liderança')
      BI.renderDonut('biPerformanceCompletion',['Concluídas','Pendentes'],[state.completed||0,Math.max(0,(state.total||0)-(state.completed||0))])
      BI.renderDonut('biPerformanceActors',['Autoavaliações','Lideranças'],[state.selfDone||0,state.mgrDone||0])
    } else if(moduleKey==='pdi'){
      charts.innerHTML=chartCard('biPdiStatus','Status dos PDIs','Ativos x concluídos')+chartCard('biPdiActions','Status das ações','Pendentes, em andamento e concluídas')
      const pdis=state.pdis||[];const actions=pdis.flatMap(p=>p.people_pdi_actions||[])
      BI.renderDonut('biPdiStatus',['Ativos','Concluídos'],[pdis.filter(p=>p.status!=='completed').length,pdis.filter(p=>p.status==='completed').length])
      BI.renderDonut('biPdiActions',['Pendentes','Em andamento','Concluídas'],[actions.filter(a=>!['in_progress','completed'].includes(a.status)).length,actions.filter(a=>a.status==='in_progress').length,actions.filter(a=>a.status==='completed').length])
    } else if(moduleKey==='people_analytics'){
      charts.innerHTML=chartCard('biPaClimate','Clima','Participação atual')+chartCard('biPaPerformance','Desempenho','Avaliações concluídas')
      BI.renderDonut('biPaClimate',['Participação','Restante'],[state.climatePct||0,Math.max(0,100-(state.climatePct||0))],'',{suffix:'%',centerLabel:'Base'})
      BI.renderDonut('biPaPerformance',['Concluídas','Restante'],[state.performancePct||0,Math.max(0,100-(state.performancePct||0))],'',{suffix:'%',centerLabel:'Base'})
    }
  }

  BI.openPeopleDetail = function(moduleKey,index){
    const s=NEXO_BI_STATE.people?.[moduleKey]||{}

    if(moduleKey==='mood'){
      const labels=['Respostas','Humor médio','Positivos (4–5)','Críticos (1–2)']
      const values=[s.total||0,s.average==null?'—':Number(s.average).toFixed(2),s.total?pct(100*s.positive/s.total):'0%',s.total?pct(100*s.critical/s.total):'0%']
      const rows=(s.rows||[]).map(r=>[esc(r.operation_name),r.response_count||0,Number(r.average_mood||0).toFixed(2)])
      const human=[
        `${s.total||0} check-in(s) de humor foram registrados no período.`,
        s.total?`A média das ${s.total} respostas foi ${Number(s.average||0).toFixed(2).replace('.',',')}/5.`:'Ainda não há respostas para calcular a média.',
        `${s.positive||0} de ${s.total||0} respostas ficaram entre 4 e 5, consideradas positivas.`,
        `${s.critical||0} de ${s.total||0} respostas ficaram entre 1 e 2, consideradas críticas.`
      ][index]||'Resumo dos check-ins de humor do período.'
      return BI.openModal(labels[index]||'Humor',`Período ${s.start||''} a ${s.end||''}`,
        explainBox(human,'A escala de humor vai de 1 a 5; os resultados são agregados para preservar a leitura do grupo.')+
        kpis([['Valor',values[index]],['Respostas',s.total||0],['Positivos',s.positive||0],['Críticos',s.critical||0]])+
        `<div class="nexo-bi-section"><h3>Por operação</h3>${simpleTable(['Operação','Respostas','Média'],rows)}</div>`)
    }

    if(moduleKey==='climate'){
      const p=s.participation||{}, summary=s.summary||[]
      const rows=summary.map(q=>[esc(q.question_text),esc(q.question_type),q.response_count||0,q.question_type==='enps_0_10'?(q.enps==null?'—':q.enps):(q.average_value??'—')])
      const human=`${p.responded||0} de ${p.invited||0} colaborador(es) convidados responderam, o que representa ${pct(p.participation_pct||0)} de participação.`
      return BI.openModal('Pesquisa de Clima',s.surveyTitle||'',
        explainBox(human,s.anonymous?'Pesquisa anônima: identidade e respostas devem permanecer separadas.':'Pesquisa identificada: as respostas podem ser vinculadas ao participante conforme as permissões.')+
        kpis([['Convidados',p.invited||0],['Responderam',p.responded||0],['Participação',pct(p.participation_pct||0)],['Perguntas',summary.length]])+
        `<div class="nexo-bi-section"><h3>Resultados por pergunta</h3>${simpleTable(['Pergunta','Tipo','Respostas','Resultado'],rows)}</div>`)
    }

    if(moduleKey==='performance'){
      const rows=(s.evaluations||[]).map(e=>[esc(e.employees?.full_name||'—'),esc(e.operations?.cost_center||'—'),e.self_submitted_at?'Concluída':'Pendente',e.manager_submitted_at?'Concluída':'Pendente',esc(e.status)])
      const human=`Das ${s.total||0} avaliações do ciclo, ${s.completed||0} já têm autoavaliação e avaliação da liderança concluídas.`
      return BI.openModal('Avaliação de Desempenho',s.cycleTitle||'',
        explainBox(human,'Uma avaliação só entra como concluída quando as etapas previstas para o ciclo foram finalizadas.')+
        kpis([['Avaliações',s.total||0],['Autoavaliações',s.selfDone||0],['Lideranças',s.mgrDone||0],['Concluídas',s.completed||0]])+
        `<div class="nexo-bi-section"><h3>Avaliações do ciclo</h3>${simpleTable(['Colaborador','Operação','Autoavaliação','Liderança','Status'],rows)}</div>`)
    }

    if(moduleKey==='pdi'){
      const pdis=s.pdis||[]
      const actions=pdis.flatMap(p=>p.people_pdi_actions||[])
      const rows=pdis.map(p=>[esc(p.employees?.full_name||'—'),esc(p.title),esc(p.status),(p.people_pdi_actions||[]).length,window.formatDate?formatDate(p.due_date):p.due_date||'—'])
      const active=pdis.filter(p=>p.status!=='completed').length
      const done=pdis.filter(p=>p.status==='completed').length
      const human=`Há ${pdis.length} PDI(s) cadastrado(s): ${active} em acompanhamento e ${done} concluído(s), com ${actions.length} ação(ões) registradas.`
      return BI.openModal('PDI','Planos de Desenvolvimento Individual',
        explainBox(human,'O status do PDI e das ações mostra o andamento do desenvolvimento acordado para cada colaborador.')+
        kpis([['PDIs',pdis.length],['Ativos',active],['Concluídos',done],['Ações',actions.length]])+
        `<div class="nexo-bi-section"><h3>Planos considerados</h3>${simpleTable(['Colaborador','PDI','Status','Ações','Prazo'],rows)}</div>`)
    }

    const human=`O People Analytics consolida os módulos de experiência e desenvolvimento: humor ${s.moodAverage==null?'sem dado':Number(s.moodAverage).toFixed(2).replace('.',',')+'/5'}, clima ${pct(s.climatePct)}, desempenho ${pct(s.performancePct)} e ${s.pdiActive??0} PDI(s) ativo(s).`
    return BI.openModal('People Analytics','Visão consolidada',
      explainBox(human,'Os indicadores vêm dos módulos Humor, Pesquisa de Clima, Avaliação de Desempenho e PDI.')+
      kpis([['Humor médio',s.moodAverage??'—'],['Participação no clima',pct(s.climatePct)],['Avaliações concluídas',pct(s.performancePct)],['PDIs ativos',s.pdiActive??0]]))
  }

  // Cartões simples de outros módulos ganham comportamento visual sem alterar dados.
  BI.enhanceGenericStats = function(){
    document.querySelectorAll('.page.active .stat:not(.nexo-bi-clickable)').forEach(card=>{
      const strong=card.querySelector('strong'),label=card.querySelector('span')?.textContent?.trim()
      if(!strong||!label||Object.keys(overviewMetricMap).includes(strong.id)) return
      BI.makeClickable(card,()=>{
        const section=card.closest('.page,.people-section')
        const siblings=[...section.querySelectorAll('.stat')].map(s=>[s.querySelector('span')?.textContent?.trim(),s.querySelector('strong')?.textContent?.trim()]).filter(x=>x[0])
        const summaryHtml=kpis([
          ['Valor atual',strong.textContent.trim()],
          ['Indicadores relacionados',siblings.length],
          ['Registros na tabela',section.querySelectorAll('tbody tr').length],
          ['Módulo',section.querySelector('h1,h2')?.textContent||'NEXO']
        ])
        BI.openModal(label,'Detalhes disponíveis nesta tela',summaryHtml+`<div class="nexo-bi-section"><h3>Indicadores relacionados</h3>${simpleTable(['Indicador','Valor'],siblings.map(([a,b])=>[esc(a),esc(b||'—')]))}</div>`)
      })
    })
  }

  const observer=new MutationObserver(()=>BI.enhanceGenericStats())
  const boot=()=>{
    ensureModal();BI.enhanceGenericStats();observer.observe(document.body,{childList:true,subtree:true})
    if(document.getElementById('hireAnalyticsAdmin')){
      BI.ensureHireAdvancedFilters().then(()=>{
        if(window.NEXO_BI_STATE?.newHires) BI.renderHireDashboard(window.NEXO_BI_STATE.newHires)
        else window.loadHireAnalytics?.()
      })
    }
    if(window.NEXO_BI_STATE?.dashboard) BI.refreshOverview()
    const activePeople=document.querySelector('.people-section.active')?.id
    if(activePeople && window.NEXO_BI_STATE?.people?.[activePeople]) BI.refreshPeople(activePeople)
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()
})();
