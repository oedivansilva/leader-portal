const cfg = window.PORTAL_CONFIG
window.db = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)

window.escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
window.formatDate = value => value ? value.split('-').reverse().join('/') : '-'
window.roleLabel = role => ({admin:'Administrador',leader:'Líder / Gestor',onsite:'Equipe Onsite',employee:'Colaborador'}[role] || role)


// ================================================================
// LAYOUT GLOBAL NEXO
// Mantém o cabeçalho e a barra lateral visíveis em TODOS os módulos.
// A sidebar possui rolagem própria quando o menu ultrapassa a tela.
// ================================================================
window.installNexoGlobalLayout = function(){
  if (document.getElementById('nexo-global-layout-style')) return

  const style = document.createElement('style')
  style.id = 'nexo-global-layout-style'
  style.textContent = `
    :root { --nexo-header-height: 78px; }

    html, body { min-height: 100%; }
    body { margin: 0; overflow-x: hidden; }

    .topbar {
      position: sticky !important;
      top: 0 !important;
      z-index: 1100 !important;
      background: #fff;
    }

    .app {
      display: grid !important;
      grid-template-columns: 250px minmax(0, 1fr) !important;
      align-items: start !important;
      min-height: calc(100vh - var(--nexo-header-height));
    }

    .sidebar {
      position: sticky !important;
      top: var(--nexo-header-height) !important;
      align-self: start !important;
      width: 250px !important;
      min-width: 250px !important;
      max-width: 250px !important;
      height: calc(100vh - var(--nexo-header-height)) !important;
      max-height: calc(100vh - var(--nexo-header-height)) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: #d4d4da transparent;
    }

    .sidebar::-webkit-scrollbar { width: 7px; }
    .sidebar::-webkit-scrollbar-track { background: transparent; }
    .sidebar::-webkit-scrollbar-thumb {
      background: #d4d4da;
      border-radius: 999px;
    }
    .sidebar::-webkit-scrollbar-thumb:hover { background: #bfc0c7; }

    .main {
      flex: 1;
      min-width: 0;
    }

    @media (max-width: 900px) {
      .app {
        grid-template-columns: 1fr !important;
      }

      .sidebar {
        width: 260px !important;
        min-width: 260px !important;
        max-width: 260px !important;
        position: fixed !important;
        top: var(--nexo-header-height) !important;
        left: 0 !important;
        z-index: 1200 !important;
        height: calc(100vh - var(--nexo-header-height)) !important;
        max-height: calc(100vh - var(--nexo-header-height)) !important;
        transform: translateX(-105%);
        transition: transform .22s ease;
        box-shadow: 12px 0 30px rgba(15, 23, 42, .12);
      }

      .sidebar.open { transform: translateX(0); }
    }
  `
  document.head.appendChild(style)

  const syncHeaderHeight = () => {
    const header = document.querySelector('.topbar')
    if (!header) return
    const height = Math.ceil(header.getBoundingClientRect().height || 78)
    document.documentElement.style.setProperty('--nexo-header-height', `${height}px`)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncHeaderHeight, { once: true })
  } else {
    syncHeaderHeight()
  }
  window.addEventListener('resize', syncHeaderHeight)
}

installNexoGlobalLayout()

