let workspaceCtx
let operations = []
let profiles = []
let workspaceEmployees = []

const workspaceModule = new URLSearchParams(location.search).get('module') || 'overview'
const absenceLabels = {
  AF: 'Afastamento (1º ao 15º dia)', AL: 'Afastamento por INSS/licença', AM: 'Atestado médico',
  F: 'Falta injustificada', FJ: 'Falta justificada — CLT', NS: 'No-show',
  justificada: 'Atestado médico', injustificada: 'Falta injustificada'
}
const weekdayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function showWorkspaceSection(moduleKey) {
  document.querySelectorAll('.workspace-section').forEach(section => section.classList.toggle('active', section.id === moduleKey))
}

async function loadWorkspaceBase() {
  const [operationResult, profileResult] = await Promise.all([
    db.rpc('get_my_operations'),
    db.rpc('get_visible_profile_names')
  ])
  if (operationResult.error) throw operationResult.error
  if (profileResult.error) throw profileResult.error
  operations = (operationResult.data || []).map(operation => ({ ...operation, clients: { name: operation.client_name } }))
  profiles = profileResult.data || []
  window.dashboardAllowedOperationIds = operations.map(operation => operation.id)
}

async function loadEmployeesModule() {
  const { data, error } = await db.from('employees')
    .select('registration,full_name,status,admission_date,dismissal_date,operation_id,operations(cost_center,department)')
    .order('full_name')
  if (error) return alert(error.message)
  workspaceEmployees = data || []
  renderWorkspaceEmployees()
}

