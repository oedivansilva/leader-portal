let hireCtx = null
let hireBpos = []
let hireEmployees = []
let hireCases = []

const leaderQuestions = [
  ['employee_profile_fit','Aderência ao perfil da vaga'],
  ['employee_learning','Aprendizado e assimilação das atividades'],
  ['employee_quality','Qualidade das entregas iniciais'],
  ['employee_productivity','Produtividade compatível com o período de adaptação'],
  ['employee_posture','Postura profissional'],
  ['employee_teamwork','Relacionamento e trabalho em equipe'],
  ['employee_process','Cumprimento dos processos e orientações']
]

const hrQuestions = [
  ['rh_deadlines','Cumprimento dos prazos de acompanhamento'],
  ['rh_feedback','Realização de feedback com o novo contratado'],
  ['rh_communication','Qualidade da comunicação com o RH'],
  ['rh_records','Qualidade dos registros e evidências do acompanhamento'],
  ['rh_occurrences','Acompanhamento adequado de faltas e ocorrências'],
  ['rh_onboarding','Condução do processo de onboarding pela liderança']
]

const employeeQuestionLabels = {
  bpo_role_clarity:'A vaga e as atividades foram explicadas corretamente',
  bpo_schedule_clarity:'Escala e horário informados corresponderam ao encontrado na operação',
  bpo_pay_benefits:'Salário e benefícios foram explicados com clareza',
  bpo_process:'O processo seletivo foi organizado',
  bpo_communication:'A comunicação até a admissão foi adequada',
  onboarding_welcome:'Fui bem recebido no início das atividades',
  onboarding_training:'Recebi treinamento suficiente para começar',
  onboarding_resources:'Recebi recursos, equipamentos e acessos necessários',
  leader_clarity:'Minha liderança explicou claramente minhas atividades',
  leader_support:'Tive apoio da liderança quando tive dúvidas',
  leader_followup:'Minha liderança acompanhou minha adaptação'
}

function openPeopleModal(title, subtitle='', html='') {
  peopleModalTitle.textContent = title
  peopleModalSubtitle.textContent = subtitle
  peopleModalBody.innerHTML = html
  peopleModal.classList.remove('hidden')
}
window.closePeopleModal = () => peopleModal.classList.add('hidden')

function dateIsoLocal(date) {
  const d = new Date(date)
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)
}

function defaultRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth()-5, 1)
  return [dateIsoLocal(start), dateIsoLocal(now)]
}

function pct(value) {
  return value == null || value === '' ? '—' : `${Number(value).toFixed(1)}%`
}

function scoreFromAnswers(answers, prefixes=null) {
  const entries = Object.entries(answers || {}).filter(([key,value]) => {
    if (!Number.isFinite(Number(value))) return false
    return !prefixes || prefixes.some(prefix => key.startsWith(prefix))
  })
  if (!entries.length) return null
  return entries.reduce((sum,[,value])=>sum+Number(value),0)/entries.length*20
}

function scoreGuide() {
  return `<div class="hire-score-guide"><strong>Escala:</strong><span>1 — Muito abaixo</span><span>2 — Abaixo</span><span>3 — Dentro do esperado</span><span>4 — Acima</span><span>5 — Destaque</span></div>`
}