// ================================================================
// GRÁFICOS NEXO — valores sempre visíveis
// Aplica automaticamente quantidades em pizza/donut, barras e linhas.
// Não depende de plugin externo.
// ================================================================
window.installNexoChartValueLabels = function(){
  if (!window.Chart) return
  if (Chart.registry?.plugins?.get?.('nexoValueLabels')) return

  const formatNumber = value => {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value ?? '')
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 0,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 1
    })
  }

  const roundRect = (ctx, x, y, width, height, radius = 7) => {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
  }

  const valueLabelsPlugin = {
    id: 'nexoValueLabels',
    afterDatasetsDraw(chart, _args, options = {}) {
      if (options.display === false) return
      const { ctx, chartArea } = chart
      if (!chartArea) return

      const type = chart.config.type
      const isCircular = ['pie', 'doughnut', 'polarArea'].includes(type)
      const isBar = type === 'bar'
      const isLine = type === 'line'
      if (!isCircular && !isBar && !isLine) return

      ctx.save()
      ctx.font = options.font || "700 11px Poppins, 'Segoe UI', Arial, sans-serif"
      ctx.textBaseline = 'middle'

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex)
        if (!meta || meta.hidden) return

        meta.data.forEach((element, dataIndex) => {
          const parsed = meta.controller?.getParsed?.(dataIndex)
          let rawValue

          if (isCircular) rawValue = dataset.data?.[dataIndex]
          else if (isBar && chart.options?.indexAxis === 'y') rawValue = parsed?.x ?? dataset.data?.[dataIndex]
          else rawValue = parsed?.y ?? dataset.data?.[dataIndex]

          if (rawValue && typeof rawValue === 'object') {
            rawValue = rawValue.y ?? rawValue.x
          }

          const numeric = Number(rawValue)
          if (!Number.isFinite(numeric)) return
          if (numeric === 0 && options.hideZero !== false) return

          const context = { chart, dataset, datasetIndex, dataIndex, raw: rawValue }
          const text = typeof options.formatter === 'function'
            ? String(options.formatter(rawValue, context) ?? '')
            : `${formatNumber(numeric)}${options.suffix || ''}`
          if (!text) return

          const textWidth = ctx.measureText(text).width
          const textHeight = 18

          if (isCircular) {
            const props = element.getProps(
              ['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'],
              true
            )
            const angle = (props.startAngle + props.endAngle) / 2
            const arcSize = Math.abs(props.endAngle - props.startAngle)
            const ringWidth = Math.max(0, props.outerRadius - props.innerRadius)
            const canFitInside = arcSize >= 0.42 && ringWidth >= 20

            let x
            let y
            if (canFitInside) {
              const radius = props.innerRadius + ringWidth * 0.68
              x = props.x + Math.cos(angle) * radius
              y = props.y + Math.sin(angle) * radius
              ctx.textAlign = 'center'
              ctx.fillStyle = '#FFFFFF'
              ctx.shadowColor = 'rgba(0,0,0,.20)'
              ctx.shadowBlur = 3
              ctx.fillText(text, x, y)
              ctx.shadowBlur = 0
            } else {
              const radius = props.outerRadius + 13
              x = props.x + Math.cos(angle) * radius
              y = props.y + Math.sin(angle) * radius
              x = Math.max(chartArea.left + textWidth / 2 + 5, Math.min(x, chartArea.right - textWidth / 2 - 5))
              y = Math.max(chartArea.top + textHeight / 2 + 4, Math.min(y, chartArea.bottom - textHeight / 2 - 4))

              ctx.textAlign = 'center'
              ctx.fillStyle = 'rgba(255,255,255,.96)'
              roundRect(ctx, x - textWidth / 2 - 6, y - textHeight / 2, textWidth + 12, textHeight, 8)
              ctx.fill()
              ctx.strokeStyle = 'rgba(31,41,55,.10)'
              ctx.lineWidth = 1
              ctx.stroke()
              ctx.fillStyle = '#1F2937'
              ctx.fillText(text, x, y)
            }
            return
          }

          if (isBar) {
            const props = element.getProps(['x', 'y', 'base', 'width', 'height'], true)
            const horizontal = chart.options?.indexAxis === 'y'

            if (horizontal) {
              const positive = numeric >= 0
              let x = props.x + (positive ? 8 : -8)
              const y = props.y
              let inside = false

              if (positive && x + textWidth > chartArea.right - 5) {
                x = props.x - 8
                inside = true
                ctx.textAlign = 'right'
              } else if (!positive && x - textWidth < chartArea.left + 5) {
                x = props.x + 8
                inside = true
                ctx.textAlign = 'left'
              } else {
                ctx.textAlign = positive ? 'left' : 'right'
              }

              ctx.fillStyle = inside ? '#FFFFFF' : '#1F2937'
              if (inside) {
                ctx.shadowColor = 'rgba(0,0,0,.18)'
                ctx.shadowBlur = 2
              }
              ctx.fillText(text, x, y)
              ctx.shadowBlur = 0
              return
            }

            const positive = numeric >= 0
            let x = props.x
            let y = props.y + (positive ? -10 : 10)
            let inside = false
            ctx.textAlign = 'center'

            if (positive && y - 8 < chartArea.top) {
              y = props.y + 12
              inside = true
            } else if (!positive && y + 8 > chartArea.bottom) {
              y = props.y - 12
              inside = true
            }

            y = Math.max(chartArea.top + 9, Math.min(y, chartArea.bottom - 9))
            ctx.fillStyle = inside ? '#FFFFFF' : '#1F2937'
            if (inside) {
              ctx.shadowColor = 'rgba(0,0,0,.18)'
              ctx.shadowBlur = 2
            }
            ctx.fillText(text, x, y)
            ctx.shadowBlur = 0
            return
          }

          // Linha: valor próximo do ponto, sem esconder a série.
          const pos = element.getProps(['x', 'y'], true)
          let x = Math.max(chartArea.left + textWidth / 2 + 4, Math.min(pos.x, chartArea.right - textWidth / 2 - 4))
          let y = Math.max(chartArea.top + 10, pos.y - 12)
          ctx.textAlign = 'center'
          ctx.fillStyle = 'rgba(255,255,255,.94)'
          roundRect(ctx, x - textWidth / 2 - 5, y - 9, textWidth + 10, 18, 7)
          ctx.fill()
          ctx.fillStyle = '#1F2937'
          ctx.fillText(text, x, y)
        })
      })
      ctx.restore()
    }
  }

  const centerPlugin = {
    id: 'nexoDoughnutCenter',
    afterDraw(chart, _args, options = {}) {
      if (options.display !== true || chart.config.type !== 'doughnut') return
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return

      const values = chart.data.datasets?.[0]?.data || []
      const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0)
      const first = meta.data[0]
      const props = first.getProps(['x', 'y'], true)
      const ctx = chart.ctx
      const formatted = typeof options.formatter === 'function'
        ? options.formatter(total, chart)
        : `${formatNumber(total)}${options.suffix || ''}`

      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#7B7F88'
      ctx.font = "600 10px Poppins, 'Segoe UI', Arial, sans-serif"
      ctx.fillText(options.label || 'Total', props.x, props.y - 8)
      ctx.fillStyle = '#1F2937'
      ctx.font = "800 17px Poppins, 'Segoe UI', Arial, sans-serif"
      ctx.fillText(String(formatted), props.x, props.y + 10)
      ctx.restore()
    }
  }

  Chart.register(valueLabelsPlugin, centerPlugin)

  // Padrão global: qualquer Chart.js do NEXO já nasce com valor visível.
  Chart.defaults.plugins.nexoValueLabels = { display: true, hideZero: true }
  Chart.defaults.plugins.nexoDoughnutCenter = { display: false }
}

