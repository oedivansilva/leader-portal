let profileContext

function backToPortal(){location.href=firstAllowedModuleUrl(profileContext.profile)}

profileForm.addEventListener('submit',async event=>{
  event.preventDefault()
  const {error}=await db.rpc('update_my_profile',{new_full_name:profileName.value.trim(),new_phone:profilePhone.value.trim()})
  if(error)return alert('Erro ao salvar: '+error.message)
  alert('Perfil atualizado com sucesso!')
  location.reload()
})

ownPasswordForm.addEventListener('submit',async event=>{
  event.preventDefault()
  if(ownPassword.value!==ownPasswordConfirmation.value)return alert('As senhas não conferem.')
  const {error}=await db.auth.updateUser({password:ownPassword.value})
  if(error)return alert('Erro ao alterar senha: '+error.message)
  event.target.reset()
  alert('Senha alterada com sucesso!')
})

function showSignature(signature){
  const hasSignature=Boolean(signature)
  profileSignaturePreview.classList.toggle('hidden',!hasSignature)
  signatureEmpty.classList.toggle('hidden',hasSignature)
  removeSignatureButton.classList.toggle('hidden',!hasSignature)
  if(hasSignature)profileSignaturePreview.src=signature
  else profileSignaturePreview.removeAttribute('src')
}

profileSignatureInput.addEventListener('change',event=>{
  const file=event.target.files?.[0]
  if(!file)return
  if(!file.type.startsWith('image/')){event.target.value='';return alert('Selecione uma imagem válida.')}
  if(file.size>2*1024*1024){event.target.value='';return alert('A imagem deve ter no máximo 2 MB.')}
  const reader=new FileReader()
  reader.onload=async loadEvent=>{
    const signature=String(loadEvent.target?.result||'')
    const {error}=await db.from('profiles').update({signature_url:signature}).eq('id',profileContext.user.id)
    if(error)return alert('Erro ao salvar a assinatura: '+error.message)
    profileContext.profile.signature_url=signature
    showSignature(signature)
    event.target.value=''
    alert('Assinatura salva com sucesso!')
  }
  reader.readAsDataURL(file)
})

removeSignatureButton.addEventListener('click',async()=>{
  if(!confirm('Deseja remover a assinatura cadastrada?'))return
  const {error}=await db.from('profiles').update({signature_url:null}).eq('id',profileContext.user.id)
  if(error)return alert('Erro ao remover a assinatura: '+error.message)
  profileContext.profile.signature_url=null
  showSignature('')
  alert('Assinatura removida.')
})

getSessionContext().then(context=>{
  if(!context)return
  profileContext=context
  const role=context.profile.role
  renderPortalSidebar(profileSidebar,context.profile,'profile')
  profileName.value=context.profile.full_name||''
  profileEmail.value=context.profile.email||context.user.email||''
  profilePhone.value=context.profile.phone||''
  profileRole.value=roleLabel(role)
  signatureCard.classList.toggle('hidden',role!=='onsite')
  if(role==='onsite')showSignature(context.profile.signature_url||'')
})
