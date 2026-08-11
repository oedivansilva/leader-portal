let ctx,signature='',documentsByRequest={},driveDocumentsEnabled=true,rhRequests=[],requesterNames={}
function isMissingDocumentsTable(error){return error&&(error.code==='PGRST205'||/disciplinary_documents|schema cache|Could not find the table/i.test(error.message||''))}
function documentsForRequest(requestId){return documentsByRequest[requestId]||[]}
function legalBasisSummary(request){
  const basis=Array.isArray(request.disciplinary_legal_bases)?request.disciplinary_legal_bases[0]:request.disciplinary_legal_bases
  return basis?`Art. ${escapeHTML(basis.article||'482')}, alínea &quot;${escapeHTML(String(basis.letter||'').toLowerCase())}&quot; · ${escapeHTML(basis.title||'')}`:'⚠ Fundamentação legal pendente'
}
function activeDocument(requestId,kinds){return documentsForRequest(requestId).find(document=>document.active&&kinds.includes(document.document_kind))}
function documentActionButtons(document,label){if(!document)return '';return `<div class="document-actions"><button class="btn btn-light btn-small" onclick="viewDisciplinaryDocument('${document.id}')">Visualizar ${label}</button><button class="btn btn-light btn-small" onclick="downloadDisciplinaryDocument('${document.id}')">Baixar ${label}</button></div>`}
function renderDocumentCell(request){
  if(!driveDocumentsEnabled){
    if(request.document_signed_at)return `<div class="document-cell"><div><span class="badge badge-green">Assinado</span></div><div class="document-actions"><button class="btn btn-light btn-small" onclick="viewSignedDisciplinaryDocument('${request.id}')">Visualizar</button><button class="btn btn-primary btn-small" onclick="downloadSignedDisciplinaryDocument('${request.id}')">Baixar PDF</button></div><small class="muted">Assinado em ${new Date(request.document_signed_at).toLocaleString('pt-BR')}</small></div>`
    return `<button class="btn btn-success" onclick="prepareDocument('${request.id}',this)">Assinar e gerar PDF</button><small class="document-hint">O Admin/RH pode assinar sem usar um login Onsite separado.</small>`
  }
  const original=activeDocument(request.id,['original']),signed=activeDocument(request.id,['corrigido','assinado'])
  if(!original)return `<button class="btn btn-success" onclick="prepareDocument('${request.id}',this)">Gerar e salvar PDF</button><small class="document-hint">O arquivo será salvo automaticamente no Google Drive.</small>`
  return `<div class="document-cell"><div><span class="badge badge-blue">Original v${original.version_number}</span></div>${documentActionButtons(original,'original')}<button class="btn btn-light btn-small" onclick="prepareDocument('${request.id}',this)">Gerar nova versão</button><div class="document-divider"></div>${signed?`<div><span class="badge badge-green">Assinado disponível</span></div>${documentActionButtons(signed,'assinado')}`:'<small class="muted">Documento assinado ainda não anexado.</small>'}<button class="btn btn-primary btn-small" onclick="uploadSignedDocument('${request.id}',this)">${signed?'Substituir assinado':'Anexar assinado'}</button></div>`
}
async function loadRequests(){
  const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),disciplinary_legal_bases(*),operations(cost_center,department)').order('created_at',{ascending:false})
  if(error)return alert(error.message)
  rhRequests=data||[]
  const requestIds=rhRequests.map(row=>row.id),leaderIds=[...new Set(rhRequests.map(r=>r.leader_id).filter(Boolean))]
  requesterNames={}
  if(leaderIds.length){const result=await db.from('profiles').select('id,full_name').in('id',leaderIds);if(!result.error)requesterNames=Object.fromEntries((result.data||[]).map(p=>[p.id,p.full_name]))}
  documentsByRequest={}
  if(requestIds.length&&driveDocumentsEnabled){
    const documentResult=await db.from('disciplinary_documents').select('*').in('request_id',requestIds).eq('active',true).order('created_at',{ascending:false})
    if(documentResult.error){driveDocumentsEnabled=false;if(!isMissingDocumentsTable(documentResult.error))console.warn('Documentos online indisponíveis:',documentResult.error)}
    else for(const document of documentResult.data||[])(documentsByRequest[document.request_id]??=[]).push(document)
  }
  renderRequests()
}
function renderRequests(){
  const term=(document.getElementById('rhRequestSearch')?.value||'').trim().toLowerCase(),status=document.getElementById('rhRequestStatus')?.value||''
  const rows=rhRequests.filter(r=>(!status||r.status===status)&&(!term||`${r.employee_name} ${r.operations?.cost_center||''} ${r.operations?.department||''}`.toLowerCase().includes(term)))
  rhRequestRows.innerHTML=rows.map(r=>{const original=activeDocument(r.id,['original']);return `<tr><td>${escapeHTML(r.employee_name)}<br><small class="muted">Solicitado por ${escapeHTML(requesterNames[r.leader_id]||'—')}</small></td><td>${escapeHTML(r.operations?.cost_center||'—')}<br><small>${escapeHTML(r.operations?.department||'')}</small></td><td>${escapeHTML(r.penalty_type)}${r.suspension_days?` (${r.suspension_days} dia(s))`:''}</td><td>${escapeHTML(r.penalty_reasons?.title||'—')}<br><small class="muted">${legalBasisSummary(r)}</small></td><td><span class="badge ${r.status==='aplicado'?'badge-green':'badge-blue'}">${escapeHTML(r.status)}</span></td><td>${renderDocumentCell(r)}</td><td>${r.applied_date?new Date(`${r.applied_date}T00:00:00`).toLocaleDateString('pt-BR'):(!driveDocumentsEnabled?r.status==='gerado':Boolean(original))?`<button class="btn btn-primary" onclick="confirmRhApplication('${r.id}')">Confirmar</button>`:driveDocumentsEnabled?'Aguardando documento original':'Aguardando geração do PDF'}</td><td>${r.applied_date||r.status==='aplicado'?'<span class="badge badge-green">Bloqueada</span>':`<button class="btn btn-light btn-small" onclick="editRhRequest('${r.id}')">Editar</button>`}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Nenhuma solicitação encontrada.</td></tr>'
}
async function editRhRequest(id){DisciplinaryRequestEditor.open(id,loadRequests)}
async function confirmRhApplication(id){const date=prompt('Data da aplicação (AAAA-MM-DD):',new Date().toISOString().slice(0,10));if(!date)return;const {error}=await db.rpc('confirm_disciplinary_application',{target_request_id:id,target_date:date});if(error)return alert(error.message);alert('Aplicação confirmada.');loadRequests()}
async function fetchRequest(id){const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),disciplinary_legal_bases(*),operations(city_state,cost_center,department),employees(registration)').eq('id',id).single();if(error){alert(error.message);return null};const employee=Array.isArray(data.employees)?data.employees[0]:data.employees;data.employee_registration=employee?.registration||'';return data}
async function prepareDocument(id,button){
  if(!signature)return alert('Cadastre sua assinatura em Meu perfil antes de assinar o documento.')
  const alreadyExists=driveDocumentsEnabled&&Boolean(activeDocument(id,['original']))
  if(alreadyExists&&!confirm('Já existe um documento original salvo. Deseja gerar e armazenar uma nova versão?'))return
  const originalText=button?.textContent;if(button){button.disabled=true;button.textContent=driveDocumentsEnabled?'Gerando...':'Assinando...'}
  try{
    if(!driveDocumentsEnabled){const {error}=await db.rpc('sign_disciplinary_request',{target_request_id:id});if(error)throw new Error(error.message);await generateSignedDisciplinaryDocument(id,{download:true});alert('Documento assinado e liberado para o líder.')}
    else{
      const request=await fetchRequest(id);if(!request)return
      if(request.penalty_type.toLowerCase().includes('susp')){if(!request.employee_id)throw new Error('Esta solicitação não está associada a um colaborador cadastrado.');const {data:privateData,error}=await db.from('employee_private_data').select('cpf').eq('employee_id',request.employee_id).single();if(error||!privateData?.cpf)throw new Error('CPF não encontrado. Revise o cadastro do colaborador.');request.employee_cpf=privateData.cpf}
      const generated=await generateDisciplinaryPDF(request,signature,{download:false,kind:'ORIGINAL'})
      try{
        const result=await uploadDisciplinaryDocument(request.id,'original',generated.blob,generated.fileName)
        alert(`Documento salvo com sucesso.\n\n${result.folder_path}\n${result.file_name}`)
      }catch(uploadError){
        // Compatibilidade: se a Edge Function antiga ainda restringir o upload ao papel Onsite,
        // o Admin/RH não fica bloqueado. Assina pelo banco e gera o PDF sob demanda.
        console.warn('Google Drive indisponível para o Admin/RH; usando geração segura sob demanda.',uploadError)
        driveDocumentsEnabled=false
        const {error:signError}=await db.rpc('sign_disciplinary_request',{target_request_id:id})
        if(signError)throw new Error(signError.message)
        await generateSignedDisciplinaryDocument(id,{download:true})
        alert('Documento assinado e liberado para o líder. O Google Drive não aceitou este acesso, então o NEXO usou a geração segura sob demanda.')
      }
    }
    await loadRequests()
  }catch(error){alert(error.message)}finally{if(button){button.disabled=false;button.textContent=originalText}}
}
function uploadSignedDocument(requestId,button){const input=document.createElement('input');input.type='file';input.accept='application/pdf,.pdf';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>15*1024*1024)return alert('O PDF deve ter no máximo 15 MB.');const originalText=button?.textContent;if(button){button.disabled=true;button.textContent='Enviando...'};try{const result=await uploadDisciplinaryDocument(requestId,'assinado',file,file.name);alert(`Documento assinado disponível para o líder.\n\n${result.folder_path}\n${result.file_name}`);await loadRequests()}catch(error){alert(error.message)}finally{if(button){button.disabled=false;button.textContent=originalText}}};input.click()}

document.getElementById('rhRequestSearch')?.addEventListener('input',renderRequests)
document.getElementById('rhRequestStatus')?.addEventListener('change',renderRequests)
getSessionContext('admin').then(x=>{if(x&&requireModuleAccess(x.profile,'requests')){ctx=x;signature=x.profile.signature_url||'';renderPortalSidebar(portalSidebar,x.profile,'requests');loadRequests()}})