installNexoChartValueLabels()

window.NEXO_MODULES = [
  { key: 'overview', label: 'Visão geral', group: 'GESTÃO OPERACIONAL' },
  { key: 'employees', label: 'Colaboradores', group: 'GESTÃO OPERACIONAL' },
  { key: 'my_team', label: 'Minha Equipe', group: 'GESTÃO OPERACIONAL', roles: ['leader'] },
  { key: 'requests', label: 'Solicitações', group: 'GESTÃO OPERACIONAL' },
  { key: 'presence', label: 'Controle de Presença', group: 'GESTÃO OPERACIONAL' },
  { key: 'turnover', label: 'Turnover', group: 'GESTÃO OPERACIONAL' },
  { key: 'schedules', label: 'Horários', group: 'GESTÃO OPERACIONAL', roles: ['admin'] },
  { key: 'mood', label: 'Humor', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'climate', label: 'Pesquisa de Clima', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'new_hires', label: 'Acompanhamento Inicial', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'performance', label: 'Avaliação de Desempenho', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'pdi', label: 'PDI', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'people_analytics', label: 'People Analytics', group: 'PESSOAS & DESENVOLVIMENTO' },
  { key: 'structure', label: 'Estrutura', group: 'ADMINISTRAÇÃO', roles: ['admin'] },
  { key: 'users', label: 'Usuários', group: 'ADMINISTRAÇÃO', roles: ['admin'] },
  { key: 'audit', label: 'Auditoria', group: 'ADMINISTRAÇÃO', roles: ['admin'] }
]

