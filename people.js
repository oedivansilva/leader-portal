let peopleCtx = null
let currentEmployee = null
let selectedMood = null
const peopleModule = new URLSearchParams(location.search).get('module') || 'mood'

const moodLabels = {
  1: ['😞','Muito mal'], 2: ['😕','Mal'], 3: ['😐','Neutro'], 4: ['🙂','Bem'], 5: ['😄','Muito bem']
}

function showPeopleSection(moduleKey) {
  document.querySelectorAll('.people-section').forEach(section => section.classList.toggle('active', section.id === moduleKey))
}

function openPeopleModal(title, subtitle = '', html = '') {
  peopleModalTitle.textContent = title
  peopleModalSubtitle.textContent = subtitle
  peopleModalBody.innerHTML = html
  peopleModal.classList.remove('hidden')
}
window.closePeopleModal = () => peopleModal.classList.add('hidden')

async function loadEmployeeContext() {
  const { data, error } = await db.from('employees')
    .select('id,registration,full_name,status,operation_id,shift_id,operations(cost_center,department)')
    .eq('id', peopleCtx.profile.employee_id)
    .single()
  if (error) throw error
  currentEmployee = data
  peopleWelcome.textContent = `Olá, ${data.full_name.split(' ')[0]} 👋`
  peopleSubtitle.textContent = `${data.registration} · ${data.operations?.cost_center || ''} ${data.operations?.department ? '· ' + data.operations.department : ''}`
}

function setMoodSelection(value) {
  selectedMood = Number(value)
  document.querySelectorAll('.mood-option').forEach(button => button.classList.toggle('active', Number(button.dataset.mood) === selectedMood))
}

document.querySelectorAll('.mood-option').forEach(button => button.addEventListener('click', () => setMoodSelection(button.dataset.mood)))

async function loadTodayMood() {
  const today = new Date().toISOString().slice(0,10)
  const { data, error } = await db.from('people_mood_checkins').select('mood,note,wants_contact').eq('checkin_date', today).maybeSingle()
  if (error) return console.warn(error)
  if (!data) {
    todayMoodState.innerHTML = '<div class="people-empty">Ainda não respondido.</div>'
    return
  }
  setMoodSelection(data.mood)
  moodNote.value = data.note || ''
  moodContact.checked = !!data.wants_contact
  const [emoji,label] = moodLabels[data.mood] || ['','']
  todayMoodState.innerHTML = `<div style="text-align:center;padding:18px"><div style="font-size:54px">${emoji}</div><strong>${escapeHTML(label)}</strong><p class="muted">Você já fez seu check-in hoje. Pode atualizar até o fim do dia.</p></div>`
}

saveMoodBtn.addEventListener('click', async () => {
  if (!selectedMood) return alert('Escolha como você está se sentindo hoje.')
  saveMoodBtn.disabled = true
  const { error } = await db.rpc('submit_mood_checkin', {
    p_mood: selectedMood,
    p_note: moodNote.value.trim() || null,
    p_wants_contact: moodContact.checked
  })
  saveMoodBtn.disabled = false
  if (error) return alert(error.message)
  alert('Check-in salvo. Obrigado por compartilhar. 🧡')
  loadTodayMood()
})

async function loadClimateSurveys() {
  const { data, error } = await db.rpc('get_my_active_climate_surveys')
  if (error) return climateSurveyList.innerHTML = `<div class="notice">${escapeHTML(error.message)}</div>`
  climateSurveyList.innerHTML = (data || []).map(survey => `
    <div class="people-task">
      <div><h4>${escapeHTML(survey.title)}</h4><p class="muted">${escapeHTML(survey.description || 'Pesquisa de clima')} · até ${formatDate(survey.end_date)} ${survey.anonymous ? '· Anônima' : ''}</p></div>
      ${survey.responded ? '<span class="badge badge-green">Respondida</span>' : `<button class="btn btn-primary" onclick="openClimateSurvey('${survey.id}','${escapeHTML(survey.title).replace(/'/g,'&#39;')}')">Responder</button>`}
    </div>`).join('') || '<div class="people-empty">Nenhuma pesquisa disponível no momento.</div>'
}

