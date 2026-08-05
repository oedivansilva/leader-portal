let ctx,signature='',documentsByRequest={},driveDocumentsEnabled=true
function isMissingDocumentsTable(error){return error&&(error.code==='PGRST205'||/disciplinary_documents|schema cache|Could not find the table/i.test(error.message||''))}


function documentsForRequest(requestId){return documentsByRequest[requestId]||[]}
function activeDocument(requestId,kinds){return documentsForRequest(requestId).find(document=>document.active&&kinds.includes(document.document_kind))}
function documentActionButtons(document,label){
  if(!document)return ''
  return `<div class="document-actions"><button class="btn btn-light btn-small" onclick="viewDisciplinaryDocument('${document.id}')">Visualizar ${label}</button><button class="btn btn-light btn-small" onclick="downloadDisciplinaryDocument('${document.id}')">Baixar ${label}</button></div>`
}
function renderDocumentCell(request){
  if(!driveDocumentsEnabled){
    const label=['gerado','aplicado'].includes(request.status)?'Gerar PDF novamente':'Gerar PDF'
    return `<button class="btn btn-success" onclick="prepareDocument('${request.id}',this)">${label}</button><small class="document-hint">O arquivo será baixado neste dispositivo.</small>`
  }
  const original=activeDocument(request.id,['original'])
  const signed=activeDocument(request.id,['corrigido','assinado'])
  if(!original)return `<button class="btn btn-success" onclick="prepareDocument('${request.id}',this)">Gerar e salvar PDF</button><small class="document-hint">O arquivo será salvo automaticamente no Google Drive.</small>`
  return `<div class="document-cell">
    <div><span class="badge badge-blue">Original v${original.version_number}</span></div>
    ${documentActionButtons(original,'original')}
    <button class="btn btn-light btn-small" onclick="prepareDocument('${request.id}',this)">Gerar nova versão</button>
    <div class="document-divider"></div>
    ${signed?`<div><span class="badge badge-green">Assinado disponível</span></div>${documentActionButtons(signed,'assinado')}`:'<small class="muted">Documento assinado ainda não anexado.</small>'}
    <button class="btn btn-primary btn-small" onclick="uploadSignedDocument('${request.id}',this)">${signed?'Substituir assinado':'Anexar assinado'}</button>
  </div>`
}

async function loadRequests(){
  const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),operations(cost_center,department)').eq('assigned_onsite_id',ctx.user.id).order('created_at',{ascending:false})
  if(error)return alert(error.message)
  const rows=data||[],requestIds=rows.map(row=>row.id),leaderIds=[...new Set(rows.map(r=>r.leader_id).filter(Boolean))]
  let requesterNames={}
  if(leaderIds.length){
    const result=await db.from('profiles').select('id,full_name').in('id',leaderIds)
    if(!result.error)requesterNames=Object.fromEntries((result.data||[]).map(p=>[p.id,p.full_name]))
  }
  documentsByRequest={}
  if(requestIds.length&&driveDocumentsEnabled){
    const documentResult=await db.from('disciplinary_documents').select('*').in('request_id',requestIds).eq('active',true).order('created_at',{ascending:false})
    if(documentResult.error){
      driveDocumentsEnabled=false
      if(!isMissingDocumentsTable(documentResult.error))console.warn('Documentos online indisponíveis:',documentResult.error)
    }else{
      for(const document of documentResult.data||[])(documentsByRequest[document.request_id]??=[]).push(document)
    }
  }
  onsiteRequestRows.innerHTML=rows.map(r=>{
    const original=activeDocument(r.id,['original'])
    return `<tr>
      <td>${escapeHTML(r.employee_name)}<br><small class="muted">Solicitado por ${escapeHTML(requesterNames[r.leader_id]||'—')}</small></td>
      <td>${escapeHTML(r.operations?.cost_center)}<br><small>${escapeHTML(r.operations?.department)}</small></td>
      <td>${escapeHTML(r.penalty_type)}${r.suspension_days?` (${r.suspension_days} dia(s))`:''}</td>
      <td>${escapeHTML(r.penalty_reasons?.title)}</td>
      <td><span class="badge ${r.status==='aplicado'?'badge-green':'badge-blue'}">${escapeHTML(r.status)}</span></td>
      <td>${renderDocumentCell(r)}</td>
      <td>${r.applied_date?new Date(`${r.applied_date}T00:00:00`).toLocaleDateString('pt-BR'):(!driveDocumentsEnabled?r.status==='gerado':Boolean(original))?`<button class="btn btn-primary" onclick="confirmOnsiteApplication('${r.id}')">Confirmar</button>`:driveDocumentsEnabled?'Aguardando documento original':'Aguardando geração do PDF'}</td>
      <td>${r.applied_date||r.status==='aplicado'?'<span class="badge badge-green">Bloqueada</span>':`<button class="btn btn-light btn-small" onclick="editOnsiteRequest('${r.id}')">Editar</button>`}</td>
    </tr>`
  }).join('')||'<tr><td colspan="8" class="empty">Nenhuma solicitação atribuída.</td></tr>'
}

