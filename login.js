async function getCurrentProfile() {
  const { data: { user }, error: userError } = await db.auth.getUser()
  if (userError || !user) return null

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    await db.auth.signOut()
    alert('Seu usuário não possui um perfil válido no NEXO. Procure o administrador.')
    return null
  }

  if (!profile.active) {
    await db.auth.signOut()
    document.getElementById('loginCard')?.classList.remove('hidden')
    document.getElementById('passwordCard')?.classList.add('hidden')
    alert('Este acesso está desativado. Peça ao administrador para reativá-lo.')
    return null
  }

  return profile
}

async function redirectUser() {
  const profile = await getCurrentProfile()
  if (!profile) return

  if (profile.must_change_password || new URLSearchParams(location.search).has('change-password')) {
    document.getElementById('loginCard').classList.add('hidden')
    document.getElementById('passwordCard').classList.remove('hidden')
    return
  }

  location.replace(firstAllowedModuleUrl(profile))
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault()
  const button = event.submitter
  button.disabled = true

  const identifier = email.value.trim()
  const cpfDigits = identifier.replace(/\D/g,'')
  const isCpfLogin = cpfDigits.length === 11 && !identifier.includes('@')
  const authEmail = isCpfLogin ? `${cpfDigits}@colaborador.nexo.local` : identifier.toLowerCase()
  let authPassword = password.value

  // Para o primeiro acesso por CPF, aceita tanto DDMMAAAA quanto DD/MM/AAAA.
  if (isCpfLogin) {
    const birthDigits = authPassword.replace(/\D/g,'')
    if (birthDigits.length === 8 && /^\d{8}$/.test(birthDigits)) {
      authPassword = `${birthDigits.slice(0,2)}/${birthDigits.slice(2,4)}/${birthDigits.slice(4)}`
    }
  }

  const { error } = await db.auth.signInWithPassword({
    email: authEmail,
    password: authPassword
  })

  button.disabled = false
  if (error) return alert(isCpfLogin ? 'CPF ou senha inválidos. No primeiro acesso, use sua data de nascimento no formato DD/MM/AAAA.' : `Erro ao entrar: ${error.message}`)
  await redirectUser()
})

document.getElementById('passwordForm').addEventListener('submit', async event => {
  event.preventDefault()

  if (newPassword.value !== confirmPassword.value) {
    return alert('As senhas não conferem.')
  }
  if (newPassword.value.length < 8) {
    return alert('A nova senha deve ter pelo menos 8 caracteres.')
  }

  const button = event.submitter
  button.disabled = true
  button.textContent = 'Salvando...'

  try {
    const { error: passwordError } = await db.auth.updateUser({ password: newPassword.value })

    // Quando a primeira tentativa já alterou a senha, o Supabase informa que ela
    // deve ser diferente da atual. Nesse caso, basta concluir o primeiro acesso.
    const passwordAlreadyApplied = passwordError && (
      passwordError.code === 'same_password' ||
      /different from the old password|diferente da senha anterior|same password/i.test(passwordError.message || '')
    )

    if (passwordError && !passwordAlreadyApplied) {
      return alert(`Não foi possível alterar a senha: ${passwordError.message}`)
    }

    const { error: completionError } = await db.rpc('complete_initial_password_change')
    if (completionError) {
      return alert(`A senha foi alterada, mas não foi possível concluir o primeiro acesso: ${completionError.message}`)
    }

    const profile = await getCurrentProfile()
    if (!profile) return

    newPassword.value = ''
    confirmPassword.value = ''
    location.replace(firstAllowedModuleUrl(profile))
  } finally {
    button.disabled = false
    button.textContent = 'Salvar e continuar'
  }
})

redirectUser()
