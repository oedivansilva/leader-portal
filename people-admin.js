let peopleAdminCtx = null
let peopleOperations = []
let peopleEmployees = []
let climateSurveys = []
let performanceCycles = []
let competencies = []
let moodChartInstance = null
const peopleAdminModule = new URLSearchParams(location.search).get('module') || 'people_analytics'

function openPeopleModal(title, subtitle = '', html = '') {
  peopleModalTitle.textContent = title
  peopleModalSubtitle.textContent = subtitle
  peopleModalBody.innerHTML = html
  peopleModal.classList.remove('hidden')
}
window.closePeopleModal = () => peopleModal.classList.add('hidden')

function showPeopleAdminSection(moduleKey) {
  document.querySelectorAll('.people-section').forEach(section => section.classList.toggle('active', section.id === moduleKey))
}

function monthDates() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth()+1, 0)
  const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)
  return [iso(first), iso(last)]
}

async function loadPeopleBase() {
  const [ops, emps, surveys, cycles, comps] = await Promise.all([
    db.from('operations').select('id,cost_center,department,active').order('cost_center'),
    db.from('employees').select('id,registration,full_name,email,phone,status,operation_id,leader_id,operations(cost_center)').order('full_name'),
    db.from('people_climate_surveys').select('*').order('created_at',{ascending:false}),
    db.from('people_performance_cycles').select('*').order('created_at',{ascending:false}),
    db.from('people_performance_competencies').select('*').eq('active',true).order('name')
  ])
  const failed = [ops,emps,surveys,cycles,comps].find(result => result.error)
  if (failed) throw failed.error
  peopleOperations = ops.data || []
  peopleEmployees = emps.data || []
  climateSurveys = surveys.data || []
  performanceCycles = cycles.data || []
  competencies = comps.data || []

  climateOperations.innerHTML = peopleOperations.map(op => `<option value="${op.id}">${escapeHTML(op.cost_center)} — ${escapeHTML(op.department)}</option>`).join('')
  climateSurveySelect.innerHTML = '<option value="">Selecione uma pesquisa</option>' + climateSurveys.map(s => `<option value="${s.id}">${escapeHTML(s.title)} (${formatDate(s.start_date)}–${formatDate(s.end_date)})</option>`).join('')
  performanceCycleSelect.innerHTML = '<option value="">Selecione um ciclo</option>' + performanceCycles.map(c => `<option value="${c.id}">${escapeHTML(c.title)} — ${escapeHTML(c.status)}</option>`).join('')
  cycleCompetencies.innerHTML = competencies.map(c => `<label class="module-permission-option"><input type="checkbox" value="${c.id}"><span>${escapeHTML(c.name)} <small class="muted">${escapeHTML(c.category)}</small></span></label>`).join('') || '<p class="muted">Cadastre competências primeiro.</p>'
  pdiEmployee.innerHTML = '<option value="">Selecione</option>' + peopleEmployees.filter(e=>e.status!=='desligado').map(e=>`<option value="${e.id}">${escapeHTML(e.registration)} — ${escapeHTML(e.full_name)}</option>`).join('')

  if (peopleAdminCtx.profile.role === 'admin') await loadAccessCandidates()
}

async function loadMoodAdmin() {
  const start = moodStart.value, end = moodEnd.value
  const { data, error } = await db.rpc('get_mood_analytics',{p_start:start,p_end:end})
  if (error) return alert(error.message)
  const rows = data || []
  const total = rows.reduce((s,r)=>s+Number(r.response_count||0),0)
  const weighted = rows.reduce((s,r)=>s+Number(r.average_mood||0)*Number(r.response_count||0),0)
  const positive = rows.reduce((s,r)=>s+Number(r.mood_4||0)+Number(r.mood_5||0),0)
  const critical = rows.reduce((s,r)=>s+Number(r.mood_1||0)+Number(r.mood_2||0),0)
  moodResponses.textContent = total
  moodAverage.textContent = total ? (weighted/total).toFixed(2) : '—'
  moodPositive.textContent = total ? `${(100*positive/total).toFixed(1)}%` : '0%'
  moodCritical.textContent = total ? `${(100*critical/total).toFixed(1)}%` : '0%'
  if (moodChartInstance) moodChartInstance.destroy()
  moodChartInstance = new Chart(moodOperationChart,{type:'bar',data:{labels:rows.map(r=>r.operation_name),datasets:[{label:'Humor médio',data:rows.map(r=>Number(r.average_mood||0)),backgroundColor:'#EE4D2D',borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,max:5,ticks:{stepSize:1}}},plugins:{legend:{display:false}}}})
  if (peopleAdminCtx.profile.role === 'admin') {
    contactRequestsCard.classList.remove('hidden')
    const result = await db.rpc('get_mood_contact_requests')
    if (!result.error) contactRequests.innerHTML = (result.data || []).map(item=>`<div class="contact-request"><strong>${escapeHTML(item.employee_name)}</strong><div class="muted">${escapeHTML(item.registration)} · ${escapeHTML(item.operation_name)} · ${formatDate(item.checkin_date)}</div><div style="margin-top:5px">Humor: ${item.mood}/5${item.note ? ` · ${escapeHTML(item.note)}`:''}</div></div>`).join('') || '<div class="people-empty">Nenhum pedido de contato.</div>'
  }
}
window.loadMoodAdmin = loadMoodAdmin

