(() => {
  function isAdminLegacyPage(){return !!(document.getElementById('employees')&&document.getElementById('structure')&&document.getElementById('management'))}

  function patchAdminNavigation(){
    if(!isAdminLegacyPage())return
    const requested=new URLSearchParams(location.search).get('module')
    if(requested==='requests'){location.replace('rh-requests.html');return}
    if(requested==='schedules'||requested==='management'){location.replace('schedules.html');return}
    const sidebar=document.querySelector('.sidebar');if(!sidebar)return

    // O módulo antigo deixa de existir visualmente; escalas vão para Horários e benefícios para Estrutura.
    const oldManagement=sidebar.querySelector('[data-module="management"]')
    if(oldManagement) oldManagement.remove()

    const turnover=sidebar.querySelector('[data-module="turnover"]')
    if(!sidebar.querySelector('[data-nexo-schedules-link]')){
      const link=document.createElement('a')
      link.className='nav-btn';link.href='schedules.html';link.dataset.module='schedules';link.dataset.nexoSchedulesLink='1';link.textContent='Horários'
      turnover?.insertAdjacentElement('afterend',link)
    }

    const requestButton=sidebar.querySelector('[data-module="requests"]')
    if(requestButton&&!requestButton.dataset.nexoRhRoute){
      requestButton.dataset.nexoRhRoute='1'
      requestButton.removeAttribute('onclick')
      requestButton.addEventListener('click',event=>{event.preventDefault();location.href='rh-requests.html'})
    }

    const oldPage=document.getElementById('management')
    if(oldPage){oldPage.classList.remove('active');oldPage.classList.add('nexo-legacy-management-hidden')}
  }

  function compactEmployeeImport(){
    const employees=document.getElementById('employees');if(!employees)return
    const file=document.getElementById('employeeImportFile')
    const card=file?.closest('.card');if(!card||card.classList.contains('nexo-import-compact'))return
    card.classList.add('nexo-import-compact')
    const head=card.querySelector('.page-head')
    const title=head?.querySelector('h2');if(title)title.textContent='Importar colaboradores'
    const text=head?.querySelector('.muted');if(text)text.textContent='Planilha em lote por MAT. O horário pode ficar pendente e ser tratado depois no módulo Horários.'
  }

  function moveBenefitsToStructure(){
    if(!isAdminLegacyPage())return
    const structure=document.getElementById('structure')
    const structureSubtitle=structure?.querySelector('.page-head .muted');if(structureSubtitle)structureSubtitle.textContent='Clientes, operações, turnos de liderança, parceiros e benefícios.'
    const benefitForm=document.getElementById('benefitForm')
    const card=benefitForm?.closest('.card')
    if(!structure||!card||card.dataset.nexoMovedToStructure)return
    card.dataset.nexoMovedToStructure='1';card.classList.add('nexo-benefit-structure-card')
    const title=card.querySelector('h3');if(title)title.textContent='Benefícios'
    if(!card.querySelector('.nexo-benefit-help')){
      const help=document.createElement('p');help.className='muted nexo-benefit-help';help.textContent='Cadastre os benefícios disponíveis para vincular aos colaboradores.'
      title?.insertAdjacentElement('afterend',help)
    }
    const firstGrid=structure.querySelector('.grid-3,.grid-2')
    if(firstGrid)firstGrid.insertAdjacentElement('afterend',card);else structure.appendChild(card)
  }

  function renameAccompanimentLinks(){
    document.querySelectorAll('.sidebar a,.sidebar button').forEach(item=>{
      const href=item.getAttribute('href')||''
      const mod=item.dataset?.module||''
      const shouldRename=mod==='new_hires'||/new-hires/i.test(href)||item.textContent.trim()==='Novos Contratados'
      if(shouldRename && item.textContent.trim()!=='Acompanhamento Inicial') item.textContent='Acompanhamento Inicial'
    })
  }


  function renameAccompanimentPage(){
    if(!/new-hires/i.test(location.pathname))return
    document.title=document.title.replace(/Novos Contratados/gi,'Acompanhamento Inicial')
    document.querySelectorAll('h1,h2,.page-title').forEach(el=>{
      const text=el.textContent.trim()
      if(text==='Novos Contratados')el.textContent='Acompanhamento Inicial'
      if(text==='Novo acompanhamento')el.textContent='Iniciar acompanhamento'
    })
  }

  function filterPermissionOptions(){
    const pairs=[
      {container:document.getElementById('userPermissions'),role:document.getElementById('userRole')},
      {container:document.getElementById('editUserPermissions'),role:document.getElementById('editUserRole')}
    ]
    pairs.forEach(({container,role})=>{
      if(!container||!role||!window.NEXO_MODULES)return
      const roleValue=role.value||'leader'
      container.querySelectorAll('label').forEach(label=>{
        const input=label.querySelector('input[type="checkbox"]')
        if(!input)return
        const module=NEXO_MODULES.find(item=>item.key===input.value)
        const compatible=!module||typeof moduleAvailableForRole!=='function'||moduleAvailableForRole(module,roleValue)
        label.classList.toggle('nexo-role-incompatible',!compatible)
        if(!compatible)input.checked=false
      })
    })
  }

  function installPermissionGuard(){
    ;['userRole','editUserRole'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(filterPermissionOptions,0)))
    ;['userPermissions','editUserPermissions'].forEach(id=>{
      const el=document.getElementById(id);if(!el)return
      new MutationObserver(()=>filterPermissionOptions()).observe(el,{childList:true,subtree:true})
    })
    setTimeout(filterPermissionOptions,0)
    setTimeout(filterPermissionOptions,350)
  }

  function install(){
    patchAdminNavigation();compactEmployeeImport();moveBenefitsToStructure();renameAccompanimentLinks();renameAccompanimentPage();installPermissionGuard()
    const sidebar=document.querySelector('.sidebar')
    if(sidebar){
      const observer=new MutationObserver(()=>renameAccompanimentLinks())
      observer.observe(sidebar,{childList:true,subtree:true})
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install()
})()