async function editOnsiteRequest(id){
  DisciplinaryRequestEditor.open(id,loadRequests)
}

async function confirmOnsiteApplication(id){
  const date=prompt('Data da aplicação (AAAA-MM-DD):',new Date().toISOString().slice(0,10))
  if(!date)return
  const {error}=await db.rpc('confirm_disciplinary_application',{target_request_id:id,target_date:date})
  if(error)return alert(error.message)
  alert('Aplicação confirmada.')
  loadRequests()
}

async function fetchRequest(id){
  const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),operations(city_state,cost_center,department),employees(registration)').eq('id',id).single()
  if(error){alert(error.message);return null}
  const employee=Array.isArray(data.employees)?data.employees[0]:data.employees
  data.employee_registration=employee?.registration||''
  return data
}

async function prepareDocument(id,button){
  if(!signature)return alert('Cadastre sua assinatura em Meu perfil antes de gerar o documento.')
  const alreadyExists=driveDocumentsEnabled&&Boolean(activeDocument(id,['original']))
  if(alreadyExists&&!confirm('Já existe um documento original salvo. Deseja gerar e armazenar uma nova versão?'))return
  const originalText=button?.textContent
  if(button){button.disabled=true;button.textContent='Gerando...'}
  try{
    const request=await fetchRequest(id)
    if(!request)return
    if(request.penalty_type.toLowerCase().includes('susp')){
      if(!request.employee_id)throw new Error('Esta solicitação não está associada a um colaborador cadastrado.')
      const {data:privateData,error}=await db.from('employee_private_data').select('cpf').eq('employee_id',request.employee_id).single()
      if(error||!privateData?.cpf)throw new Error('CPF não encontrado. Peça ao Admin para revisar o cadastro do colaborador.')
      request.employee_cpf=privateData.cpf
    }
    if(!driveDocumentsEnabled){
      await generateDisciplinaryPDF(request,signature,{kind:'ORIGINAL'})
      const {error}=await db.from('disciplinary_requests').update({status:'gerado'}).eq('id',request.id)
      if(error)throw error
      alert('PDF gerado e baixado com sucesso.')
    }else{
      const generated=await generateDisciplinaryPDF(request,signature,{download:false,kind:'ORIGINAL'})
      const result=await uploadDisciplinaryDocument(request.id,'original',generated.blob,generated.fileName)
      alert(`Documento salvo com sucesso.\n\n${result.folder_path}\n${result.file_name}`)
    }
    await loadRequests()
  }catch(error){alert(error.message)}
  finally{if(button){button.disabled=false;button.textContent=originalText}}
}

function uploadSignedDocument(requestId,button){
  const input=document.createElement('input')
  input.type='file';input.accept='application/pdf,.pdf'
  input.onchange=async()=>{
    const file=input.files?.[0]
    if(!file)return
    if(file.size>15*1024*1024)return alert('O PDF deve ter no máximo 15 MB.')
    const originalText=button?.textContent
    if(button){button.disabled=true;button.textContent='Enviando...'}
    try{
      const result=await uploadDisciplinaryDocument(requestId,'assinado',file,file.name)
      alert(`Documento assinado disponível para o líder.\n\n${result.folder_path}\n${result.file_name}`)
      await loadRequests()
    }catch(error){alert(error.message)}
    finally{if(button){button.disabled=false;button.textContent=originalText}}
  }
  input.click()
}

getSessionContext('onsite').then(x=>{
  if(x){
    ctx=x;signature=x.profile.signature_url||''
    loadRequests()
  }
})