window.addClimateQuestionRow = function(question = {}) {
  const row = document.createElement('div')
  row.className = 'question-builder-row'
  row.innerHTML = `<input class="input q-text" placeholder="Pergunta" value="${escapeHTML(question.text||'')}"><select class="input q-type"><option value="scale_1_5">Escala 1–5</option><option value="enps_0_10">eNPS 0–10</option><option value="text">Texto livre</option></select><input class="input q-category" placeholder="Categoria" value="${escapeHTML(question.category||'Geral')}"><button type="button" class="btn btn-light" onclick="this.parentElement.remove()">Remover</button>`
  climateQuestionBuilder.appendChild(row)
}

climateAllOperations.addEventListener('change',()=>climateOperationsField.classList.toggle('hidden',climateAllOperations.checked))
climateCreateForm.addEventListener('submit', async event => {
  event.preventDefault()
  const rows = [...climateQuestionBuilder.querySelectorAll('.question-builder-row')]
  if (!rows.length) return alert('Adicione ao menos uma pergunta.')
  const questions = rows.map((row,index)=>({question_text:row.querySelector('.q-text').value.trim(),question_type:row.querySelector('.q-type').value,category:row.querySelector('.q-category').value.trim()||'Geral',required:true,sort_order:index+1}))
  if (questions.some(q=>!q.question_text)) return alert('Preencha todas as perguntas.')
  const { data: survey, error } = await db.from('people_climate_surveys').insert({title:climateTitle.value.trim(),description:climateDescription.value.trim()||null,start_date:climateStart.value,end_date:climateEnd.value,anonymous:climateAnonymous.checked,all_operations:climateAllOperations.checked,status:'active',created_by:peopleAdminCtx.profile.id}).select().single()
  if (error) return alert(error.message)
  if (!climateAllOperations.checked) {
    const ids = [...climateOperations.selectedOptions].map(o=>o.value)
    if (!ids.length) { await db.from('people_climate_surveys').delete().eq('id',survey.id); return alert('Selecione ao menos uma operação.') }
    const opInsert = await db.from('people_climate_survey_operations').insert(ids.map(operation_id=>({survey_id:survey.id,operation_id})))
    if (opInsert.error) return alert(opInsert.error.message)
  }
  const qInsert = await db.from('people_climate_questions').insert(questions.map(q=>({...q,survey_id:survey.id})))
  if (qInsert.error) return alert(qInsert.error.message)
  alert('Pesquisa criada e publicada.')
  climateCreateForm.reset(); climateAnonymous.checked=true; climateAllOperations.checked=true; climateOperationsField.classList.add('hidden'); climateQuestionBuilder.innerHTML=''; addClimateQuestionRow(); await loadPeopleBase()
})

