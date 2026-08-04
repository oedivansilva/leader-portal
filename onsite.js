let ctx,signature='',pendingSuspension=null

signatureInput.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=async ev=>{signature=ev.target.result;signaturePreview.src=signature;signaturePreview.classList.remove('hidden');const {error}=await db.from('profiles').update({signature_url:signature}).eq('id',ctx.user.id);if(error)alert(error.message)};reader.readAsDataURL(file)})

onsiteEmployeeCpf.addEventListener('input',()=>{const digits=onsiteEmployeeCpf.value.replace(/\D/g,'').slice(0,11);onsiteEmployeeCpf.value=digits.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')})

async function loadRequests(){const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),operations(cost_center,department)').eq('assigned_onsite_id',ctx.user.id).order('created_at',{ascending:false});if(error)return alert(error.message);onsiteRequestRows.innerHTML=(data||[]).map(r=>`<tr><td>${escapeHTML(r.employee_name)}</td><td>${escapeHTML(r.operations?.cost_center)}<br><small>${escapeHTML(r.operations?.department)}</small></td><td>${escapeHTML(r.penalty_type)}${r.suspension_days?` (${r.suspension_days} dia(s))`:''}</td><td>${escapeHTML(r.penalty_reasons?.title)}</td><td><span class="badge ${r.status==='gerado'?'badge-green':'badge-blue'}">${escapeHTML(r.status)}</span></td><td>${r.status==='gerado'?'Documento baixado':`<button class="btn btn-success" onclick="prepareDocument('${r.id}')">${r.penalty_type.toLowerCase().includes('susp')?'Informar CPF e gerar':'Gerar PDF'}</button>`}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhuma solicitação atribuída.</td></tr>'}

async function fetchRequest(id){const {data,error}=await db.from('disciplinary_requests').select('*,penalty_reasons(*),operations(city_state)').eq('id',id).single();if(error){alert(error.message);return null}return data}

async function prepareDocument(id){if(!signature)return alert('Cadastre sua assinatura antes de gerar o documento.');const request=await fetchRequest(id);if(!request)return;if(request.penalty_type.toLowerCase().includes('susp')){pendingSuspension=request;suspensionRequestId.value=request.id;suspensionEmployeeName.value=request.employee_name;onsiteEmployeeCpf.value=request.employee_cpf||'';suspensionCpfCard.classList.remove('hidden');suspensionCpfCard.scrollIntoView({behavior:'smooth'});return}await generateAndFinish(request)}

function cancelSuspensionCpf(){pendingSuspension=null;suspensionCpfForm.reset();suspensionCpfCard.classList.add('hidden')}

suspensionCpfForm.addEventListener('submit',async e=>{e.preventDefault();if(!pendingSuspension)return;const cpf=onsiteEmployeeCpf.value.trim();if(cpf.replace(/\D/g,'').length!==11)return alert('Informe um CPF com 11 números.');const {error}=await db.from('disciplinary_requests').update({employee_cpf:cpf}).eq('id',pendingSuspension.id);if(error)return alert(error.message);pendingSuspension.employee_cpf=cpf;await generateAndFinish(pendingSuspension);cancelSuspensionCpf()})

async function generateAndFinish(request){await generateDisciplinaryPDF(request,signature);const {error}=await db.from('disciplinary_requests').update({status:'gerado'}).eq('id',request.id);if(error)return alert(error.message);loadRequests()}

getSessionContext('onsite').then(x=>{if(x){ctx=x;signature=x.profile.signature_url||'';if(signature){signaturePreview.src=signature;signaturePreview.classList.remove('hidden')}loadRequests()}})
