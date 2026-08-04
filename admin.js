const cfg = window.PORTAL_CONFIG
window.db = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)

window.escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
window.formatDate = value => value ? value.split('-').reverse().join('/') : '-'
window.roleLabel = role => ({admin:'Administrador',leader:'Líder / Gestor',onsite:'Equipe Onsite'}[role] || role)

window.getSessionContext = async function(requiredRole) {
  const { data: { user } } = await db.auth.getUser()
  if (!user) { location.replace('index.html'); return null }
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', user.id).single()
  if (error || !profile || !profile.active) { await db.auth.signOut(); location.replace('index.html'); return null }
  if (profile.must_change_password) { location.replace('index.html?change-password=1'); return null }
  if (requiredRole && profile.role !== requiredRole) {
    location.replace(({admin:'admin.html',leader:'leader.html',onsite:'onsite.html'})[profile.role] || 'index.html'); return null
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