async function loadClimateAnalytics() {
  const id = climateSurveySelect.value
  if (!id) return
  const [part,summary] = await Promise.all([db.rpc('get_climate_participation',{p_survey_id:id}),db.rpc('get_climate_survey_summary',{p_survey_id:id})])
  if (part.error || summary.error) return alert((part.error||summary.error).message)
  const p = part.data?.[0] || {invited:0,responded:0,participation_pct:0}
  climateParticipationCards.innerHTML = `<div class="people-mini-stat"><span>Convidados</span><strong>${p.invited}</strong></div><div class="people-mini-stat"><span>Responderam</span><strong>${p.responded}</strong></div><div class="people-mini-stat"><span>Participação</span><strong>${p.participation_pct}%</strong></div><div class="people-mini-stat"><span>Modelo</span><strong>${climateSurveys.find(s=>s.id===id)?.anonymous?'Anônimo':'Identificado'}</strong></div>`
  climateSummaryRows.innerHTML = (summary.data || []).map(q=>{
    const responseCount = Number(q.response_count || 0)
    let resultHtml = ''

    if (q.question_type === 'enps_0_10') {
      const score = q.enps == null ? null : Number(q.enps)
      const scoreLabel = score == null ? '—' : `${score > 0 ? '+' : ''}${score}`
      resultHtml = `
        <strong>eNPS ${scoreLabel}</strong>
        <div class="muted">Média ${q.average_value ?? '—'} / 10 · ${responseCount} resposta${responseCount===1?'':'s'}</div>
        <div class="muted">Promotores ${q.promoter_count || 0} · Passivos ${q.passive_count || 0} · Detratores ${q.detractor_count || 0}</div>`
    } else if (q.question_type === 'scale_1_5') {
      resultHtml = `
        <strong>${q.average_value ?? '—'} / 5</strong>
        <div class="muted">${responseCount} resposta${responseCount===1?'':'s'}</div>
        ${q.favorable_pct!=null?`<div class="muted">Favorabilidade ${q.favorable_pct}%</div>`:''}`
    } else {
      resultHtml = `
        <strong>${responseCount} resposta${responseCount===1?'':'s'}</strong>
        ${responseCount ? `<div style="margin-top:8px"><button class="btn btn-light" type="button" onclick="viewClimateTextResponses('${id}','${q.question_id}')">Ver respostas</button></div>` : ''}`
    }

    return `<div class="people-task"><div><h4>${escapeHTML(q.question_text)}</h4><p class="muted">${escapeHTML(q.category)} · ${escapeHTML(q.question_type)}</p></div><div style="text-align:right">${resultHtml}</div></div>`
  }).join('') || '<div class="people-empty">Sem respostas ainda.</div>'
}
window.loadClimateAnalytics = loadClimateAnalytics

competencyForm.addEventListener('submit',async event=>{event.preventDefault();const {error}=await db.from('people_performance_competencies').insert({name:competencyName.value.trim(),category:competencyCategory.value.trim(),description:competencyDescription.value.trim()||null});if(error)return alert(error.message);event.target.reset();competencyCategory.value='Comportamental';await loadPeopleBase();alert('Competência cadastrada.')})
cycleForm.addEventListener('submit',async event=>{event.preventDefault();const ids=[...cycleCompetencies.querySelectorAll('input:checked')].map(i=>i.value);if(!ids.length)return alert('Selecione ao menos uma competência.');const {data:cycle,error}=await db.from('people_performance_cycles').insert({title:cycleTitle.value.trim(),description:cycleDescription.value.trim()||null,start_date:cycleStart.value,end_date:cycleEnd.value,status:'draft',created_by:peopleAdminCtx.profile.id}).select().single();if(error)return alert(error.message);const linked=await db.from('people_performance_cycle_competencies').insert(ids.map(competency_id=>({cycle_id:cycle.id,competency_id,weight:1})));if(linked.error)return alert(linked.error.message);event.target.reset();await loadPeopleBase();performanceCycleSelect.value=cycle.id;alert('Ciclo criado. Agora clique em “Iniciar ciclo”.')})

window.startSelectedCycle = async function(){const id=performanceCycleSelect.value;if(!id)return; if(!confirm('Iniciar este ciclo e gerar avaliações para os colaboradores ativos?'))return;const {data,error}=await db.rpc('start_performance_cycle',{p_cycle_id:id});if(error)return alert(error.message);alert(`${data ?? 0} avaliação(ões) criada(s).`);await loadPeopleBase();performanceCycleSelect.value=id;loadPerformanceAdmin()}