window.moduleAvailableForRole = function(moduleOrKey, role){
  const module = typeof moduleOrKey === 'string' ? NEXO_MODULES.find(item => item.key === moduleOrKey) : moduleOrKey
  if(!module) return false
  return !Array.isArray(module.roles) || module.roles.includes(role)
}

window.defaultMenuPermissions = function(role){
  if(role === 'admin') return NEXO_MODULES.filter(module => moduleAvailableForRole(module,'admin')).map(module => module.key)
  if(role === 'leader') return ['my_team','requests','presence','new_hires']
  if(role === 'onsite') return ['requests']
  if(role === 'employee') return ['mood','climate','new_hires','performance','pdi']
  return []
}

window.profileMenuPermissions = function(profile){
  if(!profile) return []
  if(profile.role === 'admin') return defaultMenuPermissions('admin')
  const permissions = Array.isArray(profile.menu_permissions) ? [...profile.menu_permissions] : defaultMenuPermissions(profile.role)
  // Minha Equipe é uma função operacional básica de toda liderança e não depende de Estrutura.
  if(profile.role === 'leader' && !permissions.includes('my_team')) permissions.unshift('my_team')
  return permissions.filter(key => moduleAvailableForRole(key,profile.role))
}

window.hasModuleAccess = function(profile,moduleKey){
  if(!profile || !moduleAvailableForRole(moduleKey,profile.role)) return false
  return profile.role === 'admin' || profileMenuPermissions(profile).includes(moduleKey)
}

