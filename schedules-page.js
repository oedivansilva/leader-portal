(() => {
  const state={scales:[],days:[],employees:[],editing:null}
  const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const $=id=>document.getElementById(id)
  const esc=value=>window.escapeHTML?escapeHTML(value):String(value??'')

  function installTabs(){
    document.querySelectorAll('.schedule-tabs [data-scroll]').forEach(button=>{
      button.addEventListener('click',()=>{
        const target=$(button.dataset.scroll)
        target?.scrollIntoView({behavior:'smooth',block:'start'})
        document.querySelectorAll('.schedule-tabs [data-scroll]').forEach(item=>item.classList.toggle('active',item===button))
      })
    })
  }

  function injectScaleUi(){
    const root=$('scheduleScaleRoot');if(!root||$('nexoManualScalesCard'))return
    root.innerHTML=`<section id="nexoManualScalesCard" class="card schedule-scales-card">
      <div class="page-head"><div><h2>Escalas de trabalho</h2><p class="muted">Use o Catálogo Shopee como padrão. Este cadastro fica disponível para escalas manuais, exceções e estruturas que ainda não usam código oficial.</p></div><button class="btn btn-light" type="button" id="scheduleScaleNew">+ Nova escala</button></div>
      <div id="scheduleScaleFormWrap" class="schedule-scale-form hidden">
        <form id="scheduleScaleForm" class="stack">
          <div class="grid-2"><div class="field"><label>Nome</label><input id="scheduleScaleName" class="input" placeholder="Ex.: 5x2 — segunda a sexta" required></div><div class="field"><label>Descrição</label><input id="scheduleScaleDescription" class="input" placeholder="Descrição completa"></div></div>
          <div class="field"><label>Dias trabalhados</label><div class="weekday-grid">${[1,2,3,4,5,6,0].map(day=>`<label><input type="checkbox" name="scheduleScaleDay" value="${day}"> ${weekdays[day]}</label>`).join('')}</div><small class="muted">Dias não selecionados são considerados folga.</small></div>
          <div class="actions"><button class="btn btn-primary" id="scheduleScaleSave">Salvar escala</button><button class="btn btn-light" type="button" id="scheduleScaleCancel">Cancelar</button></div>
        </form>
      </div>
      <div class="toolbar"><input id="scheduleScaleSearch" class="input" placeholder="Buscar escala..."></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Dias trabalhados</th><th>Descrição</th><th>Vínculos</th><th>Status</th><th>Ações</th></tr></thead><tbody id="scheduleScaleRows"></tbody></table></div>
    </section>`
    $('scheduleScaleNew').onclick=()=>openScaleForm()
    $('scheduleScaleCancel').onclick=closeScaleForm
    $('scheduleScaleSearch').addEventListener('input',renderScales)
    $('scheduleScaleForm').addEventListener('submit',saveScale)
  }

  async function loadScales(){
    const [scales,days,employees]=await Promise.all([
      db.from('work_scales').select('*').order('name'),
      db.from('scale_work_days').select('*'),
      db.from('employees').select('id,scale_id,status')
    ])
    const fail=[scales,days,employees].find(result=>result.error)
    if(fail)throw fail.error
    state.scales=scales.data||[];state.days=days.data||[];state.employees=employees.data||[]
    renderScales()
  }

  function renderScales(){
    const body=$('scheduleScaleRows');if(!body)return
    const term=($('scheduleScaleSearch')?.value||'').trim().toLowerCase()
    const rows=state.scales.filter(scale=>!term||`${scale.name} ${scale.description||''}`.toLowerCase().includes(term))
    body.innerHTML=rows.map(scale=>{
      const days=state.days.filter(item=>item.scale_id===scale.id).map(item=>weekdays[item.weekday]).join(', ')||'Nenhum'
      const linked=state.employees.filter(item=>item.scale_id===scale.id).length
      return `<tr><td><strong>${esc(scale.name)}</strong></td><td>${esc(days)}</td><td>${esc(scale.description||'—')}</td><td>${linked}</td><td><span class="badge ${scale.active?'badge-green':'badge-gray'}">${scale.active?'Ativa':'Inativa'}</span></td><td><div class="actions"><button class="btn btn-light btn-small" onclick="NexoSchedulesPage.edit('${scale.id}')">Editar</button><button class="btn btn-light btn-small" onclick="NexoSchedulesPage.toggle('${scale.id}',${!scale.active})">${scale.active?'Desativar':'Reativar'}</button><button class="btn btn-danger btn-small" onclick="NexoSchedulesPage.remove('${scale.id}')" ${linked?'disabled title="Há colaboradores vinculados"':''}>Excluir</button></div></td></tr>`
    }).join('')||'<tr><td colspan="6" class="empty">Nenhuma escala cadastrada.</td></tr>'
  }

  function openScaleForm(id=null){
    state.editing=id
    const scale=id?state.scales.find(item=>item.id===id):null
    $('scheduleScaleName').value=scale?.name||''
    $('scheduleScaleDescription').value=scale?.description||''
    const activeDays=new Set(id?state.days.filter(item=>item.scale_id===id).map(item=>Number(item.weekday)):[])
    document.querySelectorAll('[name="scheduleScaleDay"]').forEach(input=>input.checked=activeDays.has(Number(input.value)))
    $('scheduleScaleSave').textContent=id?'Salvar alterações':'Cadastrar escala'
    $('scheduleScaleFormWrap').classList.remove('hidden')
    $('scheduleScaleFormWrap').scrollIntoView({behavior:'smooth',block:'center'})
  }
  function closeScaleForm(){state.editing=null;$('scheduleScaleForm')?.reset();$('scheduleScaleFormWrap')?.classList.add('hidden')}

  async function saveScale(event){
    event.preventDefault()
    const days=[...document.querySelectorAll('[name="scheduleScaleDay"]:checked')].map(input=>Number(input.value))
    if(!days.length)return alert('Selecione ao menos um dia trabalhado.')
    let id=state.editing
    if(id){
      const updated=await db.from('work_scales').update({name:$('scheduleScaleName').value.trim(),description:$('scheduleScaleDescription').value.trim()||null}).eq('id',id)
      if(updated.error)return alert(updated.error.message)
      const removed=await db.from('scale_work_days').delete().eq('scale_id',id);if(removed.error)return alert(removed.error.message)
    }else{
      const created=await db.from('work_scales').insert({name:$('scheduleScaleName').value.trim(),description:$('scheduleScaleDescription').value.trim()||null}).select('id').single()
      if(created.error)return alert(created.error.message);id=created.data.id
    }
    const inserted=await db.from('scale_work_days').insert(days.map(weekday=>({scale_id:id,weekday})))
    if(inserted.error)return alert(inserted.error.message)
    closeScaleForm();await loadScales()
  }
  async function toggleScale(id,active){const {error}=await db.from('work_scales').update({active}).eq('id',id);if(error)return alert(error.message);await loadScales()}
  async function deleteScale(id){
    const linked=state.employees.filter(item=>item.scale_id===id).length
    if(linked)return alert(`Esta escala possui ${linked} colaborador(es) vinculado(s).`)
    if(!confirm('Excluir definitivamente esta escala?'))return
    const {error}=await db.from('work_scales').delete().eq('id',id);if(error)return alert(error.message);await loadScales()
  }

  async function init(){
    const context=await getSessionContext('admin');if(!context)return
    if(!requireModuleAccess(context.profile,'schedules'))return
    renderPortalSidebar($('portalSidebar'),context.profile,'schedules')
    installTabs();injectScaleUi()
    try{await loadScales()}catch(error){alert(`Não foi possível carregar as escalas: ${error.message}`)}
  }

  window.NexoSchedulesPage={edit:openScaleForm,toggle:toggleScale,remove:deleteScale,load:loadScales}
  init()
})()
