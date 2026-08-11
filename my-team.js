getSessionContext('leader').then(context=>{
  if(!context)return
  if(!requireModuleAccess(context.profile,'my_team'))return
  renderPortalSidebar(document.getElementById('portalSidebar'),context.profile,'my_team')
})