function renderWorkspaceEmployees() {
  const query = workspaceEmployeeSearch.value.trim().toLowerCase()
  const rows = workspaceEmployees.filter(employee => `${employee.registration} ${employee.full_name}`.toLowerCase().includes(query))
  workspaceEmployeeRows.innerHTML = rows.map(employee => `<tr>
    <td>${escapeHTML(employee.registration)}</td>
    <td><strong>${escapeHTML(employee.full_name)}</strong></td>
    <td>${escapeHTML(employee.operations?.cost_center || '—')}<br><small>${escapeHTML(employee.operations?.department || '')}</small></td>
    <td><span class="badge ${employee.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${escapeHTML(employee.status || '—')}</span></td>
    <td>${formatDate(employee.admission_date)}</td>
    <td>${employee.dismissal_date ? formatDate(employee.dismissal_date) : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum colaborador encontrado.</td></tr>'
}

async function loadPresenceModule() {
  const { data, error } = await db.from('attendance_absences')
    .select('absence_date,absence_type,notes,employees(registration,full_name),operations(cost_center),profiles!attendance_absences_leader_id_fkey(full_name)')
    .order('absence_date', { ascending: false })
  if (error) return alert(error.message)
  const rows = (data || []).filter(item => absenceLabels[item.absence_type])
  workspacePresenceRows.innerHTML = rows.map(item => `<tr>
    <td>${formatDate(item.absence_date)}</td>
    <td>${escapeHTML(item.employees?.registration || '—')}</td>
    <td>${escapeHTML(item.employees?.full_name || '—')}</td>
    <td>${escapeHTML(item.operations?.cost_center || '—')}</td>
    <td>${escapeHTML(item.profiles?.full_name || '—')}</td>
    <td>${escapeHTML(absenceLabels[item.absence_type])}</td>
    <td>${escapeHTML(item.notes || '—')}</td>
  </tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhuma ocorrência registrada.</td></tr>'
}

async function loadTurnoverModule() {
  const { data, error } = await db.from('employees')
    .select('registration,full_name,admission_date,dismissal_date,termination_type,termination_reason,eligible_for_rehire,operations(cost_center)')
    .order('dismissal_date', { ascending: false })
  if (error) return alert(error.message)
  const rows = (data || []).filter(employee => employee.dismissal_date)
  workspaceTurnoverRows.innerHTML = rows.map(employee => `<tr>
    <td>${escapeHTML(employee.registration)}</td>
    <td>${escapeHTML(employee.full_name)}</td>
    <td>${escapeHTML(employee.operations?.cost_center || '—')}</td>
    <td>${formatDate(employee.admission_date)}</td>
    <td>${formatDate(employee.dismissal_date)}</td>
    <td>${escapeHTML(employee.termination_type || '—')}</td>
    <td>${escapeHTML(employee.termination_reason || '—')}</td>
    <td>${employee.eligible_for_rehire === true ? 'Sim' : employee.eligible_for_rehire === false ? 'Não' : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhum desligamento encontrado.</td></tr>'
}

async function loadManagementModule() {
  const [scalesResult, daysResult, benefitsResult] = await Promise.all([
    db.from('work_scales').select('*').order('name'),
    db.from('scale_work_days').select('*'),
    db.from('benefits').select('*').order('name')
  ])
  const failed = [scalesResult, daysResult, benefitsResult].find(result => result.error)
  if (failed) return alert(failed.error.message)
  const days = daysResult.data || []
  workspaceScaleRows.innerHTML = (scalesResult.data || []).map(scale => {
    const workDays = days.filter(item => item.scale_id === scale.id).map(item => weekdayNames[item.weekday]).join(', ') || 'Nenhum'
    return `<tr><td><strong>${escapeHTML(scale.name)}</strong></td><td>${escapeHTML(workDays)}</td><td>${escapeHTML(scale.description || '—')}</td><td><span class="badge ${scale.active ? 'badge-green' : 'badge-gray'}">${scale.active ? 'Ativa' : 'Inativa'}</span></td></tr>`
  }).join('') || '<tr><td colspan="4" class="empty">Nenhuma escala cadastrada.</td></tr>'
  workspaceBenefitRows.innerHTML = (benefitsResult.data || []).map(benefit => `<tr><td>${escapeHTML(benefit.name)}</td><td><span class="badge ${benefit.active ? 'badge-green' : 'badge-gray'}">${benefit.active ? 'Ativo' : 'Inativo'}</span></td></tr>`).join('') || '<tr><td colspan="2" class="empty">Nenhum benefício cadastrado.</td></tr>'
}

function loadStructureModule() {
  workspaceStructureRows.innerHTML = operations.map(operation => `<tr>
    <td>${escapeHTML(operation.client_name || '—')}</td>
    <td>${escapeHTML(operation.cost_center)}</td>
    <td>${escapeHTML(operation.department)}</td>
    <td>${escapeHTML(operation.city_state || '—')}</td>
    <td><span class="badge ${operation.active ? 'badge-green' : 'badge-gray'}">${operation.active ? 'Ativa' : 'Inativa'}</span></td>
  </tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhuma operação vinculada.</td></tr>'
}

async function loadUsersModule() {
  const { data, error } = await db.rpc('get_visible_users')
  if (error) return alert(error.message)
  workspaceUserRows.innerHTML = (data || []).map(user => `<tr>
    <td><strong>${escapeHTML(user.full_name)}</strong></td>
    <td>${escapeHTML(roleLabel(user.role))}</td>
    <td>${escapeHTML(user.email || '—')}</td>
    <td>${escapeHTML(user.phone || '—')}</td>
    <td>${escapeHTML(user.operation_names || '—')}</td>
    <td><span class="badge ${user.active ? 'badge-green' : 'badge-gray'}">${user.active ? 'Ativo' : 'Inativo'}</span></td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum usuário disponível.</td></tr>'
}

async function loadAuditModule() {
  const { data, error } = await db.from('system_activity_log').select('*').order('created_at', { ascending: false }).limit(300)
  if (error) return alert(error.message)
  workspaceAuditRows.innerHTML = (data || []).map(item => `<tr>
    <td>${new Date(item.created_at).toLocaleString('pt-BR')}</td>
    <td>${escapeHTML(profiles.find(profile => profile.id === item.actor_id)?.full_name || 'Sistema')}</td>
    <td>${escapeHTML(item.description)}</td>
    <td><span class="badge badge-gray">${escapeHTML(item.entity_type)}</span></td>
    <td>${item.metadata?.data ? formatDate(item.metadata.data) : item.metadata?.novo_status ? escapeHTML(item.metadata.novo_status) : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum registro disponível.</td></tr>'
}

async function openWorkspaceModule(moduleKey) {
  showWorkspaceSection(moduleKey)
  if (moduleKey === 'overview') return prepareDashboard()
  if (moduleKey === 'employees') return loadEmployeesModule()
  if (moduleKey === 'presence') return loadPresenceModule()
  if (moduleKey === 'turnover') return loadTurnoverModule()
  if (moduleKey === 'management') return loadManagementModule()
  if (moduleKey === 'structure') return loadStructureModule()
  if (moduleKey === 'users') return loadUsersModule()
  if (moduleKey === 'audit') return loadAuditModule()
}

document.getElementById('workspaceEmployeeSearch')?.addEventListener('input', renderWorkspaceEmployees)

getSessionContext().then(async context => {
  if (!context) return
  if (context.profile.role === 'admin') return location.replace(`admin.html?module=${encodeURIComponent(workspaceModule)}`)
  if (workspaceModule === 'requests') return location.replace(moduleUrlForProfile(context.profile, 'requests'))
  if (workspaceModule === 'presence' && context.profile.role === 'leader') return location.replace('presence.html')
  if (!requireModuleAccess(context.profile, workspaceModule)) return

  workspaceCtx = context
  renderPortalSidebar(portalSidebar, context.profile, workspaceModule)
  try {
    await loadWorkspaceBase()
    await openWorkspaceModule(workspaceModule)
  } catch (error) {
    alert(`Não foi possível carregar o módulo: ${error.message}`)
  }
})
