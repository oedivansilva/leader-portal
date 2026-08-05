async function redirectUser(){
  const { data:{ user } } = await db.auth.getUser(); if(!user) return
  const { data:profile } = await db.from('profiles').select('*').eq('id',user.id).single(); if(!profile) return
  if(profile.must_change_password || new URLSearchParams(location.search).has('change-password')){
    document.getElementById('loginCard').classList.add('hidden'); document.getElementById('passwordCard').classList.remove('hidden'); return
  }
  location.replace(firstAllowedModuleUrl(profile))
}
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;const {error}=await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});button.disabled=false;if(error)return alert('Erro ao entrar: '+error.message);redirectUser()})
document.getElementById('passwordForm').addEventListener('submit',async e=>{e.preventDefault();if(newPassword.value!==confirmPassword.value)return alert('As senhas não conferem.');const {error}=await db.auth.updateUser({password:newPassword.value});if(error)return alert(error.message);const done=await db.rpc('complete_initial_password_change');if(done.error)return alert(done.error.message);location.replace('index.html')})
redirectUser()
