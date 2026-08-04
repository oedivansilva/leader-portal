import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const values = new Uint32Array(14)
  crypto.getRandomValues(values)
  return `Aa7!${[...values].map(value => chars[value % chars.length]).join('')}`
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authorization = request.headers.get('Authorization')
    if (!url || !anon || !service || !authorization) throw new Error('Configuração incompleta.')

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(url, service)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) throw new Error('Sessão inválida.')

    const { data: adminProfile } = await admin.from('profiles').select('role,active').eq('id', user.id).single()
    if (adminProfile?.role !== 'admin' || !adminProfile.active) {
      return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: cors })
    }

    const body = await request.json()
    const id = String(body.user_id || '')
    if (!id) throw new Error('Usuário inválido.')

    if (body.action === 'reset-password') {
      if (id === user.id) throw new Error('Use Meu perfil para alterar sua própria senha.')
      const temporaryPassword = generatePassword()
      const { data, error } = await admin.auth.admin.updateUserById(id, { password: temporaryPassword })
      if (error) throw error
      await admin.from('profiles').update({ must_change_password: true }).eq('id', id)
      return Response.json({ success: true, email: data.user.email, temporary_password: temporaryPassword }, { headers: cors })
    }

    if (body.action === 'update-user') {
      const fullName = String(body.full_name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const phone = String(body.phone || '').trim()
      const role = String(body.role || '')
      const operationIds = Array.isArray(body.operation_ids) ? body.operation_ids : []
      if (!fullName || !email || !phone || !['leader', 'onsite', 'admin'].includes(role)) throw new Error('Dados inválidos.')
      if (role === 'leader' && (!operationIds.length || !body.shift_id)) throw new Error('Líder precisa de ao menos uma operação e turno.')
      if (role === 'onsite' && !operationIds.length) throw new Error('Onsite precisa de ao menos uma operação.')

      const authUpdate = await admin.auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      })
      if (authUpdate.error) throw authUpdate.error

      const profileUpdate = await admin.from('profiles').update({
        full_name: fullName,
        email,
        phone,
        role,
        operation_id: role === 'leader' ? operationIds[0] : null,
        shift_id: role === 'leader' ? body.shift_id : null,
      }).eq('id', id)
      if (profileUpdate.error) throw profileUpdate.error

      await admin.from('onsite_operations').delete().eq('onsite_id', id)
      await admin.from('leader_operations').delete().eq('leader_id', id)
      if (role === 'leader') {
        const links = [...new Set(operationIds)].map(operation_id => ({ leader_id: id, operation_id }))
        const linkInsert = await admin.from('leader_operations').insert(links)
        if (linkInsert.error) throw linkInsert.error
      }
      if (role === 'onsite') {
        const links = [...new Set(operationIds)].map(operation_id => ({ onsite_id: id, operation_id }))
        const linkInsert = await admin.from('onsite_operations').insert(links)
        if (linkInsert.error) throw linkInsert.error
      }
      return Response.json({ success: true }, { headers: cors })
    }

    throw new Error('Ação inválida.')
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, { status: 400, headers: cors })
  }
})