async function loadPerformanceAdmin(){
  const id=performanceCycleSelect.value
  if(!id){performanceSummary.innerHTML='';performanceEvaluationRows.innerHTML='';return}
  const cycle=performanceCycles.find(c=>c.id===id)
  if(peopleAdminCtx.profile.role==='admin' && cycle?.status==='draft') startCycleBtn.classList.remove('hidden'); else startCycleBtn.classList.add('hidden')
  const [sum,evals]=await Promise.all([
    db.rpc('get_performance_summary',{p_cycle_id:id}),
    db.from('people_performance_evaluations').select('id,status,self_submitted_at,manager_submitted_at,manager_id,operation_id,employees(full_name,registration),operations(cost_center)').eq('cycle_id',id).order('created_at')
  ])
  if(sum.error||evals.error)return alert((sum.error||evals.error).message)
  const summary=sum.data||[];const total=summary.reduce((s,r)=>s+Number(r.total||0),0),completed=summary.reduce((s,r)=>s+Number(r.completed||0),0),selfDone=summary.reduce((s,r)=>s+Number(r.self_done||0),0),mgrDone=summary.reduce((s,r)=>s+Number(r.manager_done||0),0)
  performanceSummary.innerHTML=`<div class="people-mini-stat"><span>Avaliações</span><strong>${total}</strong></div><div class="people-mini-stat"><span>Autoavaliações</span><strong>${selfDone}</strong></div><div class="people-mini-stat"><span>Lideranças</span><strong>${mgrDone}</strong></div><div class="people-mini-stat"><span>Concluídas</span><strong>${completed}</strong></div>`
  performanceEvaluationRows.innerHTML=(evals.data||[]).map(e=>{const canEvaluate=peopleAdminCtx.profile.role==='admin'||e.manager_id===peopleAdminCtx.profile.id;return `<tr><td><strong>${escapeHTML(e.employees?.full_name||'—')}</strong><br><small>${escapeHTML(e.employees?.registration||'')}</small></td><td>${escapeHTML(e.operations?.cost_center||'—')}</td><td>${e.self_submitted_at?'Concluída':'Pendente'}</td><td>${e.manager_submitted_at?'Concluída':'Pendente'}</td><td><span class="badge ${e.status==='completed'?'badge-green':'badge-yellow'}">${escapeHTML(e.status)}</span></td><td>${canEvaluate?`<button class="btn btn-light" onclick="openManagerEvaluation('${e.id}')">${e.manager_submitted_at?'Ver / revisar':'Avaliar'}</button>`:'—'}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Nenhuma avaliação.</td></tr>'
}
window.loadPerformanceAdmin=loadPerformanceAdmin

window.openManagerEvaluation=async function(evaluationId){
  const {data:evaluation,error:evalError}=await db.from('people_performance_evaluations').select('id,cycle_id,manager_submitted_at,employees(full_name)').eq('id',evaluationId).single();if(evalError)return alert(evalError.message)
  const [comps,scores]=await Promise.all([db.from('people_performance_cycle_competencies').select('competency_id,people_performance_competencies(name,category,description)').eq('cycle_id',evaluation.cycle_id),db.from('people_performance_scores').select('*').eq('evaluation_id',evaluationId)]);if(comps.error||scores.error)return alert((comps.error||scores.error).message)
  const map=new Map((scores.data||[]).map(s=>[s.competency_id,s]));const html=`<form id="managerEvaluationForm" data-evaluation-id="${evaluationId}">${(comps.data||[]).map(row=>{const c=row.people_performance_competencies||{},cur=map.get(row.competency_id)||{};return `<div class="score-row"><div><strong>${escapeHTML(c.name||'')}</strong><div class="muted">${escapeHTML(c.category||'')}</div>${cur.self_score?`<div style="margin-top:8px">Autoavaliação: <strong>${cur.self_score}/5</strong></div>`:''}</div><div><select class="input manager-score" data-competency-id="${row.competency_id}"><option value="">Nota</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${Number(cur.manager_score)===v?'selected':''}>${v}</option>`).join('')}</select><textarea class="input manager-comment" data-competency-id="${row.competency_id}" rows="2" placeholder="Comentário opcional">${escapeHTML(cur.manager_comment||'')}</textarea></div></div>`}).join('')}<button class="btn btn-primary" type="submit">Salvar avaliação</button></form>`;openPeopleModal(`Avaliação — ${evaluation.employees?.full_name||''}`,'Compare a percepção do colaborador com a avaliação da liderança.',html);managerEvaluationForm.addEventListener('submit',submitManagerEvaluation)
}
async function submitManagerEvaluation(event){event.preventDefault();const form=event.currentTarget;const scores=[...form.querySelectorAll('.manager-score')].map(select=>({competency_id:select.dataset.competencyId,score:Number(select.value),comment:form.querySelector(`.manager-comment[data-competency-id="${select.dataset.competencyId}"]`)?.value.trim()||null}));if(scores.some(s=>!s.score))return alert('Dê uma nota para todas as competências.');const {error}=await db.rpc('submit_manager_evaluation',{p_evaluation_id:form.dataset.evaluationId,p_scores:scores});if(error)return alert(error.message);closePeopleModal();alert('Avaliação salva.');loadPerformanceAdmin()}

pdiForm.addEventListener('submit',async event=>{event.preventDefault();const {data:pdi,error}=await db.from('people_pdis').insert({employee_id:pdiEmployee.value,title:pdiTitle.value.trim(),objective:pdiObjective.value.trim(),due_date:pdiDueDate.value||null,status:'active',created_by:peopleAdminCtx.profile.id}).select().single();if(error)return alert(error.message);const actions=pdiActionsText.value.split('\n').map(s=>s.trim()).filter(Boolean);if(actions.length){const r=await db.from('people_pdi_actions').insert(actions.map(action_text=>({pdi_id:pdi.id,action_text,due_date:pdiDueDate.value||null})));if(r.error)return alert(r.error.message)}event.target.reset();alert('PDI criado.');loadPdiAdmin()})

async function loadPdiAdmin(){const {data,error}=await db.from('people_pdis').select('id,title,objective,due_date,status,employees(full_name,registration),people_pdi_actions(id,action_text,status,due_date)').order('created_at',{ascending:false});if(error)return pdiAdminList.innerHTML=`<div class="notice">${escapeHTML(error.message)}</div>`;pdiAdminList.innerHTML=(data||[]).map(p=>`<div class="people-card" style="margin-bottom:14px"><div class="page-head"><div><h3>${escapeHTML(p.employees?.full_name||'')} — ${escapeHTML(p.title)}</h3><p class="muted">${escapeHTML(p.objective)}${p.due_date?' · prazo '+formatDate(p.due_date):''}</p></div><span class="badge ${p.status==='completed'?'badge-green':'badge-yellow'}">${escapeHTML(p.status)}</span></div>${(p.people_pdi_actions||[]).map(a=>`<div class="people-task"><div>${escapeHTML(a.action_text)}</div><span class="badge badge-gray">${escapeHTML(a.status)}</span></div>`).join('')}</div>`).join('')||'<div class="people-empty">Nenhum PDI.</div>'}

async function loadAccessCandidates(){const {data:profiles,error}=await db.from('profiles').select('id,employee_id,email,active').eq('role','employee');if(error)return;const used=new Set((profiles||[]).map(p=>p.employee_id));const candidates=peopleEmployees.filter(e=>e.status!=='desligado'&&!used.has(e.id));accessEmployee.innerHTML='<option value="">Selecione</option>'+candidates.map(e=>`<option value="${e.id}" data-email="${escapeHTML(e.email||'')}">${escapeHTML(e.registration)} — ${escapeHTML(e.full_name)}</option>`).join('');accessEmployee.onchange=()=>{accessEmail.value=accessEmployee.selectedOptions[0]?.dataset.email||''};const employeeMap=new Map(peopleEmployees.map(e=>[e.id,e]));employeeAccessRows.innerHTML=(profiles||[]).map(p=>{const e=employeeMap.get(p.employee_id)||{};return `<tr><td><strong>${escapeHTML(e.full_name||'—')}</strong><br><small>${escapeHTML(e.registration||'')}</small></td><td>${escapeHTML(p.email||'—')}</td><td><span class="badge ${p.active?'badge-green':'badge-gray'}">${p.active?'Ativo':'Inativo'}</span></td><td><div class="actions"><button class="btn btn-light" onclick="resetEmployeePassword('${p.id}')">Nova senha</button><button class="btn btn-light" onclick="toggleEmployeeAccess('${p.id}',${!p.active})">${p.active?'Desativar':'Reativar'}</button></div></td></tr>`}).join('')||'<tr><td colspan="4" class="empty">Nenhum acesso de colaborador criado.</td></tr>'}
window.resetEmployeePassword=async function(id){if(!confirm('Gerar uma nova senha temporária para este colaborador?'))return;try{const data=await portalFunctionRequest('admin-manage-user',{body:JSON.stringify({action:'reset-password',user_id:id}),contentType:'application/json'});employeeAccessResult.classList.remove('hidden');employeeAccessResult.innerHTML=`<strong>Nova senha temporária</strong><br>E-mail: ${escapeHTML(data.email)}<br>Senha: <code>${escapeHTML(data.temporary_password)}</code>`}catch(error){alert(error.message)}}
window.toggleEmployeeAccess=async function(id,active){const {error}=await db.rpc('admin_set_user_active',{target_user_id:id,new_active:active});if(error)return alert(error.message);await loadAccessCandidates()}
window.createEmployeeAccess=async function(){const employeeId=accessEmployee.value,email=accessEmail.value.trim();if(!employeeId||!email)return alert('Selecione o colaborador e informe o e-mail.');const {data,error}=await db.functions.invoke('people-create-employee-access',{body:{employee_id:employeeId,email}});if(error)return alert(`Erro: ${await functionError(error)}`);employeeAccessResult.classList.remove('hidden');employeeAccessResult.innerHTML=`<strong>Acesso criado</strong><br>E-mail: ${escapeHTML(data.email)}<br>Senha temporária: <code>${escapeHTML(data.temporary_password)}</code>`;await loadAccessCandidates()}

async function loadPeopleAnalytics(){
  const [start,end]=monthDates();const mood=await db.rpc('get_mood_analytics',{p_start:start,p_end:end});if(!mood.error){const rows=mood.data||[],total=rows.reduce((s,r)=>s+Number(r.response_count||0),0),weighted=rows.reduce((s,r)=>s+Number(r.average_mood||0)*Number(r.response_count||0),0);paMood.textContent=total?(weighted/total).toFixed(2):'—'}
  const survey=climateSurveys.find(s=>s.status==='active')||climateSurveys[0];if(survey){const p=await db.rpc('get_climate_participation',{p_survey_id:survey.id});paClimate.textContent=p.error?'—':`${p.data?.[0]?.participation_pct||0}%`}else paClimate.textContent='—'
  const cycle=performanceCycles.find(c=>c.status==='active')||performanceCycles[0];if(cycle){const s=await db.rpc('get_performance_summary',{p_cycle_id:cycle.id});if(!s.error){const rows=s.data||[],total=rows.reduce((a,r)=>a+Number(r.total||0),0),done=rows.reduce((a,r)=>a+Number(r.completed||0),0);paPerformance.textContent=total?`${Math.round(100*done/total)}%`:'—'}}else paPerformance.textContent='—'
  const pdis=await db.from('people_pdis').select('id',{count:'exact',head:true}).eq('status','active');paPdi.textContent=pdis.error?'—':(pdis.count||0)
}

async function openPeopleAdminModule(moduleKey){showPeopleAdminSection(moduleKey);if(moduleKey==='mood')return loadMoodAdmin();if(moduleKey==='climate'){if(peopleAdminCtx.profile.role==='admin')climateAdminCreator.classList.remove('hidden');if(!climateQuestionBuilder.children.length)addClimateQuestionRow();return climateSurveySelect.value&&loadClimateAnalytics()}if(moduleKey==='performance'){if(peopleAdminCtx.profile.role==='admin')performanceAdminCreator.classList.remove('hidden');return loadPerformanceAdmin()}if(moduleKey==='pdi'){if(peopleAdminCtx.profile.role==='onsite')pdiCreator.classList.add('hidden');return loadPdiAdmin()}if(moduleKey==='people_analytics'){if(peopleAdminCtx.profile.role==='admin')employeeAccessCard.classList.remove('hidden');return loadPeopleAnalytics()}}

getSessionContext().then(async context=>{
  if(!context)return
  if(context.profile.role==='employee')return location.replace(firstAllowedModuleUrl(context.profile))
  if(!['mood','climate','performance','pdi','people_analytics'].includes(peopleAdminModule)||!hasModuleAccess(context.profile,peopleAdminModule))return location.replace(firstAllowedModuleUrl(context.profile))
  peopleAdminCtx=context;renderPortalSidebar(portalSidebar,context.profile,peopleAdminModule)
  const [start,end]=monthDates();moodStart.value=start;moodEnd.value=end
  try{await loadPeopleBase();await openPeopleAdminModule(peopleAdminModule)}catch(error){alert(`Não foi possível carregar o NEXO Pessoas: ${error.message}`)}
})
