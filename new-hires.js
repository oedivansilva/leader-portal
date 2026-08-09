let hireCtx = null
let myHireCheckpoints = []

const bpoQuestions = [
  ['bpo_role_clarity','A vaga e as atividades foram explicadas corretamente'],
  ['bpo_schedule_clarity','A escala e o horário informados corresponderam ao encontrado na operação'],
  ['bpo_pay_benefits','Salário e benefícios foram explicados com clareza'],
  ['bpo_process','O processo seletivo foi organizado'],
  ['bpo_communication','A comunicação até a admissão foi adequada']
]

const onboardingQuestions = [
  ['onboarding_welcome','Fui bem recebido no início das atividades'],
  ['onboarding_training','Recebi treinamento suficiente para começar'],
  ['onboarding_resources','Recebi recursos, equipamentos e acessos necessários']
]

const leadershipQuestions = [
  ['leader_clarity','Minha liderança explicou claramente minhas atividades'],
  ['leader_support','Tive apoio da liderança quando tive dúvidas'],
  ['leader_followup','Minha liderança acompanhou minha adaptação']
]

function openPeopleModal(title, subtitle='', html='') {
  peopleModalTitle.textContent = title
  peopleModalSubtitle.textContent = subtitle
  peopleModalBody.innerHTML = html
  peopleModal.classList.remove('hidden')
}
window.closePeopleModal = () => peopleModal.classList.add('hidden')

function scoreGuide() {
  return `<div class="hire-score-guide"><strong>Escala:</strong><span>1 — Discordo totalmente</span><span>2 — Discordo</span><span>3 — Neutro</span><span>4 — Concordo</span><span>5 — Concordo totalmente</span></div>`
}

function questionRows(title, questions, existing={}) {
  return `<div class="hire-question-group"><h3>${escapeHTML(title)}</h3>${questions.map(([key,label])=>`<div class="score-row"><div><strong>${escapeHTML(label)}</strong></div><div><select class="input hire-score" data-key="${key}" required><option value="">Nota</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${Number(existing[key])===v?'selected':''}>${v}</option>`).join('')}</select></div></div>`).join('')}</div>`
}

function pct(value) { return value == null ? '—' : `${Number(value).toFixed(1)}%` }

async function loadMyHireJourney() {
  const { data, error } = await db.rpc('get_my_people_hire_checkpoints')
  if (error) return myHireSummary.innerHTML = `<div class="notice">${escapeHTML(error.message)}</div>`
  myHireCheckpoints = data || []
  if (!myHireCheckpoints.length) {
    myHireSummary.innerHTML = '<div class="people-card"><div class="people-empty">Você não possui um acompanhamento de novo contratado ativo no momento.</div></div>'
    myHireTimeline.innerHTML = '<div class="people-empty">Nenhuma etapa disponível.</div>'
    return
  }
  const first = myHireCheckpoints[0]
  const latestAttendance = [...myHireCheckpoints].reverse().find(item=>item.attendance_pct!=null) || first
  myHireSummary.innerHTML = `<div class="people-grid">
    <div class="people-card span-8"><h2>Seu acompanhamento</h2><p class="muted">Admissão: ${formatDate(first.admission_date)} · ${escapeHTML(first.operation_name)} · BPO: ${escapeHTML(first.bpo_name)}</p><div class="notice">As respostas desta avaliação são identificadas e usadas para entender separadamente a qualidade do recrutamento, onboarding e acompanhamento da liderança.</div></div>
    <div class="people-card span-4"><h3>Assiduidade</h3><div style="font-size:30px;font-weight:700">${pct(latestAttendance.attendance_pct)}</div><p class="muted">F/NS: ${Number(latestAttendance.f_count||0)+Number(latestAttendance.ns_count||0)} · Atestados AM: ${latestAttendance.am_count||0}</p><small class="muted">Atestados não reduzem automaticamente sua avaliação.</small></div>
  </div>`

  const today = new Date().toISOString().slice(0,10)
  myHireTimeline.innerHTML = myHireCheckpoints.map(cp=>{
    const available = cp.due_date <= today
    const done = !!cp.employee_submitted_at
    return `<div class="people-card hire-checkpoint-card" style="margin-top:12px"><div class="page-head"><div><h3>D+${cp.checkpoint_day}</h3><p class="muted">${available?'Disponível desde':'Disponível em'} ${formatDate(cp.due_date)}</p></div><span class="badge ${done?'badge-green':available?'badge-yellow':'badge-gray'}">${done?'Respondida':available?'Pendente':'Aguardando'}</span></div><div class="hire-status-row"><span>Liderança: <strong>${cp.leader_submitted_at?'Concluída':'Pendente'}</strong></span><span>RH: <strong>${cp.hr_submitted_at?'Concluída':'Pendente'}</strong></span></div>${available?`<div class="actions" style="margin-top:12px"><button class="btn ${done?'btn-light':'btn-primary'}" onclick="openMyHireEvaluation('${cp.checkpoint_id}')">${done?'Ver / revisar minha resposta':'Responder etapa'}</button></div>`:''}</div>`
  }).join('')
}

window.openMyHireEvaluation = async function(checkpointId) {
  const { data: payload, error } = await db.rpc('get_people_hire_checkpoint_payload',{p_checkpoint_id:checkpointId})
  if (error) return alert(error.message)
  const previous = (payload.evaluations||[]).find(e=>e.reviewer_type==='employee') || {}
  const day = Number(payload.checkpoint.day)
  const includeBpo = day === 7
  const html = `<form id="myHireEvaluationForm" data-checkpoint-id="${checkpointId}">
    ${scoreGuide()}
    ${includeBpo ? questionRows('Sobre o recrutamento / BPO',bpoQuestions,previous.answers||{}) : ''}
    ${questionRows('Sobre o onboarding',onboardingQuestions,previous.answers||{})}
    ${questionRows('Sobre a liderança',leadershipQuestions,previous.answers||{})}
    <div class="field"><label>Quer deixar algum comentário? <span class="muted">(opcional)</span></label><textarea id="myHireComment" class="input" rows="4">${escapeHTML(previous.comment||'')}</textarea></div>
    <button class="btn btn-primary">Salvar minha avaliação</button>
  </form>`
  openPeopleModal(`Minha experiência — D+${day}`,`${payload.case.operation_name} · ${payload.case.bpo_name}`,html)
  myHireEvaluationForm.addEventListener('submit',submitMyHireEvaluation)
}

async function submitMyHireEvaluation(event) {
  event.preventDefault()
  const form = event.currentTarget
  const answers = {}
  for (const select of form.querySelectorAll('.hire-score')) {
    if (!select.value) return alert('Responda todos os itens.')
    answers[select.dataset.key] = Number(select.value)
  }
  const { error } = await db.rpc('submit_people_hire_evaluation',{
    p_checkpoint_id: form.dataset.checkpointId,
    p_reviewer_type: 'employee',
    p_answers: answers,
    p_comment: myHireComment.value.trim() || null,
    p_recommendation: null
  })
  if (error) return alert(error.message)
  closePeopleModal()
  alert('Avaliação salva. Obrigado por compartilhar sua experiência. 🧡')
  loadMyHireJourney()
}

getSessionContext().then(async context=>{
  if (!context) return
  if (context.profile.role !== 'employee') return location.replace(firstAllowedModuleUrl(context.profile))
  if (!hasModuleAccess(context.profile,'new_hires')) return location.replace(firstAllowedModuleUrl(context.profile))
  hireCtx=context
  renderPortalSidebar(portalSidebar,context.profile,'new_hires')
  await loadMyHireJourney()
})
