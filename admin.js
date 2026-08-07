let ctx, clients = [], operations = [], shifts = [], profiles = [], links = [], leaderLinks = [], requests = []
let initialAdminModuleOpened = false

const options = (items, label, fn) => `<option value="">${label}</option>` + items.map(item => `<option value="${item.id}">${escapeHTML(fn(item))}</option>`).join('')
const permissionLabels = Object.fromEntries(NEXO_MODULES.map(module => [module.key, module.label]))

function renderPermissionOptions(container, role, selectedPermissions) {
  const selected = new Set(role === 'admin' ? defaultMenuPermissions('admin') : (Array.isArray(selectedPermissions) ? selectedPermissions : defaultMenuPermissions(role)))
  container.innerHTML = NEXO_MODULES.map(module => `
    <label class="module-permission-option ${role === 'admin' ? 'is-disabled' : ''}">
      <input type="checkbox" value="${module.key}" ${selected.has(module.key) ? 'checked' : ''} ${role === 'admin' ? 'disabled' : ''}>
      <span>${escapeHTML(module.label)}</span>
    </label>
  `).join('')
}

function selectedPermissions(container, role) {
  if (role === 'admin') return defaultMenuPermissions('admin')
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value)
}

function toggleCreateRoleFields(resetPermissions = false) {
  const role = userRole.value
  leaderOperationField.classList.toggle('hidden', role !== 'leader')
  leaderShiftField.classList.toggle('hidden', role !== 'leader')
  onsiteOperationsField.classList.toggle('hidden', role !== 'onsite')
  leaderOperation.required = role === 'leader'
  leaderShift.required = role === 'leader'
  onsiteOperations.required = role === 'onsite'
  if (resetPermissions) renderPermissionOptions(userPermissions, role, defaultMenuPermissions(role))
}

function toggleEditFields(resetPermissions = false) {
  const role = editUserRole.value
  editLeaderOperationField.classList.toggle('hidden', role !== 'leader')
  editLeaderShiftField.classList.toggle('hidden', role !== 'leader')
  editOnsiteOperationsField.classList.toggle('hidden', role !== 'onsite')
  editLeaderOperation.required = role === 'leader'
  editLeaderShift.required = role === 'leader'
  if (resetPermissions) renderPermissionOptions(editUserPermissions, role, defaultMenuPermissions(role))
}

async function loadAll() {
  const results = await Promise.all([
    db.from('clients').select('*').order('name'),
    db.from('operations').select('*,clients(name)').order('department'),
    db.from('shifts').select('*').order('name'),
    db.from('profiles').select('*').order('full_name'),
    db.from('onsite_operations').select('*'),
    db.from('leader_operations').select('*'),
    db.from('disciplinary_requests').select('*,operations(cost_center,department)').order('created_at', { ascending: false }),
    db.from('system_activity_log').select('*').order('created_at', { ascending: false }).limit(200)
  ])

  const names = ['clientes', 'operações', 'turnos', 'usuários', 'vínculos Onsite', 'vínculos Líder', 'solicitações', 'auditoria']
  const failures = results.map((result, index) => result.error ? `${names[index]}: ${result.error.message}` : null).filter(Boolean)
  if (failures.length) alert(`Alguns dados não puderam ser carregados:\n\n${failures.join('\n')}`)

  ;[clients, operations, shifts, profiles, links, leaderLinks, requests] = results.slice(0, 7).map(result => result.data || [])
  renderSelects()
  renderUsers()
  renderOperations()
  renderRequests()
  renderAudit(results[7].data || [])
  renderStats()
  if (typeof loadManagement === 'function') loadManagement()
  if (typeof prepareDashboard === 'function') prepareDashboard()
  if (typeof loadWorkforce === 'function') loadWorkforce()
  openRequestedAdminModule()
}

function openRequestedAdminModule() {
  if (initialAdminModuleOpened) return
  initialAdminModuleOpened = true
  const requested = new URLSearchParams(location.search).get('module')
  if (!requested) return
  const button = document.querySelector(`.sidebar [data-module="${CSS.escape(requested)}"]`)
  if (!button) return
  const pageId = requested === 'presence' ? 'presenceAdmin' : requested === 'turnover' ? 'turnoverAdmin' : requested
  showPage(pageId, button)
}

