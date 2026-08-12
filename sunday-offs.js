(() => {
  const root=document.getElementById('sundayOffRoot')
  if(!root)return

  const state={ctx:null,month:new Date().toISOString().slice(0,7),rows:[],search:'',operation:'',dirty:new Map()}
  const esc=value=>window.escapeHTML?escapeHTML(value):String(value??'')
  const br=date=>date?new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR'):'—'
  const todayMonth=()=>new Date().toISOString().slice(0,7)

  function monthStart(value){return `${value}-01`}
  function selectedFor(row){return state.dirty.has(row.employee_id)?state.dirty.get(row.employee_id):row.selected_off_date||''}
  function rowsFiltered(){
    const term=state.search.trim().toLowerCase()
    return state.rows.filter(row=>(!state.operation||row.operation_id===state.operation)&&(!term||`${row.registration} ${row.full_name} ${row.operation_name||''}`.toLowerCase().includes(term)))
  }
  function uniqueOperations(){
    const map=new Map()
    state.rows.forEach(row=>map.set(row.operation_id,row.operation_name||'Operação'))
    return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
  }

  function renderShell(){
    root.innerHTML=`<section class="card retention-card sunday-off-card">
      <div class="page-head compact">
        <div><h2>Folgas de domingo</h2><p class="muted">Defina a folga acordada do mês. Cada colaborador pode ter no máximo um domingo acordado por mês.</p></div>
        <button id="sundayOffRefresh" class="btn btn-light btn-small" type="button">Atualizar</button>
      </div>
      <div class="retention-notice"><strong>Como funciona:</strong> o NEXO só permite escolher domingos em que a escala daquele colaborador previa trabalho. A folga salva aparece como <strong>FO</strong> na presença e deixa de contar como jornada prevista no ABS.</div>
      <div class="sunday-off-toolbar">
        <label class="field"><span>Mês</span><input id="sundayOffMonth" class="input" type="month" value="${state.month}"></label>
        <label class="field"><span>Operação</span><select id="sundayOffOperation" class="input"><option value="">Todas</option></select></label>
        <label class="field grow"><span>Buscar</span><input id="sundayOffSearch" class="input" placeholder="Nome ou matrícula..."></label>
      </div>
      <div class="retention-kpis" id="sundayOffKpis"></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Operação</th><th>Domingos previstos</th><th>Folga acordada</th><th>Status</th></tr></thead><tbody id="sundayOffRows"></tbody></table></div>
      <div class="retention-actions"><span id="sundayOffDirtyText" class="muted">Nenhuma alteração pendente.</span><button id="sundayOffSave" class="btn btn-primary" type="button" disabled>Salvar alterações</button></div>
    </section>`
    sundayOffRefresh.onclick=load
    sundayOffMonth.onchange=()=>{state.month=sundayOffMonth.value||todayMonth();state.dirty.clear();load()}
    sundayOffOperation.onchange=()=>{state.operation=sundayOffOperation.value;renderRows()}
    sundayOffSearch.oninput=()=>{state.search=sundayOffSearch.value;renderRows()}
    sundayOffSave.onclick=saveAll
  }

  function renderRows(){
    const rows=rowsFiltered()
    const total=state.rows.length
    const selected=state.rows.filter(row=>selectedFor(row)).length
    const noNeed=state.rows.filter(row=>!(row.planned_sundays||[]).length).length
    const pending=state.rows.filter(row=>(row.planned_sundays||[]).length&&!selectedFor(row)).length
    sundayOffKpis.innerHTML=`
      <div class="retention-kpi"><span>Minha equipe</span><strong>${total}</strong></div>
      <div class="retention-kpi success"><span>Folgas definidas</span><strong>${selected}</strong></div>
      <div class="retention-kpi attention"><span>Pendentes</span><strong>${pending}</strong></div>
      <div class="retention-kpi"><span>Domingo já livre na escala</span><strong>${noNeed}</strong></div>`

    sundayOffRows.innerHTML=rows.map(row=>{
      const sundays=Array.isArray(row.planned_sundays)?row.planned_sundays:[]
      const current=selectedFor(row)
      const options=sundays.map(date=>`<option value="${date}" ${current===date?'selected':''}>${br(date)}</option>`).join('')
      const disabled=!sundays.length
      const status=disabled
        ? '<span class="badge badge-gray">Já folga no domingo</span>'
        : current?'<span class="badge badge-green">Definida</span>':'<span class="badge badge-yellow">Pendente</span>'
      return `<tr>
        <td><strong>${esc(row.full_name)}</strong><br><small>${esc(row.registration)}</small></td>
        <td>${esc(row.operation_name||'—')}</td>
        <td>${sundays.length?sundays.map(br).join(' · '):'Nenhum domingo de trabalho neste mês'}</td>
        <td>${disabled?'—':`<select class="input sunday-off-select" data-employee="${row.employee_id}"><option value="">Selecione...</option>${options}</select><button class="text-button sunday-off-clear" data-employee="${row.employee_id}" type="button" ${current?'':'disabled'}>Limpar</button>`}</td>
        <td>${status}</td>
      </tr>`
    }).join('')||'<tr><td colspan="5" class="empty">Nenhum colaborador encontrado para os filtros.</td></tr>'

    document.querySelectorAll('.sunday-off-select').forEach(select=>select.onchange=()=>{
      state.dirty.set(select.dataset.employee,select.value)
      updateDirty();renderRows()
    })
    document.querySelectorAll('.sunday-off-clear').forEach(button=>button.onclick=()=>{
      state.dirty.set(button.dataset.employee,'')
      updateDirty();renderRows()
    })
    updateDirty()
  }

  function updateDirty(){
    const count=state.dirty.size
    sundayOffSave.disabled=!count
    sundayOffSave.textContent=count?`Salvar ${count} alteração${count===1?'':'ões'}`:'Salvar alterações'
    sundayOffDirtyText.textContent=count?`${count} colaborador${count===1?'':'es'} com alteração pendente.`:'Nenhuma alteração pendente.'
  }

  async function load(){
    if(!state.ctx)return
    sundayOffRefresh.disabled=true
    const {data,error}=await db.rpc('get_my_sunday_off_planning',{p_month:monthStart(state.month)})
    sundayOffRefresh.disabled=false
    if(error)return alert(`Não foi possível carregar as folgas de domingo: ${error.message}`)
    state.rows=data||[]
    state.dirty.clear()
    const previous=state.operation
    sundayOffOperation.innerHTML='<option value="">Todas</option>'+uniqueOperations().map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')
    if(uniqueOperations().some(([id])=>id===previous))sundayOffOperation.value=previous
    else state.operation=''
    renderRows()
  }

  async function saveAll(){
    if(!state.dirty.size)return
    const entries=[...state.dirty.entries()]
    if(!confirm(`Salvar a folga de domingo de ${entries.length} colaborador(es)?`))return
    sundayOffSave.disabled=true
    let ok=0
    const errors=[]
    for(const [employeeId,date] of entries){
      const row=state.rows.find(item=>item.employee_id===employeeId)
      const result=date
        ? await db.rpc('set_employee_sunday_off',{p_employee_id:employeeId,p_off_date:date})
        : await db.rpc('clear_employee_sunday_off',{p_employee_id:employeeId,p_month:monthStart(state.month)})
      if(result.error)errors.push(`${row?.full_name||employeeId}: ${result.error.message}`)
      else ok++
    }
    if(errors.length)alert(`Folgas processadas.\n\nSalvas: ${ok}\nFalhas: ${errors.length}\n\n${errors.slice(0,8).join('\n')}`)
    else alert(`${ok} folga${ok===1?'':'s'} de domingo salva${ok===1?'':'s'} com sucesso.`)
    await load()
  }

  renderShell()
  getSessionContext('leader').then(async ctx=>{
    if(!ctx)return
    state.ctx=ctx
    if(!requireModuleAccess(ctx.profile,'my_team'))return
    await load()
  })
})()