function questionsForm(questions, existing={}) {
  return questions.map(([key,label]) => `<div class="score-row"><div><strong>${escapeHTML(label)}</strong></div><div><select class="input hire-score" data-key="${key}" required><option value="">Nota</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${Number(existing[key])===v?'selected':''}>${v}</option>`).join('')}</select></div></div>`).join('')
}

async function loadHireBase() {
  const [bpos,employees] = await Promise.all([
    db.from('people_hire_bpos').select('*').order('name'),
    hireCtx.profile.role === 'admin'
      ? db.from('employees').select('id,registration,full_name,status,admission_date,operation_id,leader_id').neq('status','desligado').order('full_name')
      : Promise.resolve({data:[],error:null})
  ])
  if (bpos.error || employees.error) throw (bpos.error || employees.error)
  hireBpos = bpos.data || []
  hireEmployees = employees.data || []

  if (hireCtx.profile.role === 'admin') {
    hireBpo.innerHTML = '<option value="">Selecione</option>' + hireBpos.filter(b=>b.active).map(b=>`<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')
    hireBpoFilter.innerHTML = '<option value="">Todas as BPOs</option>' + hireBpos.map(b=>`<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')
    renderBpoList()
  }
}

function renderBpoList() {
  bpoList.innerHTML = hireBpos.map(b=>`<div class="people-task"><div><strong>${escapeHTML(b.name)}</strong></div><span class="badge ${b.active?'badge-green':'badge-gray'}">${b.active?'Ativa':'Inativa'}</span></div>`).join('') || '<div class="people-empty">Nenhuma BPO cadastrada.</div>'
}

bpoForm?.addEventListener('submit', async event => {
  event.preventDefault()
  const name = bpoName.value.trim()
  if (!name) return
  const { error } = await db.from('people_hire_bpos').insert({name})
  if (error) return alert(error.message)
  event.target.reset()
  await loadHireBase()
  alert('BPO cadastrada.')
})

hireCaseForm?.addEventListener('submit', async event => {
  event.preventDefault()
  const { data, error } = await db.rpc('create_people_hire_case', {
    p_employee_id: hireEmployee.value,
    p_bpo_id: hireBpo.value,
    p_notes: hireNotes.value.trim() || null
  })
  if (error) return alert(error.message)
  event.target.reset()
  alert('Acompanhamento criado com D+7, D+30, D+60 e D+90.')
  await loadHireCases()
  await populateHireCandidates()
  if (hireCtx.profile.role === 'admin') loadHireAnalytics()
})

async function populateHireCandidates() {
  if (hireCtx.profile.role !== 'admin') return
  const { data: existing, error } = await db.from('people_hire_cases').select('employee_id')
  if (error) return
  const used = new Set((existing || []).map(row=>row.employee_id))
  const candidates = hireEmployees.filter(e=>!used.has(e.id))
  hireEmployee.innerHTML = '<option value="">Selecione</option>' + candidates.map(e=>`<option value="${e.id}">${escapeHTML(e.registration)} — ${escapeHTML(e.full_name)} · adm. ${formatDate(e.admission_date)}</option>`).join('')
}

async function loadHireCases() {
  const { data, error } = await db.rpc('get_people_hire_case_list')
  if (error) return alert(error.message)
  hireCases = data || []
  hireCaseRows.innerHTML = hireCases.map(row=>{
    const absence = Number(row.f_count||0)+Number(row.ns_count||0)
    const stage = `D+${row.next_checkpoint_day}`
    return `<tr>
      <td><strong>${escapeHTML(row.employee_name)}</strong><br><small>${escapeHTML(row.registration)}</small></td>
      <td>${formatDate(row.admission_date)}<br><small>D+${row.day_number}</small></td>
      <td>${escapeHTML(row.bpo_name)}</td>
      <td>${escapeHTML(row.operation_name)}</td>
      <td>${escapeHTML(row.leader_name||'Sem líder')}</td>
      <td><strong>${stage}</strong><br><small>${formatDate(row.next_due_date)}</small></td>
      <td><span class="badge ${absence?'badge-yellow':'badge-green'}">${absence}</span>${row.attendance_pct!=null?`<br><small>${pct(row.attendance_pct)}</small>`:''}</td>
      <td><span class="badge badge-gray">${Number(row.am_count||0)}</span></td>
      <td><button class="btn btn-light" onclick="openHireCase('${row.case_id}')">Abrir</button></td>
    </tr>`
  }).join('') || '<tr><td colspan="9" class="empty">Nenhum acompanhamento criado.</td></tr>'
}
window.loadHireCases = loadHireCases

async function loadHireAnalytics() {
  if (hireCtx.profile.role !== 'admin') return
  const { data, error } = await db.rpc('get_people_hire_bpo_analytics', {
    p_start: hireStart.value,
    p_end: hireEnd.value,
    p_bpo_id: hireBpoFilter.value || null
  })
  if (error) return alert(error.message)
  const rows = data || []
  const sumHires = rows.reduce((s,r)=>s+Number(r.hires||0),0)
  const weighted = key => {
    const valid = rows.filter(r=>r[key]!=null && Number(r.hires)>0)
    const denominator = valid.reduce((s,r)=>s+Number(r.hires),0)
    return denominator ? valid.reduce((s,r)=>s+Number(r[key])*Number(r.hires),0)/denominator : null
  }
  hireOverallCards.innerHTML = `
    <div class="people-mini-stat"><span>Contratados</span><strong>${sumHires}</strong></div>
    <div class="people-mini-stat"><span>Qualidade do recrutamento</span><strong>${pct(weighted('recruitment_pct'))}</strong></div>
    <div class="people-mini-stat"><span>Adaptação</span><strong>${pct(weighted('adaptation_pct'))}</strong></div>
    <div class="people-mini-stat"><span>Onboarding</span><strong>${pct(weighted('onboarding_pct'))}</strong></div>
    <div class="people-mini-stat"><span>Liderança</span><strong>${pct(weighted('leadership_pct'))}</strong></div>
    <div class="people-mini-stat"><span>Assiduidade F/NS</span><strong>${pct(weighted('attendance_pct'))}</strong></div>`
  hireAnalyticsRows.innerHTML = rows.map(r=>`<tr><td><strong>${escapeHTML(r.bpo_name)}</strong></td><td>${r.hires}</td><td>${pct(r.recruitment_pct)}</td><td>${pct(r.adaptation_pct)}</td><td>${pct(r.onboarding_pct)}</td><td>${pct(r.leadership_pct)}</td><td>${pct(r.attendance_pct)}</td><td>${r.medical_certificates||0}</td><td>${pct(r.retention_d30)}</td><td>${pct(r.retention_d90)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Sem dados no período.</td></tr>'
}
window.loadHireAnalytics = loadHireAnalytics

window.openHireCase = async function(caseId) {
  const related = hireCases.find(row=>row.case_id===caseId)
  const { data: checkpoints, error } = await db.from('people_hire_checkpoints').select('*').eq('case_id',caseId).order('checkpoint_day')
  if (error) return alert(error.message)
  const attendance = related || {}
  const html = `
    <div class="people-mini-grid" style="margin-bottom:16px">
      <div class="people-mini-stat"><span>BPO</span><strong>${escapeHTML(related?.bpo_name||'—')}</strong></div>
      <div class="people-mini-stat"><span>Assiduidade</span><strong>${pct(attendance.attendance_pct)}</strong></div>
      <div class="people-mini-stat"><span>Faltas / NS</span><strong>${Number(attendance.f_count||0)+Number(attendance.ns_count||0)}</strong></div>
      <div class="people-mini-stat"><span>Atestados AM</span><strong>${attendance.am_count||0}</strong></div>
    </div>
    <div class="notice" style="margin-bottom:14px">Atestados médicos são exibidos apenas como contexto. Eles não reduzem automaticamente a nota do contratado nem da BPO.</div>
    <div class="hire-timeline">${(checkpoints||[]).map(cp=>renderCheckpointCard(cp, related)).join('')}</div>`
  openPeopleModal(`${related?.employee_name||'Novo contratado'} · ${related?.registration||''}`,`Admissão ${formatDate(related?.admission_date)} · ${related?.operation_name||''}`,html)
}

function renderCheckpointCard(cp, related) {
  const due = cp.due_date <= new Date().toISOString().slice(0,10)
  const leaderCan = hireCtx.profile.role==='leader' && related?.leader_id===hireCtx.profile.id
  const adminCan = hireCtx.profile.role==='admin'
  return `<div class="people-card hire-checkpoint-card">
    <div class="page-head"><div><h3>D+${cp.checkpoint_day}</h3><p class="muted">Previsto para ${formatDate(cp.due_date)}</p></div><span class="badge ${due?'badge-green':'badge-gray'}">${due?'Disponível':'Aguardando'}</span></div>
    <div class="hire-status-row">
      <span>Líder: <strong>${cp.leader_submitted_at?'Concluída':'Pendente'}</strong></span>
      <span>Colaborador: <strong>${cp.employee_submitted_at?'Concluída':'Pendente'}</strong></span>
      <span>RH: <strong>${cp.hr_submitted_at?'Concluída':'Pendente'}</strong></span>
    </div>
    <div class="actions" style="margin-top:12px">
      ${leaderCan && due ? `<button class="btn btn-primary" onclick="openHireEvaluation('${cp.id}','leader')">${cp.leader_submitted_at?'Revisar avaliação':'Avaliar contratado'}</button>`:''}
      ${adminCan && due ? `<button class="btn btn-primary" onclick="openHireEvaluation('${cp.id}','hr')">${cp.hr_submitted_at?'Revisar avaliação RH':'Avaliar liderança'}</button>`:''}
      ${(cp.leader_submitted_at||cp.employee_submitted_at||cp.hr_submitted_at)?`<button class="btn btn-light" onclick="viewHireCheckpointResults('${cp.id}')">Ver resultados</button>`:''}
    </div>
  </div>`
}

window.openHireEvaluation = async function(checkpointId, reviewerType) {
  const { data: payload, error } = await db.rpc('get_people_hire_checkpoint_payload',{p_checkpoint_id:checkpointId})
  if (error) return alert(error.message)
  const previous = (payload.evaluations||[]).find(e=>e.reviewer_type===reviewerType) || {}
  const questions = reviewerType==='leader' ? leaderQuestions : hrQuestions
  const recommendations = reviewerType==='leader'
    ? [['maintain','Manter / dentro do esperado'],['monitor','Acompanhar'],['action_plan','Plano de ação'],['not_adherent','Não aderente ao perfil']]
    : [['adequate','Processo adequado'],['monitor','Acompanhar liderança'],['action','Ação necessária']]
  const html = `<form id="hireEvaluationForm" data-checkpoint-id="${checkpointId}" data-reviewer-type="${reviewerType}">
    ${scoreGuide()}
    ${questionsForm(questions,previous.answers||{})}
    <div class="field"><label>Observação <span class="muted">(opcional)</span></label><textarea id="hireEvalComment" class="input" rows="4">${escapeHTML(previous.comment||'')}</textarea></div>
    <div class="field"><label>Conclusão</label><select id="hireEvalRecommendation" class="input"><option value="">Selecione</option>${recommendations.map(([value,label])=>`<option value="${value}" ${previous.recommendation===value?'selected':''}>${escapeHTML(label)}</option>`).join('')}</select></div>
    <button class="btn btn-primary">Salvar avaliação</button>
  </form>`
  openPeopleModal(`${reviewerType==='leader'?'Avaliação do novo contratado':'Avaliação RH da liderança'} — D+${payload.checkpoint.day}`,`${payload.case.employee_name} · ${payload.case.bpo_name}`,html)
  hireEvaluationForm.addEventListener('submit',submitHireEvaluation)
}

async function submitHireEvaluation(event) {
  event.preventDefault()
  const form = event.currentTarget
  const answers = {}
  for (const select of form.querySelectorAll('.hire-score')) {
    if (!select.value) return alert('Dê uma nota para todos os itens.')
    answers[select.dataset.key] = Number(select.value)
  }
  const { error } = await db.rpc('submit_people_hire_evaluation', {
    p_checkpoint_id: form.dataset.checkpointId,
    p_reviewer_type: form.dataset.reviewerType,
    p_answers: answers,
    p_comment: hireEvalComment.value.trim() || null,
    p_recommendation: hireEvalRecommendation.value || null
  })
  if (error) return alert(error.message)
  closePeopleModal()
  alert('Avaliação salva.')
  await loadHireCases()
}

window.viewHireCheckpointResults = async function(checkpointId) {
  const { data: payload, error } = await db.rpc('get_people_hire_checkpoint_payload',{p_checkpoint_id:checkpointId})
  if (error) return alert(error.message)
  const evaluations = payload.evaluations || []
  const leader = evaluations.find(e=>e.reviewer_type==='leader')
  const employee = evaluations.find(e=>e.reviewer_type==='employee')
  const hr = evaluations.find(e=>e.reviewer_type==='hr')
  const cards = [
    ['Adaptação do contratado',scoreFromAnswers(leader?.answers,['employee_']),leader],
    ['Qualidade do recrutamento',scoreFromAnswers(employee?.answers,['bpo_']),employee],
    ['Onboarding',scoreFromAnswers(employee?.answers,['onboarding_']),employee],
    ['Percepção da liderança',scoreFromAnswers(employee?.answers,['leader_']),employee],
    ['Gestão do processo pelo líder',scoreFromAnswers(hr?.answers,['rh_']),hr]
  ]
  const details = evaluations.map(ev=>{
    const labels = ev.reviewer_type==='leader' ? Object.fromEntries(leaderQuestions) : ev.reviewer_type==='hr' ? Object.fromEntries(hrQuestions) : employeeQuestionLabels
    return `<div class="people-card" style="margin-top:12px"><div class="page-head"><div><h3>${ev.reviewer_type==='leader'?'Liderança avaliou o contratado':ev.reviewer_type==='employee'?'Contratado avaliou sua experiência':'RH avaliou a liderança'}</h3><p class="muted">${ev.reviewer_name?escapeHTML(ev.reviewer_name)+' · ':''}${new Date(ev.submitted_at).toLocaleString('pt-BR')}</p></div></div>${Object.entries(ev.answers||{}).map(([key,value])=>`<div class="people-task"><span>${escapeHTML(labels[key]||key)}</span><strong>${value}/5</strong></div>`).join('')}${ev.comment?`<div class="notice" style="margin-top:10px"><strong>Observação:</strong><br>${escapeHTML(ev.comment)}</div>`:''}</div>`
  }).join('')
  const a = payload.attendance || {}
  const html = `<div class="people-mini-grid">${cards.map(([label,value])=>`<div class="people-mini-stat"><span>${label}</span><strong>${pct(value)}</strong></div>`).join('')}<div class="people-mini-stat"><span>Assiduidade F/NS</span><strong>${pct(a.attendance_pct)}</strong></div></div><div class="notice" style="margin-top:14px">D+${payload.checkpoint.day}: ${a.f_count||0} falta(s), ${a.ns_count||0} no-show e ${a.am_count||0} atestado(s). AM é apenas contextual.</div>${details || '<div class="people-empty" style="margin-top:14px">Nenhuma avaliação enviada ainda.</div>'}`
  openPeopleModal(`Resultados — D+${payload.checkpoint.day}`,`${payload.case.employee_name} · ${payload.case.bpo_name}`,html)
}

getSessionContext().then(async context => {
  if (!context) return
  if (context.profile.role === 'employee') return location.replace('new-hires.html')
  if (!hasModuleAccess(context.profile,'new_hires')) return location.replace(firstAllowedModuleUrl(context.profile))
  hireCtx = context
  renderPortalSidebar(portalSidebar,context.profile,'new_hires')
  const [start,end] = defaultRange()
  hireStart.value=start; hireEnd.value=end
  if (context.profile.role==='admin') {
    hireAdminSetup.classList.remove('hidden')
    hireAnalyticsAdmin.classList.remove('hidden')
  }
  try {
    await loadHireBase()
    if (context.profile.role==='admin') await populateHireCandidates()
    await loadHireCases()
    if (context.profile.role==='admin') await loadHireAnalytics()
  } catch (error) {
    alert(`Não foi possível carregar Novos Contratados: ${error.message}`)
  }
})