window.moduleUrlForProfile = function(profile,moduleKey){
  if(moduleKey === 'schedules' && profile?.role === 'admin') return 'schedules.html'
  if(moduleKey === 'my_team' && profile?.role === 'leader') return 'my-team.html'
  if(moduleKey === 'requests' && profile?.role === 'admin') return 'rh-requests.html'
  if(moduleKey === 'new_hires') {
    return profile?.role === 'employee' ? 'new-hires.html' : 'new-hires-admin.html'
  }
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
  const visible = NEXO_MODULES.filter(module => hasModuleAccess(profile,module.key))
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

// Nas páginas antigas da Liderança a sidebar ainda é estática. Minha Equipe
// é inserida sem conceder qualquer acesso ao módulo administrativo Estrutura.
window.ensureMyTeamSidebarLink = function(profile){
  const sidebar=document.querySelector('.sidebar')
  if(!sidebar)return
  const existing=sidebar.querySelector('a[href="my-team.html"],[data-nexo-my-team-link]')
  if(profile?.role!=='leader'||!hasModuleAccess(profile,'my_team')){existing?.remove();return}
  if(existing)return
  const link=document.createElement('a')
  link.className='nav-btn';link.href='my-team.html';link.dataset.module='my_team';link.dataset.nexoMyTeamLink='1';link.textContent='Minha Equipe'
  const requests=sidebar.querySelector('[data-module="requests"],a[href="leader.html"]')
  if(requests){requests.insertAdjacentElement('beforebegin',link);return}
  const firstTitle=sidebar.querySelector('.nav-title')
  if(firstTitle)firstTitle.insertAdjacentElement('afterend',link);else sidebar.prepend(link)
}

// Mantém o atalho de Acompanhamento Inicial visível também nas páginas antigas
// do NEXO, que ainda possuem sidebar estática.
window.ensureNewHiresSidebarLink = function(profile){
  const sidebar = document.querySelector('.sidebar')
  if(!sidebar) return

  const existing = sidebar.querySelector('a[href^="new-hires-admin.html"],a[href^="new-hires.html"],[data-nexo-new-hires-link]')
  if(!hasModuleAccess(profile,'new_hires')){
    existing?.remove()
    return
  }
  if(existing) return

  const link = document.createElement('a')
  link.className = 'nav-btn'
  link.href = moduleUrlForProfile(profile,'new_hires')
  link.dataset.module = 'new_hires'
  link.dataset.nexoNewHiresLink = '1'
  link.textContent = 'Acompanhamento Inicial'

  const titles = [...sidebar.querySelectorAll('.nav-title')]
  const peopleTitle = titles.find(el => (el.textContent || '').trim().toUpperCase().startsWith('PESSOAS'))
  if(peopleTitle){
    const climateLink = sidebar.querySelector('a[href*="module=climate"]')
    if(climateLink){
      climateLink.insertAdjacentElement('afterend',link)
      return
    }
    let cursor = peopleTitle.nextElementSibling
    while(cursor && !cursor.classList.contains('nav-title')) cursor = cursor.nextElementSibling
    sidebar.insertBefore(link,cursor || null)
    return
  }

  const accountTitle = titles.find(el => (el.textContent || '').trim().toUpperCase()==='CONTA')
  const profileLink = sidebar.querySelector('a[href="profile.html"]')
  const peopleGroup = document.createElement('div')
  peopleGroup.className='nav-title'
  peopleGroup.textContent='PESSOAS & DESENVOLVIMENTO'
  const before = accountTitle || profileLink
  sidebar.insertBefore(peopleGroup,before || null)
  sidebar.insertBefore(link,before || null)
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
  ensureMyTeamSidebarLink(profile)
  ensureNewHiresSidebarLink(profile)
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

// ================================================================
// NEXO BI — recursos compartilhados em todos os módulos
// ================================================================
window.loadNexoBiAssets = function(){
  if(!document.querySelector('link[data-nexo-bi]')){
    const link=document.createElement('link')
    link.rel='stylesheet';link.href='nexo-bi.css';link.dataset.nexoBi='1'
    document.head.appendChild(link)
  }
  if(!document.querySelector('script[data-nexo-bi]')){
    const script=document.createElement('script')
    script.src='nexo-bi.js';script.defer=true;script.dataset.nexoBi='1'
    document.head.appendChild(script)
  }
}
loadNexoBiAssets()

// ================================================================
// NEXO — REORGANIZAÇÃO OPERACIONAL V2
// ================================================================
window.loadNexoOperationalUiAssets = function(){
  if(!document.querySelector('link[data-nexo-operational-ui]')){
    const link=document.createElement('link')
    link.rel='stylesheet';link.href='nexo-operational-ui.css';link.dataset.nexoOperationalUi='1'
    document.head.appendChild(link)
  }
  if(!document.querySelector('script[data-nexo-operational-ui]')){
    const script=document.createElement('script')
    script.src='nexo-operational-ui.js';script.dataset.nexoOperationalUi='1'
    document.body.appendChild(script)
  }
}
loadNexoOperationalUiAssets()

// ================================================================
// NEXO — CATÁLOGO DE HORÁRIOS SHOPEE
// No Admin principal carrega apenas a integração do cadastro individual.
// A gestão completa vive em schedules.html.
// ================================================================
window.loadNexoScheduleCatalogAssets = function(){
  const hasStandalone=!!document.getElementById('schedulePageContext')
  const hasEmployeeForm=!!document.getElementById('employees')
  if(!hasStandalone&&!hasEmployeeForm)return
  if(!document.querySelector('link[data-nexo-schedule-catalog]')){
    const link=document.createElement('link')
    link.rel='stylesheet';link.href='schedule-catalog.css';link.dataset.nexoScheduleCatalog='1'
    document.head.appendChild(link)
  }
  if(!document.querySelector('script[data-nexo-schedule-catalog]')){
    const script=document.createElement('script')
    script.src='schedule-catalog.js';script.dataset.nexoScheduleCatalog='1'
    document.body.appendChild(script)
  }
}
loadNexoScheduleCatalogAssets()

// ================================================================
// NEXO — CARTEIRA COMPARTILHADA DE LIDERANÇA
// Admin configura dentro de Horários; Líder usa Minha Equipe.
// ================================================================
window.loadNexoLeadershipPoolAssets = function(){
  const hasAdmin=!!document.getElementById('scheduleLeadershipRoot')
  const hasLeader=!!document.getElementById('myTeamRoot')
  if(!hasAdmin&&!hasLeader)return
  if(!document.querySelector('link[data-nexo-leadership-pool]')){
    const link=document.createElement('link')
    link.rel='stylesheet';link.href='leadership-pool.css';link.dataset.nexoLeadershipPool='1'
    document.head.appendChild(link)
  }
  if(!document.querySelector('script[data-nexo-leadership-pool]')){
    const script=document.createElement('script')
    script.src='leadership-pool.js';script.dataset.nexoLeadershipPool='1'
    document.body.appendChild(script)
  }
}
loadNexoLeadershipPoolAssets()

