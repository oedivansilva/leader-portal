(()=>{
  const state={requestId:null,dates:[],onSaved:null,reasons:null,legalBases:null,role:null,request:null}
  let modal

  function ensureModal(){
    if(modal)return
    modal=document.createElement('div')
    modal.id='disciplinaryRequestEditor'
    modal.className='portal-modal hidden'
    modal.innerHTML=`
      <div class="portal-modal-backdrop" data-editor-close></div>
      <section class="portal-modal-panel" role="dialog" aria-modal="true" aria-labelledby="requestEditorTitle">
        <div class="portal-modal-head">
          <div>
            <h2 id="requestEditorTitle">Editar solicitação</h2>
            <p class="muted">A solicitação poderá ser alterada até a confirmação da aplicação.</p>
          </div>
          <button type="button" class="portal-modal-close" data-editor-close aria-label="Fechar">&times;</button>
        </div>
        <form id="disciplinaryRequestEditorForm">
          <div class="request-editor-summary">
            <div><small>Colaborador</small><strong id="requestEditorEmployee"></strong></div>
            <div><small>Operação</small><strong id="requestEditorOperation"></strong></div>
            <div><small>Status atual</small><strong id="requestEditorStatus"></strong></div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Tipo de medida</label>
              <select id="requestEditorPenaltyType" class="input" required>
                <option value="Advertência">Advertência</option>
                <option value="Suspensão">Suspensão</option>
              </select>
            </div>
            <div class="field">
              <label>Motivo da ocorrência</label>
              <select id="requestEditorReason" class="input" required></select>
              <small class="muted">O motivo operacional é separado da fundamentação legal.</small>
            </div>
            <div id="requestEditorLegalField" class="field hidden">
              <label>Fundamentação legal — Art. 482 da CLT</label>
              <select id="requestEditorLegalBasis" class="input"></select>
              <small class="muted">A alínea é validada pelo RH/Admin ou Onsite antes da geração do documento.</small>
            </div>
            <div class="field">
              <label>Data de emissão</label>
              <input id="requestEditorIssueDate" type="date" class="input" required>
            </div>
            <div class="field">
              <label>Datas da ocorrência</label>
              <div class="request-editor-date-add">
                <input id="requestEditorIncidentDate" type="date" class="input">
                <button id="requestEditorAddDate" type="button" class="btn btn-primary">+ Adicionar</button>
              </div>
              <div id="requestEditorDates" class="request-editor-dates"></div>
            </div>
          </div>
          <div id="requestEditorSuspension" class="request-editor-suspension hidden">
            <div class="grid-3">
              <div class="field">
                <label>Dias de suspensão</label>
                <select id="requestEditorSuspensionDays" class="input">
                  <option value="1">1 dia</option>
                  <option value="3">3 dias</option>
                </select>
              </div>
              <div class="field">
                <label>Início da suspensão</label>
                <input id="requestEditorSuspensionStart" type="date" class="input">
              </div>
              <div class="field">
                <label>Retorno ao trabalho</label>
                <input id="requestEditorSuspensionReturn" type="date" class="input">
              </div>
            </div>
            <div class="notice"><strong>Atenção:</strong> confira se o início e o retorno correspondem a dias de trabalho do colaborador.</div>
          </div>
          <div class="notice request-editor-warning">
            Se o documento já estiver assinado, qualquer alteração de conteúdo ou fundamentação o invalidará. O RH/Onsite deverá revisar e assinar novamente.
          </div>
          <div class="portal-modal-actions">
            <button type="button" class="btn btn-light" data-editor-close>Cancelar</button>
            <button id="requestEditorSave" type="submit" class="btn btn-success">Salvar alterações</button>
          </div>
        </form>
      </section>`
    document.body.appendChild(modal)
    modal.querySelectorAll('[data-editor-close]').forEach(button=>button.addEventListener('click',close))
    modal.querySelector('#requestEditorPenaltyType').addEventListener('change',toggleSuspension)
    modal.querySelector('#requestEditorAddDate').addEventListener('click',addDate)
    modal.querySelector('#requestEditorIncidentDate').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addDate()}})
    modal.querySelector('#requestEditorSuspensionDays').addEventListener('change',updateReturnDate)
    modal.querySelector('#requestEditorSuspensionStart').addEventListener('change',updateReturnDate)
    modal.querySelector('#disciplinaryRequestEditorForm').addEventListener('submit',save)
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))close()})
  }

  function element(selector){return modal.querySelector(selector)}
  function close(){if(modal)modal.classList.add('hidden')}
  function normalizeRelation(value){return Array.isArray(value)?value[0]:value}

  async function getReasons(){
    if(state.reasons)return state.reasons
    const {data,error}=await db.from('penalty_reasons').select('id,code,title').order('code')
    if(error)throw new Error('Não foi possível carregar os motivos: '+error.message)
    state.reasons=data||[]
    return state.reasons
  }

  async function getLegalBases(){
    if(state.legalBases)return state.legalBases
    const {data,error}=await db.from('disciplinary_legal_bases').select('id,article,letter,title').eq('active',true).order('letter')
    if(error)throw new Error('Não foi possível carregar as fundamentações legais: '+error.message)
    state.legalBases=data||[]
    return state.legalBases
  }

  async function getEditorRole(){
    if(state.role)return state.role
    const {data:{user}}=await db.auth.getUser()
    if(!user)throw new Error('Sessão não encontrada.')
    const {data,error}=await db.from('profiles').select('role').eq('id',user.id).single()
    if(error)throw new Error('Não foi possível identificar seu perfil: '+error.message)
    state.role=data?.role||''
    return state.role
  }

  function parseLegacyDates(value){
    return [...String(value||'').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(match=>`${match[3]}-${match[2]}-${match[1]}`)
  }

  function renderDates(){
    const container=element('#requestEditorDates')
    if(!state.dates.length){container.innerHTML='<span class="muted">Nenhuma data adicionada.</span>';return}
    container.innerHTML=state.dates.slice().sort().map(date=>`<span class="badge badge-blue request-editor-date-badge">${new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}<button type="button" data-remove-date="${date}" aria-label="Remover data">&times;</button></span>`).join('')
    container.querySelectorAll('[data-remove-date]').forEach(button=>button.addEventListener('click',()=>{state.dates=state.dates.filter(date=>date!==button.dataset.removeDate);renderDates()}))
  }

  function addDate(){
    const input=element('#requestEditorIncidentDate'),date=input.value
    if(!date)return alert('Selecione uma data da ocorrência.')
    if(!state.dates.includes(date))state.dates.push(date)
    input.value=''
    renderDates()
  }

  function toggleSuspension(){
    const isSuspension=element('#requestEditorPenaltyType').value==='Suspensão'
    element('#requestEditorSuspension').classList.toggle('hidden',!isSuspension)
    if(isSuspension&&!element('#requestEditorSuspensionStart').value){
      const issue=element('#requestEditorIssueDate').value
      if(issue){const date=new Date(`${issue}T12:00:00`);date.setDate(date.getDate()+1);element('#requestEditorSuspensionStart').value=date.toISOString().slice(0,10);updateReturnDate()}
    }
  }

  function updateReturnDate(){
    const start=element('#requestEditorSuspensionStart').value
    if(!start)return
    const date=new Date(`${start}T12:00:00`)
    date.setDate(date.getDate()+Number(element('#requestEditorSuspensionDays').value||1))
    element('#requestEditorSuspensionReturn').value=date.toISOString().slice(0,10)
  }

  async function open(requestId,onSaved){
    ensureModal()
    try{
      const [requestResult,occurrenceResult,reasons,legalBases,role]=await Promise.all([
        db.from('disciplinary_requests').select('id,employee_name,operation_id,penalty_type,reason_id,legal_basis_id,incident_date,issue_date,suspension_days,suspension_start_date,suspension_return_date,status,applied_date,document_signed_at,operations(cost_center,department)').eq('id',requestId).single(),
        db.from('request_occurrences').select('occurrence_date').eq('request_id',requestId).order('occurrence_date'),
        getReasons(),
        getLegalBases(),
        getEditorRole()
      ])
      if(requestResult.error)throw new Error(requestResult.error.message)
      if(occurrenceResult.error)throw new Error(occurrenceResult.error.message)
      const request=requestResult.data
      if(request.applied_date||request.status==='aplicado')return alert('Esta solicitação já foi aplicada e está bloqueada para alterações.')
      state.requestId=requestId;state.request=request;state.onSaved=onSaved
      state.dates=(occurrenceResult.data||[]).map(row=>row.occurrence_date)
      if(!state.dates.length)state.dates=parseLegacyDates(request.incident_date)
      const operation=normalizeRelation(request.operations)
      element('#requestEditorEmployee').textContent=request.employee_name||'—'
      element('#requestEditorOperation').textContent=operation?`${operation.cost_center||''} — ${operation.department||''}`:'—'
      element('#requestEditorStatus').textContent=request.status||'—'
      element('#requestEditorPenaltyType').value=request.penalty_type||'Advertência'
      element('#requestEditorReason').innerHTML='<option value="">Selecione...</option>'+reasons.map(reason=>`<option value="${reason.id}">${escapeHTML(reason.title)}</option>`).join('')
      element('#requestEditorReason').value=request.reason_id||''
      const canValidateLegal=['admin','onsite'].includes(role)
      element('#requestEditorLegalField').classList.toggle('hidden',!canValidateLegal)
      element('#requestEditorLegalBasis').required=canValidateLegal
      element('#requestEditorLegalBasis').innerHTML='<option value="">Selecione a alínea correta...</option>'+legalBases.map(basis=>`<option value="${basis.id}">${escapeHTML(String(basis.letter).toLowerCase())} — ${escapeHTML(basis.title)}</option>`).join('')
      element('#requestEditorLegalBasis').value=request.legal_basis_id||''
      element('#requestEditorIssueDate').value=request.issue_date||''
      element('#requestEditorSuspensionDays').value=String(request.suspension_days||1)
      element('#requestEditorSuspensionStart').value=request.suspension_start_date||''
      element('#requestEditorSuspensionReturn').value=request.suspension_return_date||''
      element('#requestEditorIncidentDate').value=''
      renderDates();toggleSuspension()
      modal.classList.remove('hidden')
    }catch(error){alert('Não foi possível abrir a solicitação: '+error.message)}
  }

  async function save(event){
    event.preventDefault()
    if(!state.dates.length)return alert('Adicione pelo menos uma data da ocorrência.')
    if(!element('#requestEditorReason').value)return alert('Selecione o motivo da medida.')
    if(!element('#requestEditorIssueDate').value)return alert('Informe a data de emissão.')
    const canValidateLegal=['admin','onsite'].includes(state.role)
    if(canValidateLegal&&!element('#requestEditorLegalBasis').value)return alert('Selecione a fundamentação legal correta do Art. 482 da CLT.')
    const isSuspension=element('#requestEditorPenaltyType').value==='Suspensão'
    const start=element('#requestEditorSuspensionStart').value,returnDate=element('#requestEditorSuspensionReturn').value
    if(isSuspension&&(!start||!returnDate))return alert('Preencha o início e o retorno da suspensão.')
    if(isSuspension&&returnDate<=start)return alert('A data de retorno deve ser posterior ao início da suspensão.')
    const button=element('#requestEditorSave'),originalText=button.textContent
    button.disabled=true;button.textContent='Salvando...'
    try{
      const {data,error}=await db.rpc('update_disciplinary_request',{
        target_request_id:state.requestId,
        new_penalty_type:element('#requestEditorPenaltyType').value,
        new_reason_id:element('#requestEditorReason').value,
        new_issue_date:element('#requestEditorIssueDate').value,
        new_occurrence_dates:state.dates.slice().sort(),
        new_suspension_days:isSuspension?Number(element('#requestEditorSuspensionDays').value):null,
        new_suspension_start_date:isSuspension?start:null,
        new_suspension_return_date:isSuspension?returnDate:null
      })
      if(error)throw new Error(error.message)
      let legalResult={updated:false,invalidated_documents:0}
      if(canValidateLegal){
        const legalSave=await db.rpc('set_disciplinary_legal_basis',{
          target_request_id:state.requestId,
          p_legal_basis_id:Number(element('#requestEditorLegalBasis').value)
        })
        if(legalSave.error)throw new Error(legalSave.error.message)
        legalResult=legalSave.data||legalResult
      }
      const invalidated=Number(data?.invalidated_documents||0)+Number(legalResult?.invalidated_documents||0)
      const hadSignedDocument=Boolean(state.request?.document_signed_at)
      const changed=data?.updated!==false||legalResult?.updated===true
      close()
      if(!changed)alert('Nenhuma alteração foi identificada.')
      else if(invalidated||hadSignedDocument)alert('Solicitação atualizada. O documento anterior foi invalidado e deverá ser assinado novamente.')
      else alert('Solicitação atualizada com sucesso.')
      if(typeof state.onSaved==='function')await state.onSaved()
    }catch(error){alert('Erro ao salvar: '+error.message+'\n\nConfirme se o SQL de fundamentação legal e edição das solicitações foi executado no Supabase.')}
    finally{button.disabled=false;button.textContent=originalText}
  }

  window.DisciplinaryRequestEditor={open,close}
})()