window.openClimateSurvey = async function(id, title) {
  const { data, error } = await db.rpc('get_climate_survey_questions', { p_survey_id: id })
  if (error) return alert(error.message)
  const questions = data || []
  if (!questions.length) return alert('Esta pesquisa ainda não possui perguntas disponíveis.')
  const html = `<form id="climateAnswerForm" data-survey-id="${id}">${questions.map((q,index) => {
    const label = `<strong>${index+1}. ${escapeHTML(q.question_text)}</strong><div class="muted">${escapeHTML(q.category || 'Geral')}</div>`
    if (q.question_type === 'text') return `<div class="survey-question">${label}<textarea class="input climate-answer" data-question-id="${q.id}" data-type="text" data-required="${q.required}" rows="3"></textarea></div>`
    const max = q.question_type === 'enps_0_10' ? 10 : 5
    const min = q.question_type === 'enps_0_10' ? 0 : 1
    return `<div class="survey-question">${label}<div class="scale-options">${Array.from({length:max-min+1},(_,i)=>i+min).map(value => `<label><input type="radio" class="climate-answer" name="q_${q.id}" value="${value}" data-question-id="${q.id}" data-type="number" data-required="${q.required}"><span>${value}</span></label>`).join('')}</div></div>`
  }).join('')}<div style="margin-top:18px"><button class="btn btn-primary" type="submit">Enviar respostas</button></div></form>`
  openPeopleModal(title, 'Depois de enviar, a pesquisa não poderá ser respondida novamente.', html)
  climateAnswerForm.addEventListener('submit', submitClimateSurvey)
}

async function submitClimateSurvey(event) {
  event.preventDefault()
  const form = event.currentTarget
  const answers = []
  const questionIds = [...new Set([...form.querySelectorAll('.climate-answer')].map(el => el.dataset.questionId))]
  for (const questionId of questionIds) {
    const controls = [...form.querySelectorAll(`.climate-answer[data-question-id="${questionId}"]`)]
    const type = controls[0]?.dataset.type
    const required = controls[0]?.dataset.required === 'true'
    if (type === 'text') {
      const value = controls[0].value.trim()
      if (required && !value) return alert('Responda todas as perguntas obrigatórias.')
      answers.push({ question_id: questionId, text_value: value || null })
    } else {
      const checked = controls.find(el => el.checked)
      if (required && !checked) return alert('Responda todas as perguntas obrigatórias.')
      answers.push({ question_id: questionId, numeric_value: checked ? Number(checked.value) : null })
    }
  }
  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  const { error } = await db.rpc('submit_climate_survey', { p_survey_id: form.dataset.surveyId, p_answers: answers })
  button.disabled = false
  if (error) return alert(error.message)
  closePeopleModal()
  alert('Pesquisa enviada. Obrigado pela participação! 🧡')
  loadClimateSurveys()
}

async function loadPerformance() {
  const { data, error } = await db.from('people_performance_evaluations')
    .select('id,status,self_submitted_at,manager_submitted_at,cycle_id,people_performance_cycles(title,end_date,status)')
    .order('created_at', { ascending: false })
  if (error) return performanceList.innerHTML = `<div class="notice">${escapeHTML(error.message)}</div>`
  performanceList.innerHTML = (data || []).map(item => {
    const cycle = item.people_performance_cycles || {}
    const selfDone = !!item.self_submitted_at
    return `<div class="people-task"><div><h4>${escapeHTML(cycle.title || 'Avaliação')}</h4><p class="muted">Prazo: ${formatDate(cycle.end_date)} · Status: ${escapeHTML(item.status)}</p></div><button class="btn ${selfDone ? 'btn-light' : 'btn-primary'}" onclick="openSelfEvaluation('${item.id}')">${selfDone ? 'Ver avaliação' : 'Fazer autoavaliação'}</button></div>`
  }).join('') || '<div class="people-empty">Nenhuma avaliação disponível.</div>'
}

