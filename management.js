let managementEmployees=[],managementScales=[],managementScaleDays=[],managementBenefits=[],managementPrivate=[],managementEmployeeBenefits=[],managementMeasures=[],originalEmployeeScale=''

async function loadManagement(){const result=await Promise.all([db.from('employees').select('*,operations(cost_center,department,clients(name))').order('full_name'),db.from('work_scales').select('*').order('name'),db.from('scale_work_days').select('*'),db.from('benefits').select('*').order('name'),db.from('employee_private_data').select('*'),db.from('employee_benefits').select('*'),db.from('disciplinary_requests').select('employee_id,penalty_type')]);if(result.some(x=>x.error))return alert(result.find(x=>x.error).error.message);[managementEmployees,managementScales,managementScaleDays,managementBenefits,managementPrivate,managementEmployeeBenefits,managementMeasures]=result.map(x=>x.data||[]);renderManagementSelects();renderScales();renderEmployees()}

function ensureEmployeeFilters(){
  const search=document.getElementById('employeeSearch')
  if(!search||document.getElementById('employeeAdvancedFilters'))return
  const toolbar=search.closest('.toolbar')||search.parentElement
  const filters=document.createElement('div')
  filters.id='employeeAdvancedFilters';filters.className='employee-filter-grid'
  filters.innerHTML=`
    <select id="employeeStatusFilter" class="input"><option value="">Todos os status</option><option value="ativo">Ativos</option><option value="afastado">Afastados</option><option value="desligado">Desligados</option></select>
    <select id="employeeOperationFilter" class="input"><option value="">Todas as operações</option></select>
    <select id="employeeLeaderFilter" class="input"><option value="">Todos os líderes</option><option value="__none__">Aguardando resgate / sem líder</option></select>
    <select id="employeeScheduleFilter" class="input"><option value="">Todos os horários</option><option value="defined">Horário definido</option><option value="pending">Horário pendente</option></select>
    <div class="employee-date-filter"><span>Admissão de</span><input id="employeeAdmissionFromFilter" type="date" class="input"></div>
    <div class="employee-date-filter"><span>até</span><input id="employeeAdmissionToFilter" type="date" class="input"></div>
    <button id="employeeClearFilters" type="button" class="btn btn-light">Limpar filtros</button>`
  toolbar?.insertAdjacentElement('afterend',filters)
  filters.querySelectorAll('select,input').forEach(el=>el.addEventListener('input',renderEmployees))
  document.getElementById('employeeClearFilters').onclick=()=>{filters.querySelectorAll('select,input').forEach(el=>el.value='');renderEmployees()}
}

