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
    if(state.planned) items.push(`ABS usa ${state.absences?.length||0} ausência(s) sobre ${state.planned} dia(s) planejado(s).`)
    insights.innerHTML=`<h4>Insights do período</h4><div class="nexo-bi-insight-list">${items.map(x=>`<div class="nexo-bi-insight">${esc(x)}</div>`).join('')||'<div class="muted">Sem dados suficientes para gerar insights.</div>'}</div>`

    Object.entries(overviewMetricMap).forEach(([id,[label,type]])=>{
      const strong=document.getElementById(id); const card=strong?.closest('.stat')
      BI.makeClickable(card,()=>BI.openOverviewDetail(type,label,id))
    })
  }

  BI.openOverviewDetail = function(type,label,id){
    const s=NEXO_BI_STATE.dashboard||{}
    const value=document.getElementById(id)?.textContent||'—'
    const subtitle=`${s.selectedMonth||''}${s.operationLabel?' · '+s.operationLabel:''}`
    let html=''
    if(type==='abs'){
      const byOp=Object.entries(s.absenceByOperation||{}).sort((a,b)=>b[1]-a[1]).map(([name,count])=>[esc(name),count])
      const byScale=(s.scaleAbsenceRows||[]).map(r=>[esc(r.label),r.absences,r.medicalCertificates])
      html=kpis([['Indicador',value],['Dias planejados',s.planned||0],['Justificadas',s.justifiedCount||0],['Injustificadas',s.unjustifiedCount||0]])+
        `<div class="nexo-bi-note">O ABS é calculado com base nas ausências registradas no período e nos dias planejados conforme a escala vigente. AM/FJ aparecem como justificadas; F/NS como injustificadas.</div>`+
        `<div class="nexo-bi-section"><h3>Por operação</h3>${simpleTable(['Operação','Ausências'],byOp)}</div>`+
        `<div class="nexo-bi-section"><h3>Por turno / escala</h3>${simpleTable(['Turno / escala','F/NS','AM'],byScale)}</div>`
    } else if(type==='discipline'){
      const byRegion=(s.regions||[]).map(r=>[esc(r.label),r.value]);const byLeader=(s.leaders||[]).map(r=>[esc(r.label),r.value])
      html=kpis([['Indicador',value],['Advertências',s.warnings?.length||0],['Suspensões',s.suspensions?.length||0],['Total de medidas',(s.rows||[]).length]])+
        `<div class="nexo-bi-section"><h3>Por região</h3>${simpleTable(['Região','Medidas'],byRegion)}</div>`+
        `<div class="nexo-bi-section"><h3>Por liderança</h3>${simpleTable(['Liderança','Medidas'],byLeader)}</div>`
    } else if(type==='time'){
      html=kpis([['Indicador',value],['Aplicadas',s.applied?.length||0],['Desde a mais antiga',s.timeOldest||'—'],['Desde a mais recente',s.timeNewest||'—']])+
        `<div class="nexo-bi-note">Os tempos usam as solicitações aplicadas no período. O NEXO compara a data de aplicação com as datas das ocorrências registradas.</div>`
    } else {
      const rows=(s.movements||[]).map(m=>[esc(m.type),esc(m.employee?.registration||'—'),esc(m.employee?.full_name||'—'),window.formatDate?formatDate(m.date):m.date])
      html=kpis([['Indicador',value],['Quadro inicial',s.headStart||0],['Quadro final',s.headEnd||0],['Quadro médio',Number(s.averageHead||0).toFixed(1)]])+
        `<div class="nexo-bi-note">Turnover de desligamentos = desligamentos ÷ quadro médio. Turnover geral considera a média entre admissões e desligamentos no numerador.</div>`+
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
      const defs=[['hires','Contratados',summary.hires??0],['recruitment','Qualidade do recrutamento',pct(summary.recruitment_pct)],['adaptation','Adaptação',pct(summary.adaptation_pct)],['onboarding','Onboarding',pct(summary.onboarding_pct)],['leadership','Liderança',pct(summary.leadership_pct)],['attendance','Assiduidade F/NS',pct(summary.attendance_pct)]]
      container.innerHTML=defs.map(([key,label,value])=>`<div class="people-mini-stat nexo-bi-clickable" data-bi-hire="${key}" tabindex="0"><span>${label}</span><strong>${value}</strong></div>`).join('')
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
      return BI.openModal(meta.label,`Fonte: ${meta.source}`,kpis([['Total',value],['BPO',s.bpo_hires||0],['Interno',s.internal_hires||0],['Ativos no acompanhamento',s.tracking_hires||0]])+`<div class="nexo-bi-section"><h3>Colaboradores considerados</h3>${simpleTable(['Colaborador','MAT','Operação','Líder','Origem','Admissão'],rows)}</div>`)
    }
    if(metric==='attendance'){
      const rows=(d.cases||[]).map(c=>[esc(c.employee_name),c.planned_days??0,c.f_count??0,c.ns_count??0,c.am_count??0,pct(c.attendance_pct)])
      return BI.openModal(meta.label,`Fonte: ${meta.source}`,kpis([['Indicador',value],['Faltas F',s.f_count||0],['No-show NS',s.ns_count||0],['Atestados AM',s.medical_certificates||0]])+`<div class="nexo-bi-note">F e NS reduzem a assiduidade. AM é apresentado separadamente e não reduz automaticamente a nota do contratado ou da BPO.</div><div class="nexo-bi-section"><h3>Por colaborador</h3>${simpleTable(['Colaborador','Dias previstos','F','NS','AM','Assiduidade'],rows)}</div>`)
    }
    const qs=(d.questions||[]).filter(q=>meta.prefixes.some(p=>String(q.question_key||'').startsWith(p)))
    const evals=(d.evaluations||[]).filter(e=>meta.reviewers?.includes(e.reviewer_type)).filter(e=>Object.keys(e.answers||{}).some(k=>meta.prefixes.some(p=>k.startsWith(p))))
    const qrows=qs.map(q=>[esc(q.question_label),`<span class="nexo-bi-score-badge">${pct(q.average_pct)}</span>`,q.response_count||0,esc(q.respondent_label||'')])
    const erows=evals.map(e=>[esc(e.employee_name),`D+${e.checkpoint_day}`,esc(e.reviewer_name||e.respondent_label||'—'),esc(e.respondent_label||''),`<span class="nexo-bi-score-badge">${pct(e.metric_pct?.[metric])}</span>`])
    const comments=evals.filter(e=>e.comment).map(e=>`<div class="nexo-bi-comment"><strong>${esc(e.employee_name)} · D+${e.checkpoint_day}</strong><div>${esc(e.comment)}</div><div class="nexo-bi-source">${esc(e.respondent_label)}: ${esc(e.reviewer_name||'—')}</div></div>`).join('')
    BI.openModal(meta.label,`Fonte principal: ${meta.source}`,kpis([['Indicador',value],['Avaliações consideradas',evals.length],['Perguntas com resposta',qs.length],['Colaboradores',new Set(evals.map(e=>e.employee_id)).size]])+`<div class="nexo-bi-note">A nota é formada pelas respostas de 1 a 5 das perguntas que pertencem a esta dimensão. Cada resposta é convertida para percentual (nota ÷ 5 × 100) e agregada no filtro selecionado.</div><div class="nexo-bi-section"><h3>Resultado por pergunta</h3>${simpleTable(['Pergunta','Média','Respostas','Quem responde'],qrows)}</div><div class="nexo-bi-section"><h3>Avaliações que compõem o indicador</h3>${simpleTable(['Colaborador','Etapa','Quem respondeu','Perfil','Nota desta dimensão'],erows)}</div>${comments?`<div class="nexo-bi-section"><h3>Comentários registrados</h3>${comments}</div>`:''}`)
  }

  // ================================================================
  // PESSOAS & DESENVOLVIMENTO
  // ================================================================
  BI.refreshPeople = function(moduleKey){
    const state=NEXO_BI_STATE.people?.[moduleKey]
    if(!state) return
    const section=document.getElementById(moduleKey)
    if(!section) return
    const cards=section.querySelectorAll('.people-mini-stat')
    cards.forEach((card,index)=>BI.makeClickable(card,()=>BI.openPeopleDetail(moduleKey,index)))

    let charts=document.getElementById(`peopleBiCharts-${moduleKey}`)
    if(!charts){charts=document.createElement('div');charts.id=`peopleBiCharts-${moduleKey}`;charts.className='nexo-bi-charts';const anchor=section.querySelector('.people-mini-grid');anchor?.insertAdjacentElement('afterend',charts)}
    if(!charts) return

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
      const labels=['Respostas','Humor médio','Positivos (4–5)','Críticos (1–2)'];const values=[s.total||0,s.average??'—',s.total?pct(100*s.positive/s.total):'0%',s.total?pct(100*s.critical/s.total):'0%']
      const rows=(s.rows||[]).map(r=>[esc(r.operation_name),r.response_count||0,Number(r.average_mood||0).toFixed(2)])
      return BI.openModal(labels[index]||'Humor',`Período ${s.start||''} a ${s.end||''}`,kpis([['Valor',values[index]],['Respostas',s.total||0],['Positivos',s.positive||0],['Críticos',s.critical||0]])+`<div class="nexo-bi-section"><h3>Por operação</h3>${simpleTable(['Operação','Respostas','Média'],rows)}</div>`)
    }
    if(moduleKey==='climate'){
      const p=s.participation||{};const summary=s.summary||[]
      const rows=summary.map(q=>[esc(q.question_text),esc(q.question_type),q.response_count||0,q.question_type==='enps_0_10'?(q.enps==null?'—':q.enps):(q.average_value??'—')])
      return BI.openModal('Pesquisa de Clima',s.surveyTitle||'',kpis([['Convidados',p.invited||0],['Responderam',p.responded||0],['Participação',pct(p.participation_pct||0)],['Perguntas',summary.length]])+`<div class="nexo-bi-section"><h3>Resultados por pergunta</h3>${simpleTable(['Pergunta','Tipo','Respostas','Resultado'],rows)}</div>`)
    }
    if(moduleKey==='performance'){
      const rows=(s.evaluations||[]).map(e=>[esc(e.employees?.full_name||'—'),esc(e.operations?.cost_center||'—'),e.self_submitted_at?'Concluída':'Pendente',e.manager_submitted_at?'Concluída':'Pendente',esc(e.status)])
      return BI.openModal('Avaliação de Desempenho',s.cycleTitle||'',kpis([['Avaliações',s.total||0],['Autoavaliações',s.selfDone||0],['Lideranças',s.mgrDone||0],['Concluídas',s.completed||0]])+`<div class="nexo-bi-section"><h3>Avaliações do ciclo</h3>${simpleTable(['Colaborador','Operação','Autoavaliação','Liderança','Status'],rows)}</div>`)
    }
    if(moduleKey==='pdi'){
      const rows=(s.pdis||[]).map(p=>[esc(p.employees?.full_name||'—'),esc(p.title),esc(p.status),(p.people_pdi_actions||[]).length,window.formatDate?formatDate(p.due_date):p.due_date||'—'])
      const summaryHtml=kpis([
        ['PDIs',s.pdis?.length||0],
        ['Ativos',(s.pdis||[]).filter(p=>p.status!=='completed').length],
        ['Concluídos',(s.pdis||[]).filter(p=>p.status==='completed').length],
        ['Ações',(s.pdis||[]).reduce((a,p)=>a+(p.people_pdi_actions||[]).length,0)]
      ])
      return BI.openModal('PDI','Planos de Desenvolvimento Individual',summaryHtml+`<div class="nexo-bi-section"><h3>Planos considerados</h3>${simpleTable(['Colaborador','PDI','Status','Ações','Prazo'],rows)}</div>`)
    }
    return BI.openModal('People Analytics','Visão consolidada',kpis([['Humor médio',s.moodAverage??'—'],['Participação no clima',pct(s.climatePct)],['Avaliações concluídas',pct(s.performancePct)],['PDIs ativos',s.pdiActive??0]])+`<div class="nexo-bi-note">Os indicadores consolidados usam os dados disponíveis nos módulos Humor, Clima, Desempenho e PDI para o período/ciclo atual.</div>`)
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
