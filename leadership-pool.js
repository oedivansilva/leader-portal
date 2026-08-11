(() => {
  const state={ctx:null,groups:[],members:[],leaders:[],catalog:[],employees:[],pool:null,adminScheduleFilter:'',adminOnlyUsed:true,leaderTab:'team',leaderSearch:''}

  const q=id=>document.getElementById(id)
  const esc=value=>window.escapeHTML?escapeHTML(value):String(value??'')
  const dateBR=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR'):'—'
  const time5=value=>value?String(value).slice(0,5):''

  function toast(message,type='ok'){
    let el=q('nexoLeadershipToast')
    if(!el){
      el=document.createElement('div');el.id='nexoLeadershipToast';el.className='leadership-toast';document.body.appendChild(el)
    }
    el.className=`leadership-toast ${type}`;el.textContent=message;el.classList.add('show')
    clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),3200)
  }

  function modal(title,subtitle,html){
    const overlay=document.createElement('div')
    overlay.className='leadership-modal'
    overlay.innerHTML=`<div class="leadership-modal-card"><div class="page-head"><div><h2>${esc(title)}</h2><p class="muted">${esc(subtitle||'')}</p></div><button class="btn btn-light" data-close>Fechar</button></div><div class="leadership-modal-body">${html}</div></div>`
    document.body.appendChild(overlay)
    overlay.querySelector('[data-close]').onclick=()=>overlay.remove()
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()})
    return overlay
  }

  function groupForSchedule(scheduleId){
    const item=state.catalog.find(x=>x.id===scheduleId)
    return state.groups.find(g=>g.id===item?.leadership_group_id)||null
  }

  function currentMembers(groupId){
    const today=new Date().toISOString().slice(0,10)
    return state.members.filter(m=>m.group_id===groupId&&m.effective_from<=today&&(!m.effective_to||m.effective_to>=today))
  }

  function scheduleLabel(item){
    if(!item)return 'Horário pendente'
    const period=item.base_start_time&&item.base_end_time?`${time5(item.base_start_time)}-${time5(item.base_end_time)}`:'horário a revisar'
    return `${item.source_code} · ${item.scale_pattern||'Escala'} · ${item.base_days_text||'dias a revisar'} · ${period}`
  }

  async function loadAdminData(){
    const [groups,members,leaders,catalog,employees]=await Promise.all([
      db.from('leadership_groups').select('*').order('sort_order').order('code'),
      db.from('leadership_group_leaders').select('*,profiles!leadership_group_leaders_leader_id_fkey(id,full_name,email,active,role)').order('effective_from',{ascending:false}),
      db.from('profiles').select('id,full_name,email,active,role').eq('role','leader').eq('active',true).order('full_name'),
      db.from('schedule_catalog').select('id,source_code,display_name,scale_pattern,base_days_text,base_start_time,base_end_time,leadership_group_id,active,requires_review').eq('active',true).order('source_code'),
      db.from('employees').select('id,registration,full_name,status,operation_id,leader_id,schedule_catalog_id').eq('status','ativo')
    ])
    const fail=[groups,members,leaders,catalog,employees].find(x=>x.error)
    if(fail)throw fail.error
    state.groups=groups.data||[];state.members=members.data||[];state.leaders=leaders.data||[];state.catalog=catalog.data||[];state.employees=employees.data||[]
    renderAdmin()
  }

  function injectAdmin(){
    const structure=q('structure')
    if(!structure||q('leadershipAdminCard'))return
    const card=document.createElement('div')
    card.id='leadershipAdminCard';card.className='card leadership-admin-card'
    card.innerHTML=`
      <div class="page-head">
        <div><h2>Carteiras de liderança</h2><p class="muted">O horário define o grupo elegível. Enquanto ninguém resgata, o colaborador fica compartilhado entre os líderes daquele turno.</p></div>
        <button class="btn btn-light" type="button" id="leadershipRefreshAdmin">Atualizar</button>
      </div>
      <div id="leadershipAdminKpis" class="leadership-kpis"></div>
      <div class="leadership-admin-grid">
        <div class="leadership-subcard">
          <div class="page-head compact"><div><h3>Grupos e líderes</h3><p class="muted">AM, PM ou qualquer outro grupo que a operação precisar.</p></div><button class="btn btn-light btn-small" id="leadershipNewGroup">+ Grupo</button></div>
          <div id="leadershipGroupRows"></div>
        </div>
        <div class="leadership-subcard">
          <div class="page-head compact"><div><h3>Distribuição atual</h3><p class="muted">Quem já foi resgatado e quem ainda está aguardando.</p></div></div>
          <div id="leadershipDistribution"></div>
        </div>
      </div>
      <div class="leadership-subcard" style="margin-top:16px">
        <div class="page-head compact"><div><h3>Vincular horários aos grupos</h3><p class="muted">Faça em lote. Você não precisa abrir código por código.</p></div></div>
        <div class="leadership-schedule-toolbar">
          <input id="leadershipScheduleSearch" class="input" placeholder="Buscar código, escala ou horário...">
          <select id="leadershipScheduleGroup" class="input"></select>
          <label class="leadership-checkbox"><input id="leadershipOnlyUsed" type="checkbox" checked> Mostrar só horários em uso</label>
          <button class="btn btn-primary" id="leadershipApplySchedules" type="button">Aplicar aos selecionados</button>
        </div>
        <div class="leadership-select-line"><label><input id="leadershipSelectAllSchedules" type="checkbox"> Selecionar todos os horários exibidos</label><span id="leadershipScheduleCount" class="muted"></span></div>
        <div class="table-wrap leadership-schedule-table"><table class="table"><thead><tr><th></th><th>Código</th><th>Jornada</th><th>Grupo atual</th><th>Em uso</th></tr></thead><tbody id="leadershipScheduleRows"></tbody></table></div>
      </div>`
    structure.appendChild(card)

    q('leadershipRefreshAdmin').onclick=()=>loadAdminData().catch(e=>alert(e.message))
    q('leadershipNewGroup').onclick=openNewGroup
    q('leadershipScheduleSearch').addEventListener('input',e=>{state.adminScheduleFilter=e.target.value;renderScheduleMapping()})
    q('leadershipOnlyUsed').addEventListener('change',e=>{state.adminOnlyUsed=e.target.checked;renderScheduleMapping()})
    q('leadershipSelectAllSchedules').addEventListener('change',e=>document.querySelectorAll('.leadership-schedule-check').forEach(c=>c.checked=e.target.checked))
    q('leadershipApplySchedules').onclick=applyScheduleGroup
  }

  function renderAdmin(){
    if(!q('leadershipAdminCard'))return
    const waiting=state.employees.filter(e=>!e.leader_id&&groupForSchedule(e.schedule_catalog_id)).length
    const pendingSchedule=state.employees.filter(e=>!e.schedule_catalog_id).length
    const noGroup=state.employees.filter(e=>e.schedule_catalog_id&&!groupForSchedule(e.schedule_catalog_id)).length
    const claimed=state.employees.filter(e=>e.leader_id).length
    q('leadershipAdminKpis').innerHTML=`
      <div class="leadership-kpi"><span>Resgatados</span><strong>${claimed}</strong><small>com líder principal</small></div>
      <div class="leadership-kpi attention"><span>Aguardando resgate</span><strong>${waiting}</strong><small>compartilhados no turno</small></div>
      <div class="leadership-kpi warning"><span>Horário sem grupo</span><strong>${noGroup}</strong><small>precisam classificar AM/PM</small></div>
      <div class="leadership-kpi neutral"><span>Horário pendente</span><strong>${pendingSchedule}</strong><small>turno ainda indefinido</small></div>`

    q('leadershipGroupRows').innerHTML=state.groups.map(group=>{
      const memberRows=currentMembers(group.id)
      const names=memberRows.map(m=>m.profiles?.full_name).filter(Boolean)
      return `<div class="leadership-group-row">
        <div><div class="leadership-group-title"><span class="leadership-group-code">${esc(group.code)}</span><strong>${esc(group.name)}</strong></div><small class="muted">${names.length?esc(names.join(' · ')):'Nenhum líder configurado'}</small></div>
        <button class="btn btn-light btn-small" onclick="NexoLeadershipPool.editMembers('${group.id}')">Gerenciar líderes</button>
      </div>`
    }).join('')||'<div class="empty">Nenhum grupo cadastrado.</div>'

    const leaderCounts=new Map()
    state.employees.filter(e=>e.leader_id).forEach(e=>leaderCounts.set(e.leader_id,(leaderCounts.get(e.leader_id)||0)+1))
    q('leadershipDistribution').innerHTML=state.groups.map(group=>{
      const members=currentMembers(group.id)
      const waitingGroup=state.employees.filter(e=>!e.leader_id&&groupForSchedule(e.schedule_catalog_id)?.id===group.id).length
      return `<div class="leadership-distribution-group"><div class="leadership-distribution-head"><strong>${esc(group.code)} · ${esc(group.name)}</strong><span class="badge badge-yellow">${waitingGroup} aguardando</span></div>${members.map(m=>`<div class="leadership-person-line"><span>${esc(m.profiles?.full_name||'Líder')}</span><strong>${leaderCounts.get(m.leader_id)||0}</strong></div>`).join('')||'<small class="muted">Sem líderes no grupo.</small>'}</div>`
    }).join('')

    q('leadershipScheduleGroup').innerHTML='<option value="">Sem grupo</option>'+state.groups.filter(g=>g.active).map(g=>`<option value="${g.id}">${esc(g.code)} — ${esc(g.name)}</option>`).join('')
    renderScheduleMapping()
  }

  function renderScheduleMapping(){
    const tbody=q('leadershipScheduleRows');if(!tbody)return
    const term=(state.adminScheduleFilter||'').trim().toLowerCase()
    const usage=new Map()
    state.employees.forEach(e=>{if(e.schedule_catalog_id)usage.set(e.schedule_catalog_id,(usage.get(e.schedule_catalog_id)||0)+1)})
    const rows=state.catalog.filter(item=>{
      if(state.adminOnlyUsed&&!usage.get(item.id))return false
      const text=`${item.source_code} ${item.display_name||''} ${item.scale_pattern||''} ${item.base_days_text||''} ${time5(item.base_start_time)} ${time5(item.base_end_time)}`.toLowerCase()
      return !term||text.includes(term)
    })
    q('leadershipScheduleCount').textContent=`${rows.length} horário(s) exibido(s)`
    q('leadershipSelectAllSchedules').checked=false
    tbody.innerHTML=rows.map(item=>{
      const group=state.groups.find(g=>g.id===item.leadership_group_id)
      return `<tr><td><input type="checkbox" class="leadership-schedule-check" value="${item.id}"></td><td><strong>${esc(item.source_code)}</strong><br><small>${esc(item.scale_pattern||'—')}</small></td><td>${esc(item.base_days_text||'—')}<br><small>${item.base_start_time?`${time5(item.base_start_time)}-${time5(item.base_end_time)}`:'a revisar'}</small></td><td>${group?`<span class="leadership-group-pill">${esc(group.code)}</span> ${esc(group.name)}`:'<span class="badge badge-yellow">Sem grupo</span>'}</td><td>${usage.get(item.id)||0}</td></tr>`
    }).join('')||'<tr><td colspan="5" class="empty">Nenhum horário encontrado.</td></tr>'
  }

  async function applyScheduleGroup(){
    const ids=[...document.querySelectorAll('.leadership-schedule-check:checked')].map(x=>x.value)
    if(!ids.length)return alert('Selecione ao menos um horário.')
    const groupId=q('leadershipScheduleGroup').value||null
    const group=state.groups.find(g=>g.id===groupId)
    if(!confirm(`Aplicar ${group?`o grupo ${group.code}`:'SEM GRUPO'} a ${ids.length} horário(s)?`))return
    const {data,error}=await db.rpc('admin_assign_schedules_to_leadership_group',{p_schedule_ids:ids,p_group_id:groupId})
    if(error)return alert(error.message)
    toast(`${data||ids.length} horário(s) atualizado(s).`)
    await loadAdminData()
  }

  function openNewGroup(){
    const overlay=modal('Novo grupo de liderança','Use um código curto, como AM, PM, T1 ou T2.',`<form id="leadershipNewGroupForm"><div class="grid-2"><div class="field"><label>Código</label><input id="leadershipNewCode" class="input" maxlength="12" required placeholder="Ex.: AM"></div><div class="field"><label>Nome</label><input id="leadershipNewName" class="input" required placeholder="Ex.: Manhã"></div></div><div class="field"><label>Descrição <span class="muted">(opcional)</span></label><input id="leadershipNewDescription" class="input"></div><button class="btn btn-primary">Criar grupo</button></form>`)
    overlay.querySelector('#leadershipNewGroupForm').onsubmit=async e=>{
      e.preventDefault()
      const {error}=await db.rpc('admin_upsert_leadership_group',{p_code:q('leadershipNewCode').value,p_name:q('leadershipNewName').value,p_description:q('leadershipNewDescription').value||null,p_active:true})
      if(error)return alert(error.message)
      overlay.remove();toast('Grupo criado.');await loadAdminData()
    }
  }

  function editMembers(groupId){
    const group=state.groups.find(g=>g.id===groupId);if(!group)return
    const selected=new Set(currentMembers(groupId).map(m=>m.leader_id))
    const html=`<form id="leadershipMembersForm"><div class="leadership-member-list">${state.leaders.map(leader=>`<label class="leadership-member-option"><input type="checkbox" name="leaderMember" value="${leader.id}" ${selected.has(leader.id)?'checked':''}><span><strong>${esc(leader.full_name)}</strong><small>${esc(leader.email||'')}</small></span></label>`).join('')||'<div class="empty">Nenhum líder ativo encontrado.</div>'}</div><div class="field"><label>Vigência da configuração</label><input id="leadershipMemberDate" type="date" class="input" value="${new Date().toISOString().slice(0,10)}"></div><div class="notice">Se um líder sair deste grupo, colaboradores incompatíveis voltarão para <strong>Aguardando resgate</strong>. O histórico anterior permanece salvo.</div><button class="btn btn-primary">Salvar líderes do grupo</button></form>`
    const overlay=modal(`${group.code} — ${group.name}`,'Selecione todos os líderes que podem resgatar colaboradores deste turno.',html)
    overlay.querySelector('#leadershipMembersForm').onsubmit=async e=>{
      e.preventDefault();const ids=[...overlay.querySelectorAll('input[name="leaderMember"]:checked')].map(x=>x.value)
      const {error}=await db.rpc('admin_set_leadership_group_members',{p_group_id:group.id,p_leader_ids:ids,p_effective_from:overlay.querySelector('#leadershipMemberDate').value})
      if(error)return alert(error.message)
      overlay.remove();toast('Líderes do grupo atualizados.');await loadAdminData()
    }
  }

  async function loadLeaderPool(){
    const {data,error}=await db.rpc('get_leader_team_pool')
    if(error)throw error
    state.pool=data||{groups:[],my_team:[],available:[]}
    renderLeaderPool()
  }

  function injectLeader(){
    const context=q('leaderContext')
    const main=context?.closest('main')
    if(!main||q('leaderPortfolioCard'))return
    const firstActivity=q('leaderRecentActivity')
    const card=document.createElement('section')
    card.id='leaderPortfolioCard';card.className='card leadership-leader-card'
    card.innerHTML=`
      <div class="page-head compact"><div><h2>Minha equipe</h2><p class="muted">Colaboradores do seu turno ficam compartilhados até um líder resgatá-los.</p></div><button class="btn btn-light btn-small" id="leaderPoolRefresh">Atualizar</button></div>
      <div id="leaderPoolGroups" class="leadership-group-chips"></div>
      <div id="leaderPoolKpis" class="leadership-kpis leader"></div>
      <div class="leadership-tabs"><button class="active" data-tab="team">Minha equipe</button><button data-tab="available">Disponíveis para resgate <span id="leaderPoolAvailableBadge"></span></button></div>
      <div class="leadership-leader-toolbar"><input id="leaderPoolSearch" class="input" placeholder="Buscar nome ou matrícula..."></div>
      <div id="leaderPoolRows"></div>`
    if(firstActivity)firstActivity.insertAdjacentElement('beforebegin',card);else main.querySelector('.page-head')?.insertAdjacentElement('afterend',card)
    q('leaderPoolRefresh').onclick=()=>loadLeaderPool().catch(e=>alert(e.message))
    q('leaderPoolSearch').addEventListener('input',e=>{state.leaderSearch=e.target.value;renderLeaderRows()})
    card.querySelectorAll('.leadership-tabs button').forEach(btn=>btn.onclick=()=>{
      state.leaderTab=btn.dataset.tab
      card.querySelectorAll('.leadership-tabs button').forEach(x=>x.classList.toggle('active',x===btn))
      renderLeaderRows()
    })
  }

  function renderLeaderPool(){
    if(!q('leaderPortfolioCard'))return
    const groups=state.pool?.groups||[],team=state.pool?.my_team||[],available=state.pool?.available||[]
    q('leaderPoolGroups').innerHTML=groups.length?groups.map(g=>`<span class="leadership-group-pill">${esc(g.code)} · ${esc(g.name)}</span>`).join(''):'<span class="badge badge-yellow">Nenhum grupo de liderança configurado para você</span>'
    q('leaderPoolKpis').innerHTML=`<div class="leadership-kpi"><span>Minha equipe</span><strong>${team.length}</strong><small>responsabilidade principal</small></div><div class="leadership-kpi attention"><span>Disponíveis</span><strong>${available.length}</strong><small>podem ser resgatados</small></div>`
    q('leaderPoolAvailableBadge').textContent=available.length?`(${available.length})`:''
    if(!team.length&&available.length){state.leaderTab='available';q('leaderPortfolioCard').querySelectorAll('.leadership-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='available'))}
    renderLeaderRows()
  }

  function renderLeaderRows(){
    const target=q('leaderPoolRows');if(!target)return
    const rows=state.leaderTab==='available'?(state.pool?.available||[]):(state.pool?.my_team||[])
    const term=(state.leaderSearch||'').trim().toLowerCase()
    const filtered=rows.filter(r=>!term||`${r.registration} ${r.full_name} ${r.operation_name} ${r.schedule_code||''}`.toLowerCase().includes(term))
    target.innerHTML=filtered.map(row=>`<div class="leadership-employee-row"><div class="leadership-employee-main"><strong>${esc(row.full_name)}</strong><small>${esc(row.registration)} · ${esc(row.operation_name)}</small></div><div class="leadership-employee-meta"><span>${row.group_code?`<b>${esc(row.group_code)}</b> · `:''}${row.schedule_code?esc(`${row.schedule_code} · ${row.scale_pattern||'Escala'}`):'Horário pendente'}</span><small>Admissão ${dateBR(row.admission_date)}</small></div><div>${state.leaderTab==='available'?`<button class="btn btn-primary btn-small" onclick="NexoLeadershipPool.claim('${row.id}')">Resgatar</button>`:`<button class="btn btn-light btn-small" onclick="NexoLeadershipPool.release('${row.id}','${esc(row.full_name).replace(/'/g,'&#39;')}')">Liberar</button>`}</div></div>`).join('')||`<div class="leadership-empty">${state.leaderTab==='available'?'Nenhum colaborador disponível para resgate neste momento.':'Sua equipe ainda está vazia.'}</div>`
  }

  async function claim(employeeId){
    const row=(state.pool?.available||[]).find(x=>x.id===employeeId)
    if(!row)return
    if(!confirm(`Resgatar ${row.full_name} para sua equipe?\n\nDepois disso, o colaborador deixa de aparecer como disponível para os demais líderes do turno.`))return
    const {data,error}=await db.rpc('claim_employee_for_leader',{p_employee_id:employeeId})
    if(error)return alert(error.message)
    toast(`${data?.employee_name||'Colaborador'} agora está na sua equipe.`)
    await loadLeaderPool()
    setTimeout(()=>location.reload(),500)
  }

  async function releaseEmployee(employeeId,name){
    const reason=prompt(`Liberar ${name} para a carteira compartilhada?\n\nMotivo (opcional):`,'')
    if(reason===null)return
    const {error}=await db.rpc('release_employee_from_leader',{p_employee_id:employeeId,p_reason:reason||null})
    if(error)return alert(error.message)
    toast(`${name} voltou para a carteira compartilhada.`)
    await loadLeaderPool()
    setTimeout(()=>location.reload(),500)
  }

  async function init(){
    try{
      const hasAdmin=q('structure')&&q('employees')
      const hasLeader=q('leaderContext')
      if(!hasAdmin&&!hasLeader)return
      const ctx=await getSessionContext()
      if(!ctx)return
      state.ctx=ctx
      if(ctx.profile.role==='admin'&&hasAdmin){injectAdmin();await loadAdminData()}
      if(ctx.profile.role==='leader'&&hasLeader){injectLeader();await loadLeaderPool()}
    }catch(error){console.warn('NEXO Carteira de Liderança:',error);toast(`Carteira de liderança: ${error.message}`,'error')}
  }

  window.NexoLeadershipPool={loadAdminData,loadLeaderPool,editMembers,claim,release:releaseEmployee,applyScheduleGroup}
  init()
})()