window.openSelfEvaluation = async function(evaluationId) {
  const { data: evaluation, error: evalError } = await db.from('people_performance_evaluations')
    .select('id,cycle_id,self_submitted_at,manager_submitted_at,people_performance_cycles(title)')
    .eq('id', evaluationId).single()
  if (evalError) return alert(evalError.message)
  const [{ data: comps, error: compError }, { data: existing, error: scoreError }] = await Promise.all([
    db.from('people_performance_cycle_competencies').select('competency_id,weight,people_performance_competencies(name,category,description)').eq('cycle_id', evaluation.cycle_id),
    db.from('people_performance_scores').select('*').eq('evaluation_id', evaluationId)
  ])
  if (compError || scoreError) return alert((compError || scoreError).message)
  const scoreMap = new Map((existing || []).map(score => [score.competency_id, score]))
  const readonly = !!evaluation.self_submitted_at
  const html = `<form id="selfEvaluationForm" data-evaluation-id="${evaluationId}">${(comps || []).map(row => {
    const c = row.people_performance_competencies || {}; const current = scoreMap.get(row.competency_id) || {}
    return `<div class="score-row"><div><strong>${escapeHTML(c.name || '')}</strong><div class="muted">${escapeHTML(c.category || '')}${c.description ? ' · '+escapeHTML(c.description) : ''}</div>${evaluation.manager_submitted_at && current.manager_score ? `<div style="margin-top:8px">Nota da liderança: <strong>${current.manager_score}/5</strong></div>` : ''}</div><div><select class="input self-score" data-competency-id="${row.competency_id}" ${readonly?'disabled':''}><option value="">Nota</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${Number(current.self_score)===v?'selected':''}>${v}</option>`).join('')}</select><textarea class="input self-comment" data-competency-id="${row.competency_id}" rows="2" placeholder="Comentário opcional" ${readonly?'disabled':''}>${escapeHTML(current.self_comment || '')}</textarea></div></div>`
  }).join('')}${readonly ? '<div class="notice">Sua autoavaliação já foi enviada.</div>' : '<button class="btn btn-primary" type="submit">Enviar autoavaliação</button>'}</form>`
  openPeopleModal(evaluation.people_performance_cycles?.title || 'Autoavaliação', 'Escala: 1 = abaixo do esperado · 5 = destaque', html)
  if (!readonly) selfEvaluationForm.addEventListener('submit', submitSelfEvaluation)
}

async function submitSelfEvaluation(event) {
  event.preventDefault()
  const form = event.currentTarget
  const scores = [...form.querySelectorAll('.self-score')].map(select => ({
    competency_id: select.dataset.competencyId,
    score: Number(select.value),
    comment: form.querySelector(`.self-comment[data-competency-id="${select.dataset.competencyId}"]`)?.value.trim() || null
  }))
  if (scores.some(item => !item.score)) return alert('Dê uma nota para todas as competências.')
  const { error } = await db.rpc('submit_self_evaluation', { p_evaluation_id: form.dataset.evaluationId, p_scores: scores })
  if (error) return alert(error.message)
  closePeopleModal(); alert('Autoavaliação enviada.'); loadPerformance()
}

async function loadPdis() {
  const { data, error } = await db.from('people_pdis')
    .select('id,title,objective,due_date,status,people_pdi_actions(id,action_text,due_date,status)')
    .order('created_at', { ascending: false })
  if (error) return pdiList.innerHTML = `<div class="notice">${escapeHTML(error.message)}</div>`
  pdiList.innerHTML = (data || []).map(pdi => `<div class="people-card" style="margin-bottom:14px"><div class="page-head"><div><h3>${escapeHTML(pdi.title)}</h3><p class="muted">${escapeHTML(pdi.objective)}</p></div><span class="badge ${pdi.status==='completed'?'badge-green':'badge-yellow'}">${escapeHTML(pdi.status)}</span></div>${(pdi.people_pdi_actions || []).map(action => `<div class="pdi-action"><div><strong>${escapeHTML(action.action_text)}</strong><div class="muted">${action.due_date ? 'Prazo: '+formatDate(action.due_date) : ''}</div></div><select class="input" onchange="updatePdiAction('${action.id}',this.value)"><option value="pending" ${action.status==='pending'?'selected':''}>Pendente</option><option value="in_progress" ${action.status==='in_progress'?'selected':''}>Em andamento</option><option value="done" ${action.status==='done'?'selected':''}>Concluído</option></select></div>`).join('') || '<div class="muted">Nenhuma ação cadastrada.</div>'}</div>`).join('') || '<div class="people-empty">Nenhum PDI cadastrado.</div>'
}

window.updatePdiAction = async function(id, status) {
  const { error } = await db.rpc('update_my_pdi_action', { p_action_id: id, p_status: status })
  if (error) return alert(error.message)
}

async function loadPeopleModule(moduleKey) {
  showPeopleSection(moduleKey)
  if (moduleKey === 'mood') return loadTodayMood()
  if (moduleKey === 'climate') return loadClimateSurveys()
  if (moduleKey === 'performance') return loadPerformance()
  if (moduleKey === 'pdi') return loadPdis()
}

getSessionContext().then(async context => {
  if (!context) return
  if (context.profile.role !== 'employee') return location.replace(firstAllowedModuleUrl(context.profile))
  if (!['mood','climate','performance','pdi'].includes(peopleModule) || !hasModuleAccess(context.profile, peopleModule)) {
    return location.replace(firstAllowedModuleUrl(context.profile))
  }
  peopleCtx = context
  renderPortalSidebar(portalSidebar, context.profile, peopleModule)
  try {
    await loadEmployeeContext()
    await loadPeopleModule(peopleModule)
  } catch (error) {
    alert(`Não foi possível carregar seu espaço: ${error.message}`)
  }
})
