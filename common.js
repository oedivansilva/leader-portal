const cfg = window.PORTAL_CONFIG
window.db = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)

window.escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
window.formatDate = value => value ? value.split('-').reverse().join('/') : '-'
window.roleLabel = role => ({admin:'Administrador',leader:'Líder / Gestor',onsite:'Equipe Onsite',employee:'Colaborador'}[role] || role)

window.NEXO_MODULES = [
  { key: 'overview', label: 'Visão geral', group: 'GESTÃO OPERACIONAL' },
  { key: 'employees', label: 'Colaboradores', group: 'GESTÃO OPERACIONAL' },
  { key: 'requests', label: 'Solicitações', group: 'GESTÃO OPERACIONAL' },
  { key: 'presence', label: 'Controle de Presença', group: 'GESTÃO OPERACIONAL' },
  { key: 'turnover', label: 'Turnover', group: 'GESTÃO OPERACIONAL' },
  { key: 'management', label: 'Escalas e benefícios', group: 'GESTÃO OPERACIONAL' },
  { key: 'mood', label: 'Humor', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'climate', label: 'Pesquisa de Clima', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'performance', label: 'Avaliação de Desempenho', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'pdi', label: 'PDI', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'people_analytics', label: 'People Analytics', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'structure', label: 'Estrutura', group: 'ADMINISTRAÇÃO' },
  { key: 'users', label: 'Usuários', group: 'ADMINISTRAÇÃO' },
  { key: 'audit', label: 'Auditoria', group: 'ADMINISTRAÇÃO' }
]

window.defaultMenuPermissions = function(role){
  if(role === 'admin') return NEXO_MODULES.map(module => module.key)
  if(role === 'leader') return ['requests','presence']
  if(role === 'onsite') return ['requests']
  if(role === 'employee') return ['mood','climate','performance','pdi']
  return []
}

window.profileMenuPermissions = function(profile){
  if(profile?.role === 'admin') return defaultMenuPermissions('admin')
  return Array.isArray(profile?.menu_permissions) ? profile.menu_permissions : defaultMenuPermissions(profile?.role)
}

window.hasModuleAccess = function(profile,moduleKey){
  return profile?.role === 'admin' || profileMenuPermissions(profile).includes(moduleKey)
}

window.moduleUrlForProfile = function(profile,moduleKey){
  const peopleModules = ['mood','climate','performance','pdi','people_analytics']
  if(peopleModules.includes(moduleKey)) {
    return profile?.role === 'employee'
      ? `people.html?module=${encodeURIComponent(moduleKey)}`
      : `people-admin.html?module=${encodeURIComponent(moduleKey)}`
  }
  if(profile?.role === 'employee') return `people.html?module=mood`
  if(profile?.role === 'admin') return `admin.html?module=${encodeURIComponent(moduleKey)}`
  if(moduleKey === 'requests') return profile?.role === 'leader' ? 'leader.html' : 'onsite.html'
  if(moduleKey === 'presence' && profile?.role === 'leader') return 'presence.html'
  return `workspace.html?module=${encodeURIComponent(moduleKey)}`
}

window.firstAllowedModuleUrl = function(profile){
  if(profile?.role === 'admin') return 'admin.html'
  if(profile?.role === 'employee') return 'people.html?module=mood'
  const first = NEXO_MODULES.find(module => hasModuleAccess(profile,module.key))
  return first ? moduleUrlForProfile(profile,first.key) : 'profile.html'
}

window.renderPortalSidebar = function(sidebar,profile,currentModule=''){
  if(!sidebar || !profile) return
  const title = profile.role === 'admin' ? 'NEXO' : profile.role === 'leader' ? 'Liderança' : profile.role === 'onsite' ? 'Equipe Onsite' : 'Meu NEXO'
  const permissions = profileMenuPermissions(profile)
  const visible = NEXO_MODULES.filter(module => profile.role === 'admin' || permissions.includes(module.key))
  let currentGroup = null
  const links = visible.map(module => {
    const group = module.group !== currentGroup ? `<div class="nav-title">${escapeHTML(module.group)}</div>` : ''
    currentGroup = module.group
    return `${group}<a class="nav-btn ${currentModule===module.key?'active':''}" href="${moduleUrlForProfile(profile,module.key)}">${escapeHTML(module.label)}</a>`
  }).join('')
  sidebar.innerHTML = `<div class="nav-title">${title}</div>${links}<div class="nav-title">CONTA</div><a class="nav-btn ${currentModule==='profile'?'active':''}" href="profile.html">Meu perfil</a>`
}

window.requireModuleAccess = function(profile,moduleKey){
  if(hasModuleAccess(profile,moduleKey)) return true
  location.replace(firstAllowedModuleUrl(profile))
  return false
}


window.getSessionContext = async function(requiredRole) {
  const { data: { user } } = await db.auth.getUser()
  if (!user) { location.replace('index.html'); return null }
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', user.id).single()
  if (error || !profile || !profile.active) { await db.auth.signOut(); location.replace('index.html'); return null }
  if (profile.must_change_password) { location.replace('index.html?change-password=1'); return null }
  if (requiredRole && profile.role !== requiredRole) {
    location.replace(firstAllowedModuleUrl(profile)); return null
  }
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = profile.full_name || user.email.split('@')[0])
  document.querySelectorAll('[data-user-role]').forEach(el => el.textContent = roleLabel(profile.role))
  return { user, profile }
}

