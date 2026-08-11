let employeeImportData=[]
const importHeaders=['MAT','NOME','CPF','DATA_NASCIMENTO','DATA_ADMISSAO','DATA_DEMISSAO','CLIENTE','CENTRO_CUSTO','DEPARTAMENTO','HORARIO_CODIGO','HORARIO','TURNO_ESCALA','ESCALA_VIGENCIA','LIDER_EMAIL','CELULAR','EMAIL','STATUS','SEXO','VENCIMENTO_CONTRATO','PRORROGACAO_CONTRATO','BENEFICIOS','COLETE','LUVA','BOTA','TIPO_DESLIGAMENTO','MOTIVO_DESLIGAMENTO','ELEGIVEL_RECONTRATACAO']
const normalizeImport=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')
const cleanImport=value=>String(value??'').trim()
function importDate(value){if(value===null||value===undefined||value==='')return null;if(value instanceof Date&&!isNaN(value))return value.toISOString().slice(0,10);if(typeof value==='number'){const parsed=XLSX.SSF.parse_date_code(value);if(parsed)return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`}const text=cleanImport(value),br=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(br)return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;return 'INVALID'}
function importBoolean(value){const v=normalizeImport(value);if(!v)return null;if(['SIM','S','TRUE','1'].includes(v))return true;if(['NAO','N','FALSE','0'].includes(v))return false;return 'INVALID'}

async function waitForScheduleCatalog(timeout=6000){
  const start=Date.now()
  while(!window.NexoScheduleCatalog&&Date.now()-start<timeout) await new Promise(resolve=>setTimeout(resolve,80))
  if(window.NexoScheduleCatalog) await window.NexoScheduleCatalog.ready?.()
}

function downloadEmployeeTemplate(){
  const sample=[['000001','NOME COMPLETO','00000000000','31/12/1990','01/01/2025','','CLIENTE','HUB-XXX-01','Departamento / HUB','005','', '', '01/01/2025','lider@empresa.com.br','(91) 99999-9999','colaborador@empresa.com.br','ATIVO','FEMININO','31/10/2026','31/01/2027','VALE-TRANSPORTE; VALE-REFEIÇÃO','M','M','40','','','']]
  const instructions=[
    ['IMPORTAÇÃO DE COLABORADORES — NEXO'],
    ['Preencha a aba COLABORADORES sem alterar os títulos das colunas.'],
    ['MAT e CPF devem ser tratados como texto para preservar zeros à esquerda.'],
    ['Datas aceitas: DD/MM/AAAA ou AAAA-MM-DD.'],
    ['CENTRO_CUSTO deve existir na Estrutura do portal.'],
    ['HORARIO_CODIGO é a forma preferencial: use o código oficial da Shopee, por exemplo 005.'],
    ['HORARIO pode receber a descrição/nomenclatura que veio na sua planilha. O NEXO tentará reconhecer.'],
    ['TURNO_ESCALA foi mantido por compatibilidade com modelos antigos. Ele não é mais obrigatório.'],
    ['Se o horário estiver vazio ou não for reconhecido, o colaborador será importado e ficará em PENDÊNCIAS DE HORÁRIO.'],
    ['Sem horário confirmado, o colaborador não entra no denominador do ABS até a regularização.'],
    ['ESCALA_VIGENCIA é o primeiro dia em que o horário passa a valer; se vazia, será usada a admissão.'],
    ['LIDER_EMAIL é opcional. Em novos cadastros, deixe vazio para o colaborador entrar na carteira compartilhada do turno e ser resgatado por uma liderança elegível.'],
    ['Ao atualizar uma MAT existente, LIDER_EMAIL vazio mantém a liderança atual; não apaga a carteira já definida.'],
    ['Separe vários benefícios com ponto e vírgula (;).'],
    ['STATUS: ATIVO, AFASTADO ou DESLIGADO.'],
    ['SEXO: FEMININO, MASCULINO, OUTRO ou NÃO INFORMADO.'],
    ['Quando a MAT já existir, os dados serão atualizados. Horário não reconhecido vira pendência sem apagar a escala atual.']
  ]
  const ws=XLSX.utils.aoa_to_sheet([importHeaders]),example=XLSX.utils.aoa_to_sheet([importHeaders,...sample]),help=XLSX.utils.aoa_to_sheet(instructions)
  ws['!cols']=example['!cols']=importHeaders.map((h,i)=>({wch:[1,2,3,4,5,10,11,12,13,14,15,18,19,20,22,23,24,25].includes(i)?24:16}))
  help['!cols']=[{wch:115}]
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,help,'INSTRUCOES');XLSX.utils.book_append_sheet(wb,ws,'COLABORADORES');XLSX.utils.book_append_sheet(wb,example,'EXEMPLO');XLSX.writeFile(wb,'MODELO_IMPORTACAO_COLABORADORES.xlsx')
}

async function readEmployeeImport(){
  if(!employeeImportFile.files[0])return alert('Selecione uma planilha XLSX ou CSV.')
  employeeImportReadButton.disabled=true;employeeImportReadButton.textContent='Lendo...'
  try{
    await waitForScheduleCatalog()
    const buffer=await employeeImportFile.files[0].arrayBuffer(),book=XLSX.read(buffer,{type:'array',cellDates:true}),sheetName=book.SheetNames.find(x=>normalizeImport(x)==='COLABORADORES')||book.SheetNames[0],sheet=book.Sheets[sheetName],raw=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true})
    employeeImportData=raw.map((source,index)=>validateImportRow(source,index+2));renderEmployeeImport()
  }catch(error){alert(`Não foi possível ler o arquivo: ${error.message}`)}
  finally{employeeImportReadButton.disabled=false;employeeImportReadButton.textContent='Conferir arquivo'}
}

function validateImportRow(source,line){
  const row={};Object.entries(source).forEach(([key,value])=>row[normalizeImport(key)]=value)
  const errors=[],registration=cleanImport(row.MAT),name=cleanImport(row.NOME||row.NOME_COMPLETO),cpf=cleanImport(row.CPF).replace(/\D/g,''),admission=importDate(row.DATA_ADMISSAO),birth=importDate(row.DATA_NASCIMENTO),dismissal=importDate(row.DATA_DEMISSAO),contractEnd=importDate(row.VENCIMENTO_CONTRATO),extension=importDate(row.PRORROGACAO_CONTRATO),scaleEffectiveProvided=cleanImport(row.ESCALA_VIGENCIA)!=='',scaleEffective=importDate(row.ESCALA_VIGENCIA)||admission,cc=cleanImport(row.CENTRO_CUSTO),status=normalizeImport(row.STATUS||'ATIVO').toLowerCase(),sexText=normalizeImport(row.SEXO||'NAO INFORMADO'),sexMap={FEMININO:'Feminino',MASCULINO:'Masculino',OUTRO:'Outro',NAO_INFORMADO:'Não informado'},operationMatches=operations.filter(o=>normalizeImport(o.cost_center)===normalizeImport(cc)),department=cleanImport(row.DEPARTAMENTO),client=cleanImport(row.CLIENTE)
  let operation=operationMatches.find(o=>(!department||normalizeImport(o.department)===normalizeImport(department))&&(!client||normalizeImport(o.clients?.name)===normalizeImport(client)))||operationMatches[0]
  const leaderEmail=cleanImport(row.LIDER_EMAIL),leader=leaderEmail?profiles.find(p=>p.role==='leader'&&normalizeImport(p.email)===normalizeImport(leaderEmail)):null,benefitNames=cleanImport(row.BENEFICIOS).split(';').map(x=>x.trim()).filter(Boolean),benefitIds=[],missingBenefits=[],terminationType=normalizeImport(row.TIPO_DESLIGAMENTO).toLowerCase()||null
  benefitNames.forEach(name=>{const found=managementBenefits.find(b=>normalizeImport(b.name)===normalizeImport(name));found?benefitIds.push(found.id):missingBenefits.push(name)})
  const rehire=importBoolean(row.ELEGIVEL_RECONTRATACAO)
  const existing=managementEmployees.find(e=>cleanImport(e.registration)===registration)||null

  // Novo padrão: código > horário/descrição > campo legado.
  const scheduleRaw=cleanImport(row.HORARIO_CODIGO||row.CODIGO_HORARIO||row.HORARIO||row.NOMENCLATURA_JIRA||row.TURNO_ESCALA||row.ESCALA||row.TURNO)
  let scheduleResolution=window.NexoScheduleCatalog?.resolveImport?.(scheduleRaw)||{status:'missing',schedule:null,confidence:null,raw:scheduleRaw}
  let legacyScale=null
  if(scheduleResolution.status!=='matched'&&scheduleRaw){
    legacyScale=managementScales.find(s=>normalizeImport(s.description)===normalizeImport(scheduleRaw)||normalizeImport(s.name)===normalizeImport(scheduleRaw))||null
    if(legacyScale) scheduleResolution={status:'legacy',schedule:null,legacyScale,confidence:1,raw:scheduleRaw,reason:'Escala legada exata'}
  }

  if(normalizeImport(name)==='NOME_COMPLETO'&&/^0+$/.test(cpf))errors.push('linha de exemplo: não será importada')
  if(!registration)errors.push('MAT obrigatória');if(!name)errors.push('nome obrigatório');if(cpf.length!==11)errors.push('CPF deve ter 11 números');if(!admission||admission==='INVALID')errors.push('data de admissão inválida');if(!birth||birth==='INVALID')errors.push('data de nascimento inválida')
  if(dismissal==='INVALID'||contractEnd==='INVALID'||extension==='INVALID'||scaleEffective==='INVALID')errors.push('uma das datas está inválida')
  if(!operation)errors.push(`CC não encontrado: ${cc||'vazio'}`);if(leaderEmail&&!leader)errors.push(`líder não encontrado: ${leaderEmail}`);if(!['ativo','afastado','desligado'].includes(status))errors.push('status inválido');if(!sexMap[sexText])errors.push('sexo inválido');if(missingBenefits.length)errors.push(`benefício(s) não encontrado(s): ${missingBenefits.join(', ')}`);if(terminationType&&!['voluntario','involuntario','termino_contrato'].includes(terminationType))errors.push('tipo de desligamento inválido');if(rehire==='INVALID')errors.push('elegível para recontratação inválido')

  const schedulePending=scheduleResolution.status==='suggested'||scheduleResolution.status==='missing'
  return {line,registration,name,cpf,birth,admission,dismissal,operation,leader,benefitIds,status,sex:sexMap[sexText],phone:cleanImport(row.CELULAR)||null,email:cleanImport(row.EMAIL)||null,contractEnd,extension,vest:cleanImport(row.COLETE)||null,glove:cleanImport(row.LUVA)||null,boot:cleanImport(row.BOTA)||null,terminationType,terminationReason:cleanImport(row.MOTIVO_DESLIGAMENTO)||null,rehire,scaleEffective,scaleEffectiveProvided,scheduleRaw,scheduleResolution,schedulePending,existing,errors,state:errors.length?'invalid':'valid'}
}

function scheduleImportLabel(x){
  const r=x.scheduleResolution||{}
  if(r.status==='matched')return `<strong>${escapeHTML(window.NexoScheduleCatalog?.scheduleLabel?.(r.schedule)||r.schedule?.source_code||'Horário reconhecido')}</strong><br><small class="schedule-import-ok">Reconhecido por ${escapeHTML(r.reason||'catálogo')}</small>`
  if(r.status==='legacy')return `<strong>${escapeHTML(r.legacyScale?.description||r.legacyScale?.name||'Escala')}</strong><br><small>Escala legada</small>`
  if(r.status==='suggested')return `<strong>⚠ Sugestão: ${escapeHTML(window.NexoScheduleCatalog?.scheduleLabel?.(r.schedule)||'')}</strong><br><small>${Math.round((r.confidence||0)*100)}% semelhante · será importado como pendente</small>`
  if(!x.scheduleRaw&&x.existing?.scale_id)return `<span class="muted">Mantém o horário já cadastrado</span>`
  return `<strong>⚠ Horário pendente</strong><br><small>${escapeHTML(x.scheduleRaw||'Nenhum horário informado')}</small>`
}

function renderEmployeeImport(){
  const valid=employeeImportData.filter(x=>x.state==='valid').length,invalid=employeeImportData.filter(x=>x.state==='invalid'||x.state==='failed').length,pendingCount=employeeImportData.filter(x=>x.state==='valid'&&x.schedulePending&&!(x.existing?.scale_id&&!x.scheduleRaw)).length
  const label=x=>x.state==='valid'?(x.schedulePending?'Pronto · horário será resolvido depois':'Pronto para importar'):x.state==='imported'?'Importado com sucesso':x.state==='imported_pending'?'Importado · horário pendente':x.state==='importing'?'Importando...':x.errors.join('; ')
  const badge=x=>x.state==='valid'&&!x.schedulePending||x.state==='imported'?'badge-green':x.state==='valid'||x.state==='imported_pending'?'badge-yellow':'badge-yellow'
  importTotal.textContent=employeeImportData.length;importValid.textContent=valid;importInvalid.textContent=invalid
  employeeImportRows.innerHTML=employeeImportData.map(x=>`<tr><td>${x.line}</td><td>${escapeHTML(x.registration||'—')}</td><td>${escapeHTML(x.name||'—')}</td><td>${escapeHTML(x.operation?.cost_center||'—')}</td><td>${scheduleImportLabel(x)}</td><td><span class="badge ${badge(x)}">${escapeHTML(label(x))}</span></td></tr>`).join('')||'<tr><td colspan="6" class="empty">A planilha não contém dados.</td></tr>'
  employeeImportButton.disabled=!valid;employeeImportPreview.classList.remove('hidden')
  let note=document.getElementById('employeeImportScheduleNote')
  if(!note){note=document.createElement('div');note.id='employeeImportScheduleNote';note.className='notice schedule-note';employeeImportRows.closest('.table-wrap')?.insertAdjacentElement('beforebegin',note)}
  note.innerHTML=pendingCount?`<strong>${pendingCount} colaborador(es)</strong> serão importados com horário pendente. Isso não bloqueia a importação; depois você aprova as sugestões em “Pendências de horário”.`:'Todos os horários informados foram reconhecidos ou serão mantidos a partir do cadastro atual.'
}

async function importEmployees(){
  const valid=employeeImportData.filter(x=>x.state==='valid')
  if(!valid.length)return alert('Não há linhas válidas para importar.')
  if(!confirm(`Importar ${valid.length} colaborador(es)? A MAT existente será atualizada. Horários não reconhecidos ficarão pendentes.`))return
  employeeImportButton.disabled=true;let success=0,failed=0,pendingImported=0
  for(const item of valid){
    item.state='importing'
    try{
      const resolution=item.scheduleResolution||{}
      const catalogMatched=resolution.status==='matched'&&resolution.schedule?.work_scale_id
      const legacyMatched=resolution.status==='legacy'&&resolution.legacyScale?.id
      const matchedScaleId=catalogMatched?resolution.schedule.work_scale_id:legacyMatched?resolution.legacyScale.id:null
      const matchedCatalogId=catalogMatched?resolution.schedule.id:null
      const unresolved=item.schedulePending

      const leaderId=item.leader?.id||(item.existing?.leader_id||null)
      const payload={registration:item.registration,full_name:item.name,operation_id:item.operation.id,leader_id:leaderId,shift_id:null,sex:item.sex,admission_date:item.admission,dismissal_date:item.dismissal,status:item.dismissal?'desligado':item.status,contract_end_date:item.contractEnd,contract_extension_date:item.extension,phone:item.phone,email:item.email,vest_size:item.vest,glove_size:item.glove,boot_size:item.boot,termination_type:item.terminationType,termination_reason:item.terminationReason,eligible_for_rehire:item.rehire==='INVALID'?null:item.rehire,updated_at:new Date().toISOString()}
      if(matchedScaleId){payload.scale_id=matchedScaleId;payload.schedule_catalog_id=matchedCatalogId}
      else if(!item.existing){payload.scale_id=null;payload.schedule_catalog_id=null}
      // Em cadastro existente, horário ausente/não reconhecido NÃO apaga a escala atual.

      let existing=item.existing,employeeId
      if(existing){const saved=await db.from('employees').update(payload).eq('id',existing.id);if(saved.error)throw saved.error;employeeId=existing.id}
      else{const saved=await db.from('employees').insert(payload).select('id').single();if(saved.error)throw saved.error;employeeId=saved.data.id}

      if(matchedScaleId&&(!existing||existing.scale_id!==matchedScaleId||item.scaleEffectiveProvided)){
        const scaleSaved=await db.rpc('admin_set_employee_scale',{target_employee_id:employeeId,target_scale_id:matchedScaleId,start_date:item.scaleEffective})
        if(scaleSaved.error)throw scaleSaved.error
      }

      const privateSaved=await db.from('employee_private_data').upsert({employee_id:employeeId,cpf:item.cpf,birth_date:item.birth});if(privateSaved.error)throw privateSaved.error
      const removed=await db.from('employee_benefits').delete().eq('employee_id',employeeId);if(removed.error)throw removed.error
      if(item.benefitIds.length){const linked=await db.from('employee_benefits').insert(item.benefitIds.map(benefit_id=>({employee_id:employeeId,benefit_id})));if(linked.error)throw linked.error}

      if(matchedScaleId){await window.NexoScheduleCatalog?.clearPending?.(employeeId);item.state='imported'}
      else if(unresolved&&!(existing?.scale_id&&!item.scheduleRaw)){
        await window.NexoScheduleCatalog?.createPending?.(employeeId,item.scheduleRaw,resolution.schedule?.id||null,resolution.confidence??null,item.scaleEffective)
        item.state='imported_pending';pendingImported++
      }else item.state='imported'
      success++
    }catch(error){item.state='failed';item.errors=[error.message||String(error)];failed++}
  }
  renderEmployeeImport();await loadManagement();await loadDashboard();await loadWorkforce();await window.NexoScheduleCatalog?.loadPending?.()
  alert(`Importação concluída.\nSucesso: ${success}\nHorário pendente: ${pendingImported}\nFalhas: ${failed}`);employeeImportButton.disabled=false
}