function renderStats() {
  statUsers.textContent = profiles.filter(item => item.active && item.role !== 'employee').length
  statPending.textContent = requests.filter(item => !item.applied_date && !['cancelado', 'concluido'].includes(item.status)).length
  statOperations.textContent = operations.filter(item => item.active).length
}

function operationLabel(item) {
  return `${item.clients?.name || ''} | ${item.cost_center} | ${item.department}`
}

function onsiteOperationOptions(onsiteId = null) {
  const allowed = operations.filter(operation => operation.active && !links.some(link => link.operation_id === operation.id && link.onsite_id !== onsiteId))
  return allowed.map(operation => `<option value="${operation.id}">${escapeHTML(operationLabel(operation))}</option>`).join('')
}

function renderSelects() {
  operationClient.innerHTML = options(clients.filter(item => item.active), 'Selecione o cliente', item => item.name)
  leaderOperation.innerHTML = operations.filter(item => item.active).map(item => `<option value="${item.id}">${escapeHTML(operationLabel(item))}</option>`).join('')
  onsiteOperations.innerHTML = onsiteOperationOptions()
  leaderShift.innerHTML = options(shifts.filter(item => item.active), 'Selecione o turno', item => item.name)
}

function renderUsers() {
  const query = userSearch.value.toLowerCase()
  const role = userRoleFilter.value
  const rows = profiles
    .filter(profile => profile.role !== 'employee')
    .filter(profile => (!role || profile.role === role) && (`${profile.full_name} ${profile.email}`.toLowerCase().includes(query)))
    .map(profile => {
      const shift = shifts.find(item => item.id === profile.shift_id)
      const detail = profile.role === 'leader'
        ? `${leaderLinks.filter(item => item.leader_id === profile.id).length} operação(ões) / ${shift?.name || '—'}`
        : profile.role === 'onsite'
          ? `${links.filter(item => item.onsite_id === profile.id).length} operação(ões)`
          : 'Acesso completo'
      const accessTags = profileMenuPermissions(profile).map(key => `<span class="badge badge-gray">${escapeHTML(permissionLabels[key] || key)}</span>`).join('')
      return `<tr>
        <td><strong>${escapeHTML(profile.full_name)}</strong></td>
        <td>${roleLabel(profile.role)}</td>
        <td>${escapeHTML(profile.email)}</td>
        <td>${escapeHTML(detail)}</td>
        <td><div class="access-tags">${accessTags || '<span class="muted">Somente Meu perfil</span>'}</div></td>
        <td><span class="badge ${profile.active ? 'badge-green' : 'badge-gray'}">${profile.active ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="actions">
          <button class="btn btn-light" onclick="openEditUser('${profile.id}')">Editar</button>
          <button class="btn btn-light" onclick="toggleUser('${profile.id}',${!profile.active})">${profile.active ? 'Desativar' : 'Reativar'}</button>
          <button class="btn btn-light" onclick="resetPassword('${profile.id}')">Nova senha</button>
        </div></td>
      </tr>`
    }).join('')
  userRows.innerHTML = rows || '<tr><td colspan="7" class="empty">Nenhum usuário encontrado.</td></tr>'
}