window.logout = async function(){ await db.auth.signOut(); location.replace('index.html') }
window.toggleSidebar = function(){ document.querySelector('.sidebar')?.classList.toggle('open') }
window.showPage = function(id, button){
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === id))
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'))
  button?.classList.add('active'); document.querySelector('.sidebar')?.classList.remove('open')
}
window.functionError = async function(error){
  let message = error?.message || 'Erro inesperado.'
  try { const body = await error.context.json(); message = body.error || message } catch (_) {}
  return message
}

window.portalFunctionRequest=async function(functionName,{body,contentType,expectBlob=false}={}){
  const {data:{session}}=await db.auth.getSession()
  if(!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente no portal.')
  const headers={Authorization:`Bearer ${session.access_token}`,apikey:cfg.supabaseAnonKey}
  if(contentType)headers['Content-Type']=contentType
  const response=await fetch(`${cfg.supabaseUrl}/functions/v1/${functionName}`,{method:'POST',headers,body})
  if(expectBlob){
    if(!response.ok){let message='Não foi possível acessar o documento.';try{const error=await response.json();message=error.error||message}catch(_){ }throw new Error(message)}
    return {blob:await response.blob(),fileName:getResponseFileName(response.headers.get('Content-Disposition'))}
  }
  let data={}
  try{data=await response.json()}catch(_){ }
  if(!response.ok)throw new Error(data.error||'A Edge Function retornou um erro.')
  return data
}

window.uploadDisciplinaryDocument=async function(requestId,documentKind,fileOrBlob,fileName='documento.pdf'){
  const form=new FormData()
  form.append('request_id',requestId)
  form.append('document_kind',documentKind)
  const file=fileOrBlob instanceof File?fileOrBlob:new File([fileOrBlob],fileName,{type:'application/pdf'})
  form.append('file',file)
  return portalFunctionRequest('drive-upload-document',{body:form})
}

function getResponseFileName(disposition){
  if(!disposition)return 'documento.pdf'
  const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if(encoded){try{return decodeURIComponent(encoded[1])}catch(_){ }}
  const simple=disposition.match(/filename="?([^";]+)"?/i)
  return simple?.[1]||'documento.pdf'
}

window.getDisciplinaryDocumentBlob=async function(documentId,disposition='attachment'){
  return portalFunctionRequest('drive-download-document',{
    body:JSON.stringify({document_id:documentId,disposition}),contentType:'application/json',expectBlob:true
  })
}

window.viewDisciplinaryDocument=async function(documentId){
  const preview=window.open('about:blank','_blank')
  try{
    const {blob}=await getDisciplinaryDocumentBlob(documentId,'inline')
    const url=URL.createObjectURL(blob)
    if(preview)preview.location.href=url;else window.open(url,'_blank')
    setTimeout(()=>URL.revokeObjectURL(url),120000)
  }catch(error){
    preview?.close()
    alert(error.message)
  }
}

window.downloadDisciplinaryDocument=async function(documentId,fallbackName='documento.pdf'){
  try{
    const {blob,fileName}=await getDisciplinaryDocumentBlob(documentId,'attachment')
    const url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=fileName||fallbackName;document.body.appendChild(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),30000)
  }catch(error){alert(error.message)}
}

// Documento assinado gerado sob demanda. O PDF não é armazenado: os dados e a
// assinatura registrada no momento da geração são recuperados com segurança.
window.getSignedDisciplinaryDocumentPayload=async function(requestId){
  const {data,error}=await db.rpc('get_signed_disciplinary_document_payload',{target_request_id:requestId})
  if(error)throw new Error(error.message)
  if(!data?.request||!data?.signature)throw new Error('O documento assinado ainda não está disponível.')
  return data
}

window.generateSignedDisciplinaryDocument=async function(requestId,{download=true}={}){
  if(typeof generateDisciplinaryPDF!=='function')throw new Error('O gerador de PDF não foi carregado nesta página.')
  const payload=await getSignedDisciplinaryDocumentPayload(requestId)
  return generateDisciplinaryPDF(payload.request,payload.signature,{download,kind:'ASSINADO'})
}

window.downloadSignedDisciplinaryDocument=async function(requestId){
  try{
    await generateSignedDisciplinaryDocument(requestId,{download:true})
  }catch(error){alert(error.message)}
}

window.viewSignedDisciplinaryDocument=async function(requestId){
  const preview=window.open('about:blank','_blank')
  try{
    const generated=await generateSignedDisciplinaryDocument(requestId,{download:false})
    const url=URL.createObjectURL(generated.blob)
    if(preview)preview.location.href=url;else window.open(url,'_blank')
    setTimeout(()=>URL.revokeObjectURL(url),120000)
  }catch(error){preview?.close();alert(error.message)}
}