function renderManagementSelects(){
  employeeOperation.innerHTML='<option value="">Selecione...</option>'+operations.map(o=>`<option value="${o.id}">${escapeHTML(o.clients?.name||'')} | ${escapeHTML(o.cost_center)} | ${escapeHTML(o.department)}</option>`).join('')
  employeeLeader.innerHTML='<option value="">Sem líder principal / aguardando resgate</option>'+profiles.filter(p=>p.role==='leader'&&p.active).map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join('')
  employeeScale.innerHTML='<option value="">Sem escala manual</option>'+managementScales.filter(s=>s.active).map(s=>`<option value="${s.id}">${escapeHTML(s.description||s.name)}</option>`).join('')
  employeeBenefits.innerHTML=managementBenefits.filter(b=>b.active).map(b=>`<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')
  ensureEmployeeFilters()
  const opFilter=document.getElementById('employeeOperationFilter'),leaderFilter=document.getElementById('employeeLeaderFilter')
  if(opFilter){const current=opFilter.value;opFilter.innerHTML='<option value="">Todas as operações</option>'+operations.map(o=>`<option value="${o.id}">${escapeHTML(o.cost_center)} · ${escapeHTML(o.department)}</option>`).join('');opFilter.value=current}
  if(leaderFilter){const current=leaderFilter.value;leaderFilter.innerHTML='<option value="">Todos os líderes</option><option value="__none__">Aguardando resgate / sem líder</option>'+profiles.filter(p=>p.role==='leader'&&p.active).map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join('');leaderFilter.value=current}
}
const weekdayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
function renderScales(){scaleRows.innerHTML=managementScales.map(scale=>{const days=managementScaleDays.filter(x=>x.scale_id===scale.id).map(x=>weekdayNames[x.weekday]).join(', ')||'Nenhum';const linked=managementEmployees.filter(x=>x.scale_id===scale.id).length;return `<tr><td><strong>${escapeHTML(scale.name)}</strong></td><td>${escapeHTML(days)}</td><td>${escapeHTML(scale.description||'—')}</td><td><span class="badge ${scale.active?'badge-green':'badge-gray'}">${scale.active?'Ativo':'Inativo'}</span></td><td><div class="actions"><button class="btn btn-light" onclick="editScale('${scale.id}')">Editar</button><button class="btn btn-light" onclick="toggleScale('${scale.id}',${!scale.active})">${scale.active?'Desativar':'Reativar'}</button><button class="btn btn-danger" onclick="deleteScale('${scale.id}')" ${linked?'title="Há colaboradores vinculados"':''}>Excluir</button></div><small class="muted">${linked} colaborador(es) vinculado(s)</small></td></tr>`}).join('')||'<tr><td colspan="5" class="empty">Nenhum turno ou escala cadastrado.</td></tr>'}
function editScale(id){const scale=managementScales.find(x=>x.id===id);if(!scale)return;scaleEditId.value=id;scaleName.value=scale.name;scaleDescription.value=scale.description||'';const days=managementScaleDays.filter(x=>x.scale_id===id).map(x=>x.weekday);document.querySelectorAll('[name="scaleDay"]').forEach(x=>x.checked=days.includes(Number(x.value)));scaleSaveButton.textContent='Salvar alterações';scaleCancelButton.classList.remove('hidden');scaleForm.scrollIntoView({behavior:'smooth',block:'center'})}
function cancelScaleEdit(){scaleForm.reset();scaleEditId.value='';scaleSaveButton.textContent='Cadastrar turno / escala';scaleCancelButton.classList.add('hidden')}
async function toggleScale(id,active){const {error}=await db.from('work_scales').update({active}).eq('id',id);if(error)return alert(error.message);loadManagement()}
async function deleteScale(id){const linked=managementEmployees.filter(x=>x.scale_id===id).length;if(linked)return alert(`Este turno/escala está vinculado a ${linked} colaborador(es). Desative-o ou altere primeiro a escala desses colaboradores.`);if(!confirm('Excluir definitivamente este turno/escala?'))return;const {error}=await db.from('work_scales').delete().eq('id',id);if(error)return alert(error.message);if(scaleEditId.value===id)cancelScaleEdit();loadManagement()}

function renderEmployees(){
  const q=employeeSearch.value.trim().toLowerCase()
  const status=document.getElementById('employeeStatusFilter')?.value||''
  const operation=document.getElementById('employeeOperationFilter')?.value||''
  const leader=document.getElementById('employeeLeaderFilter')?.value||''
  const schedule=document.getElementById('employeeScheduleFilter')?.value||''
  const admissionFrom=document.getElementById('employeeAdmissionFromFilter')?.value||''
  const admissionTo=document.getElementById('employeeAdmissionToFilter')?.value||''
  const filtered=managementEmployees.filter(e=>{
    if(!`${e.registration} ${e.full_name}`.toLowerCase().includes(q))return false
    if(status&&e.status!==status)return false
    if(operation&&e.operation_id!==operation)return false
    if(leader==='__none__'&&e.leader_id)return false
    if(leader&&leader!=='__none__'&&e.leader_id!==leader)return false
    if(schedule==='defined'&&!e.schedule_catalog_id&&!e.scale_id)return false
    if(schedule==='pending'&&(e.schedule_catalog_id||e.scale_id))return false
    if(admissionFrom&&(!e.admission_date||e.admission_date<admissionFrom))return false
    if(admissionTo&&(!e.admission_date||e.admission_date>admissionTo))return false
    return true
  })
  employeeRows.innerHTML=filtered.map(e=>{
    const measures=managementMeasures.filter(m=>m.employee_id===e.id),warnings=measures.filter(m=>m.penalty_type.toLowerCase().includes('advert')).length,suspensions=measures.filter(m=>m.penalty_type.toLowerCase().includes('susp')).length
    const leaderName=profiles.find(p=>p.id===e.leader_id)?.full_name||'Aguardando resgate'
    const scheduleState=e.schedule_catalog_id?'Horário Shopee':e.scale_id?'Escala manual':'Horário pendente'
    return `<tr><td>${escapeHTML(e.registration)}</td><td><strong>${escapeHTML(e.full_name)}</strong><br><small class="muted">${escapeHTML(leaderName)} · ${escapeHTML(scheduleState)}</small></td><td>${escapeHTML(e.operations?.cost_center||'—')}<br><small>${escapeHTML(e.operations?.department||'')}</small></td><td><span class="badge ${e.status==='ativo'?'badge-green':'badge-gray'}">${escapeHTML(e.status)}</span></td><td>${warnings}</td><td>${suspensions}</td><td><button class="btn btn-light" onclick="editEmployee('${e.id}')">Editar</button></td></tr>`
  }).join('')||'<tr><td colspan="7" class="empty">Nenhum colaborador encontrado com os filtros atuais.</td></tr>'
}

function openEmployeeForm(){employeeForm.reset();employeeId.value='';originalEmployeeScale='';if(window.employeeScheduleCatalog)employeeScheduleCatalog.value='';employeeFormTitle.textContent='Cadastrar colaborador';employeeFormCard.classList.remove('hidden');employeeFormCard.scrollIntoView({behavior:'smooth'})}
function closeEmployeeForm(){employeeFormCard.classList.add('hidden');employeeForm.reset()}
function editEmployee(id){const e=managementEmployees.find(x=>x.id===id),privateData=managementPrivate.find(x=>x.employee_id===id);if(!e)return;openEmployeeForm();employeeFormTitle.textContent='Editar colaborador';employeeId.value=e.id;employeeRegistration.value=e.registration;managementEmployeeName.value=e.full_name;managementEmployeeCpf.value=privateData?.cpf||'';employeeSex.value=e.sex||'Não informado';employeeBirthDate.value=privateData?.birth_date||'';employeeAdmissionDate.value=e.admission_date||'';employeeDismissalDate.value=e.dismissal_date||'';employeeOperation.value=e.operation_id||'';employeeLeader.value=e.leader_id||'';employeeScale.value=e.scale_id||'';originalEmployeeScale=e.scale_id||'';if(window.employeeScheduleCatalog)employeeScheduleCatalog.value=e.schedule_catalog_id||'';employeeContractEnd.value=e.contract_end_date||'';employeeContractExtension.value=e.contract_extension_date||'';employeePhone.value=e.phone||'';employeeEmail.value=e.email||'';employeeStatus.value=e.status;employeeVest.value=e.vest_size||'';employeeGlove.value=e.glove_size||'';employeeBoot.value=e.boot_size||'';employeeTerminationType.value=e.termination_type||'';employeeTerminationReason.value=e.termination_reason||'';employeeRehire.value=e.eligible_for_rehire===null||e.eligible_for_rehire===undefined?'':String(e.eligible_for_rehire);const selected=managementEmployeeBenefits.filter(x=>x.employee_id===id).map(x=>x.benefit_id);[...employeeBenefits.options].forEach(o=>o.selected=selected.includes(o.value))}

managementEmployeeCpf.addEventListener('input',()=>{const d=managementEmployeeCpf.value.replace(/\D/g,'').slice(0,11);managementEmployeeCpf.value=d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')})
employeeSearch.addEventListener('input',renderEmployees)
scaleForm.addEventListener('submit',async e=>{e.preventDefault();const days=[...document.querySelectorAll('[name="scaleDay"]:checked')].map(x=>Number(x.value));if(!days.length)return alert('Selecione ao menos um dia trabalhado.');let id=scaleEditId.value;if(id){const updated=await db.from('work_scales').update({name:scaleName.value.trim(),description:scaleDescription.value.trim()||null}).eq('id',id);if(updated.error)return alert(updated.error.message);const removed=await db.from('scale_work_days').delete().eq('scale_id',id);if(removed.error)return alert(removed.error.message)}else{const created=await db.from('work_scales').insert({name:scaleName.value.trim(),description:scaleDescription.value.trim()||null}).select('id').single();if(created.error)return alert(created.error.message);id=created.data.id}const saved=await db.from('scale_work_days').insert(days.map(weekday=>({scale_id:id,weekday})));if(saved.error)return alert(saved.error.message);cancelScaleEdit();loadManagement()})
benefitForm.addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.from('benefits').insert({name:benefitName.value.trim()});if(error)return alert(error.message);e.target.reset();loadManagement()})
employeeForm.addEventListener('submit',async e=>{
  e.preventDefault()
  if(managementEmployeeCpf.value.replace(/\D/g,'').length!==11)return alert('Informe um CPF com 11 números.')
  if(employeeDismissalDate.value&&!employeeTerminationType.value)return alert('Informe o tipo de desligamento.')

  const catalogId=window.employeeScheduleCatalog?.value||null
  const catalogItem=catalogId?window.NexoScheduleCatalog?.catalog?.find(item=>item.id===catalogId):null
  if(catalogItem?.work_scale_id) employeeScale.value=catalogItem.work_scale_id

  const selectedScale=employeeScale.value||null
  const scaleChanged=selectedScale!==(originalEmployeeScale||null)
  let scaleStart=employeeAdmissionDate.value
  if(employeeId.value&&scaleChanged){
    scaleStart=prompt('A partir de qual data esta alteração de horário/escala passa a valer? Use AAAA-MM-DD.',new Date().toISOString().slice(0,10))||''
    if(!/^\d{4}-\d{2}-\d{2}$/.test(scaleStart))return alert('Informe uma data válida no formato AAAA-MM-DD.')
  }
  employeeScaleEffectiveDate.value=scaleStart

  const payload={
    registration:employeeRegistration.value.trim(),full_name:managementEmployeeName.value.trim(),operation_id:employeeOperation.value,leader_id:employeeLeader.value||null,shift_id:null,
    scale_id:selectedScale,schedule_catalog_id:catalogId,sex:employeeSex.value,admission_date:employeeAdmissionDate.value,dismissal_date:employeeDismissalDate.value||null,
    contract_end_date:employeeContractEnd.value||null,contract_extension_date:employeeContractExtension.value||null,phone:employeePhone.value.trim()||null,email:employeeEmail.value.trim()||null,
    status:employeeDismissalDate.value?'desligado':employeeStatus.value,vest_size:employeeVest.value.trim()||null,glove_size:employeeGlove.value.trim()||null,boot_size:employeeBoot.value.trim()||null,
    termination_type:employeeTerminationType.value||null,termination_reason:employeeTerminationReason.value.trim()||null,eligible_for_rehire:employeeRehire.value===''?null:employeeRehire.value==='true',updated_at:new Date().toISOString()
  }

  let id=employeeId.value,isNew=!id
  if(id){const {error}=await db.from('employees').update(payload).eq('id',id);if(error)return alert(error.message)}
  else{const {data,error}=await db.from('employees').insert(payload).select('id').single();if(error)return alert(error.message);id=data.id}

  if(selectedScale&&(isNew||scaleChanged)){
    const scaleSave=await db.rpc('admin_set_employee_scale',{target_employee_id:id,target_scale_id:selectedScale,start_date:employeeScaleEffectiveDate.value||employeeAdmissionDate.value})
    if(scaleSave.error)return alert(scaleSave.error.message)
  }else if(!selectedScale&&employeeId.value&&scaleChanged){
    const cleared=await db.rpc('admin_clear_employee_scale',{target_employee_id:id,effective_date:employeeScaleEffectiveDate.value||new Date().toISOString().slice(0,10)})
    if(cleared.error)return alert(cleared.error.message)
  }

  const privateSave=await db.from('employee_private_data').upsert({employee_id:id,cpf:managementEmployeeCpf.value,birth_date:employeeBirthDate.value})
  if(privateSave.error)return alert(privateSave.error.message)
  await db.from('employee_benefits').delete().eq('employee_id',id)
  const selected=[...employeeBenefits.selectedOptions].map(x=>({employee_id:id,benefit_id:x.value}))
  if(selected.length){const linked=await db.from('employee_benefits').insert(selected);if(linked.error)return alert(linked.error.message)}

  try{
    if(selectedScale){await window.NexoScheduleCatalog?.clearPending?.(id)}
    else await window.NexoScheduleCatalog?.createPending?.(id,'',null,null,employeeAdmissionDate.value)
  }catch(error){console.warn('Pendência de horário:',error)}

  alert(selectedScale?'Colaborador salvo com sucesso!':'Colaborador salvo. O horário ficou pendente para regularização.')
  closeEmployeeForm();await loadManagement();if(typeof loadDashboard==='function')await loadDashboard()
})

employeeAdmissionDate.addEventListener('change',()=>{if(!employeeId.value)employeeScaleEffectiveDate.value=employeeAdmissionDate.value})