function renderOperations() {
  operationRows.innerHTML = operations.map(operation => `<tr><td>${escapeHTML(operation.clients?.name)}</td><td>${escapeHTML(operation.cost_center)}</td><td>${escapeHTML(operation.department)}</td><td>${escapeHTML(operation.city_state || '—')}</td><td><span class="badge ${operation.active ? 'badge-green' : 'badge-gray'}">${operation.active ? 'Ativa' : 'Inativa'}</span></td><td><button class="btn btn-light" onclick="editOperation('${operation.id}')">Editar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma operação cadastrada.</td></tr>'
}

function renderRequests() {
  assignmentRows.innerHTML = requests.map(request => {
    const onsite = profiles.find(profile => profile.id === request.assigned_onsite_id)
    return `<tr><td>${escapeHTML(request.employee_name)}</td><td>${escapeHTML(request.operations?.cost_center)}<br><small>${escapeHTML(request.operations?.department)}</small></td><td>${escapeHTML(request.penalty_type)}</td><td><span class="badge ${request.assigned_onsite_id ? 'badge-blue' : 'badge-yellow'}">${escapeHTML(request.status)}</span></td><td>${escapeHTML(onsite?.full_name || 'Não atribuído')}</td></tr>`
  }).join('') || '<tr><td colspan="5" class="empty">Nenhuma solicitação.</td></tr>'
}

function renderAudit(items) {
  auditRows.innerHTML = items.map(item => `<tr><td>${new Date(item.created_at).toLocaleString('pt-BR')}</td><td>${escapeHTML(profiles.find(profile => profile.id === item.actor_id)?.full_name || 'Sistema')}</td><td>${escapeHTML(item.description)}</td><td><span class="badge badge-gray">${escapeHTML(item.entity_type)}</span></td><td>${item.metadata?.data ? new Date(`${item.metadata.data}T00:00:00`).toLocaleDateString('pt-BR') : item.metadata?.novo_status ? escapeHTML(item.metadata.novo_status) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum registro.</td></tr>'
}

function openEditUser(id) {
  const profile = profiles.find(item => item.id === id)
  if (!profile) return
  editUserId.value = profile.id
  editUserName.value = profile.full_name || ''
  editUserEmail.value = profile.email || ''
  editUserPhone.value = profile.phone || ''
  editUserRole.value = profile.role
  editLeaderOperation.innerHTML = leaderOperation.innerHTML
  editLeaderShift.innerHTML = leaderShift.innerHTML
  editOnsiteOperations.innerHTML = onsiteOperationOptions(profile.id)
  editLeaderShift.value = profile.shift_id || ''
  const selectedLeaderOps = leaderLinks.filter(link => link.leader_id === profile.id).map(link => link.operation_id)
  ;[...editLeaderOperation.options].forEach(option => option.selected = selectedLeaderOps.includes(option.value))
  const selectedOnsiteOps = links.filter(link => link.onsite_id === profile.id).map(link => link.operation_id)
  ;[...editOnsiteOperations.options].forEach(option => option.selected = selectedOnsiteOps.includes(option.value))
  toggleEditFields(false)
  renderPermissionOptions(editUserPermissions, profile.role, profileMenuPermissions(profile))
  editUserCard.classList.remove('hidden')
  editUserCard.scrollIntoView({ behavior: 'smooth' })
}

function closeEditUser() {
  editUserCard.classList.add('hidden')
  editUserForm.reset()
}

userRole.addEventListener('change', () => toggleCreateRoleFields(true))
editUserRole.addEventListener('change', () => toggleEditFields(true))
userSearch.addEventListener('input', renderUsers)
userRoleFilter.addEventListener('change', renderUsers)

clientForm.addEventListener('submit', async event => {
  event.preventDefault()
  const { error } = await db.from('clients').insert({ name: clientName.value.trim() })
  if (error) return alert(error.message)
  event.target.reset()
  loadAll()
})

shiftForm.addEventListener('submit', async event => {
  event.preventDefault()
  const { error } = await db.from('shifts').insert({ name: shiftName.value.trim() })
  if (error) return alert(error.message)
  event.target.reset()
  loadAll()
})

function editOperation(id) {
  const operation = operations.find(item => item.id === id)
  if (!operation) return
  operationEditId.value = operation.id
  operationClient.value = operation.client_id
  costCenter.value = operation.cost_center || ''
  department.value = operation.department || ''
  operationCity.value = operation.city_state || ''
  operationFormTitle.textContent = 'Editar operação'
  operationSaveBtn.textContent = 'Salvar alterações'
  operationCancelBtn.classList.remove('hidden')
  operationForm.scrollIntoView({ behavior: 'smooth' })
}

function cancelEditOperation() {
  operationForm.reset()
  operationEditId.value = ''
  operationFormTitle.textContent = 'Nova operação'
  operationSaveBtn.textContent = 'Cadastrar'
  operationCancelBtn.classList.add('hidden')
}

operationForm.addEventListener('submit', async event => {
  event.preventDefault()
  const payload = { client_id: operationClient.value, cost_center: costCenter.value.trim().toUpperCase(), department: department.value.trim(), city_state: operationCity.value.trim() }
  const query = operationEditId.value ? db.from('operations').update(payload).eq('id', operationEditId.value) : db.from('operations').insert(payload)
  const { error } = await query
  if (error) return alert(error.message)
  cancelEditOperation()
  loadAll()
})

userForm.addEventListener('submit', async event => {
  event.preventDefault()
  const role = userRole.value
  const leaderOperationIds = [...leaderOperation.selectedOptions].map(option => option.value)
  const onsiteOperationIds = [...onsiteOperations.selectedOptions].map(option => option.value)
  const menuPermissions = selectedPermissions(userPermissions, role)
  if (role === 'leader' && !leaderOperationIds.length) return alert('Selecione ao menos uma operação para o líder.')
  if (role === 'onsite' && !onsiteOperationIds.length) return alert('Selecione uma operação.')
  createUserBtn.disabled = true
  const { data, error } = await db.functions.invoke('admin-create-user', { body: {
    full_name: userName.value.trim(), email: userEmail.value.trim(), phone: userPhone.value.trim(), role,
    shift_id: role === 'leader' ? leaderShift.value : null,
    operation_ids: role === 'leader' ? leaderOperationIds : role === 'onsite' ? onsiteOperationIds : [],
    menu_permissions: menuPermissions
  } })
  createUserBtn.disabled = false
  if (error) return alert(`Erro: ${await functionError(error)}`)
  credentialEmail.textContent = data.email
  credentialPassword.textContent = data.temporary_password
  credentialsBox.classList.remove('hidden')
  event.target.reset()
  toggleCreateRoleFields(true)
  loadAll()
})

editUserForm.addEventListener('submit', async event => {
  event.preventDefault()
  const role = editUserRole.value
  const leaderOperationIds = [...editLeaderOperation.selectedOptions].map(option => option.value)
  const onsiteOperationIds = [...editOnsiteOperations.selectedOptions].map(option => option.value)
  if (role === 'leader' && !leaderOperationIds.length) return alert('Selecione ao menos uma operação para o líder.')
  if (role === 'onsite' && !onsiteOperationIds.length) return alert('Selecione ao menos uma operação.')
  const data = await manageUser({
    action: 'update-user', user_id: editUserId.value,
    full_name: editUserName.value.trim(), email: editUserEmail.value.trim().toLowerCase(), phone: editUserPhone.value.trim(), role,
    shift_id: role === 'leader' ? editLeaderShift.value : null,
    operation_ids: role === 'leader' ? leaderOperationIds : role === 'onsite' ? onsiteOperationIds : [],
    menu_permissions: selectedPermissions(editUserPermissions, role)
  })
  if (data) {
    alert('Usuário atualizado com sucesso!')
    closeEditUser()
    loadAll()
  }
})

async function assignRequest(id) {
  const onsite = document.getElementById(`assign-${id}`).value
  if (!onsite) return alert('Selecione o Onsite.')
  const { error } = await db.from('disciplinary_requests').update({ assigned_onsite_id: onsite, status: 'atribuido' }).eq('id', id)
  if (error) return alert(error.message)
  loadAll()
}

async function manageUser(body) {
  const { data, error } = await db.functions.invoke('admin-manage-user', { body })
  if (error) {
    alert(`Erro: ${await functionError(error)}`)
    return null
  }
  return data
}

async function toggleUser(id, active) {
  const { error } = await db.rpc('admin_set_user_active', { target_user_id: id, new_active: active })
  if (error) return alert(`Erro ao alterar o usuário: ${error.message}`)
  await loadAll()
}

async function resetPassword(id) {
  if (!confirm('Gerar uma nova senha temporária?')) return
  const data = await manageUser({ action: 'reset-password', user_id: id })
  if (data) {
    credentialEmail.textContent = data.email
    credentialPassword.textContent = data.temporary_password
    credentialsBox.classList.remove('hidden')
    const usersButton = document.querySelector('.sidebar [data-module="users"]')
    showPage('users', usersButton)
  }
}

renderPermissionOptions(userPermissions, userRole.value, defaultMenuPermissions(userRole.value))
toggleCreateRoleFields(false)
getSessionContext('admin').then(context => { if (context) { ctx = context; loadAll() } })
