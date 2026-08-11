const WECAN_LOGO_URL='https://lh3.googleusercontent.com/d/1Bz8i5enG3uEI8TPkqOwNgODsEU86pR5V'

function formatDateExtended(dateString){
  if(!dateString)return ''
  const [year,month,day]=dateString.split('-')
  const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${day} de ${months[Number(month)-1]} de ${year}`
}

function formatDateBR(dateString){
  if(!dateString)return '____/____/________'
  const [year,month,day]=dateString.split('-')
  return `${day}/${month}/${year}`
}

function nextDay(dateString){
  if(!dateString)return ''
  const date=new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate()+1)
  return date.toISOString().slice(0,10)
}

function addDays(dateString,days){
  if(!dateString)return ''
  const date=new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate()+Number(days||1))
  return date.toISOString().slice(0,10)
}

function getBase64ImageFromUrl(url){
  return new Promise((resolve,reject)=>{
    const img=new Image()
    img.crossOrigin='Anonymous'
    img.onload=()=>{
      const canvas=document.createElement('canvas')
      canvas.width=img.width
      canvas.height=img.height
      canvas.getContext('2d').drawImage(img,0,0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror=reject
    img.src=url
  })
}

function getImageDetails(src){
  return new Promise((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>resolve({width:img.width,height:img.height})
    img.onerror=reject
    img.src=src
  })
}

function getScaledDimensions(width,height,maxWidth,maxHeight){
  const ratio=Math.min(maxWidth/width,maxHeight/height)
  return {width:width*ratio,height:height*ratio}
}

function safeFileToken(value,maxLength=90){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().trim().replace(/[^A-Z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,maxLength)||'NAO-INFORMADO'
}

function localDocumentFileName(request,kind='ORIGINAL'){
  const suspension=request.penalty_type.toLowerCase().includes('susp')
  const prefix=suspension?'SUSP':'ADV'
  const registration=safeFileToken(request.employee_registration||request.employees?.registration||'SEM-MAT',40)
  const employee=safeFileToken(request.employee_name,90)
  const requestCode=`SOL-${String(request.id||'').replace(/-/g,'').slice(0,8).toUpperCase()||'SEM-ID'}`
  const issueDate=(request.issue_date||'').split('-').reverse().join('-')||'SEM-DATA'
  return `${prefix}_MAT-${registration}_${employee}_${requestCode}_${issueDate}_${kind}.pdf`
}

window.generateDisciplinaryPDF=async function(request,signature,options={}){
  const {jsPDF}=window.jspdf
  const doc=new jsPDF()
  const advert=request.penalty_type.toLowerCase().includes('advert')

  try{
    const logo=await getBase64ImageFromUrl(WECAN_LOGO_URL)
    const details=await getImageDetails(logo)
    const size=getScaledDimensions(details.width,details.height,45,15)
    doc.addImage(logo,'PNG',15,10,size.width,size.height)
  }catch(error){
    console.warn('Não foi possível carregar a logo da We Can:',error)
  }

  doc.setFont('helvetica','bold')
  doc.setFontSize(14)
  doc.text(advert?'ADVERTÊNCIA DISCIPLINAR':'CARTA DE SUSPENSÃO',105,25,{align:'center'})

  doc.setFontSize(10)
  doc.setFont('helvetica','normal')
  const documentCity=request.operations?.city_state||request.location||'Ananindeua/PA'
  doc.text(`${documentCity}, ${formatDateExtended(request.issue_date)}`,20,40)

  doc.setFont('helvetica','bold')
  doc.text(`${advert?'ADVERTIMOS':'SUSPENDEMOS'}: ${request.employee_name.toUpperCase()}`,20,52)
  doc.setFont('helvetica','normal')

  const reason=request.penalty_reasons?.description||request.penalty_reasons?.title||'Motivo não informado'
  const legalBasis=Array.isArray(request.disciplinary_legal_bases)?request.disciplinary_legal_bases[0]:request.disciplinary_legal_bases
  if(!legalBasis?.letter||!legalBasis?.title){
    throw new Error('A fundamentação legal da solicitação ainda não foi validada pelo RH. Abra a solicitação e selecione a alínea correta do Art. 482 da CLT antes de gerar o documento.')
  }
  const legalLetter=String(legalBasis.letter).toLowerCase()
  const legalTitle=String(legalBasis.title)
  const legalReference=`ARTIGO 482, alínea "${legalLetter}", da C.L.T. — ${legalTitle}`
  let body

  if(advert){
    body=`Em conformidade com o ${legalReference}, vimos adverti-lo em razão da ocorrência abaixo:\n\n`+
      `Motivo da ocorrência: ${reason}\n`+
      `Data(s) da ocorrência: ${request.incident_date}.\n\n`+
      'Esperamos que tome as providências necessárias para que a irregularidade acima não se repita. '+
      'A repetição ou prática de condutas semelhantes poderá resultar em medidas disciplinares mais severas, '+
      'observadas as circunstâncias do caso e a legislação aplicável.'
  }else{
    const days=Number(request.suspension_days||1)
    const duration=days===3?'3 (três) dias':'1 (um) dia'
    const start=request.suspension_start_date||nextDay(request.issue_date)
    const returnDate=request.suspension_return_date||addDays(start,days)
    body=`CPF: ${request.employee_cpf||'________________'}.\n\n`+
      `Pela presente fica V.Sa. suspenso das atividades laborais pelo período de ${duration}, com início em ${formatDateBR(start)}, `+
      `devendo retornar às atividades em ${formatDateBR(returnDate)}.\n\n`+
      `Fundamentação: ${legalReference}.\n`+
      `Motivo da ocorrência: ${reason}\n`+
      `Data(s) da ocorrência: ${request.incident_date}.\n\n`+
      'A reincidência ou a prática de nova conduta disciplinar poderá resultar em medidas mais severas, '+
      'observadas as circunstâncias do caso e a legislação aplicável.'
  }

  doc.text(doc.splitTextToSize(body,170),20,65)

  const ySign=advert?160:155
  doc.text('Atenciosamente,',20,ySign)
  if(signature){
    try{
      const details=await getImageDetails(signature)
      const size=getScaledDimensions(details.width,details.height,50,18)
      doc.addImage(signature,'PNG',20,ySign+2,size.width,size.height)
    }catch(error){
      console.warn('Não foi possível carregar a assinatura:',error)
    }
  }

  doc.line(20,ySign+20,95,ySign+20)
  doc.text('WE CAN BR – TRABALHO TEMPORARIO LTDA',20,ySign+25)
  doc.line(115,ySign+20,190,ySign+20)
  doc.text('Assinatura do Colaborador',115,ySign+25)
  if(!advert)doc.text('Ciente: ____/____/________',115,ySign+32)
  doc.line(20,ySign+45,95,ySign+45)
  doc.text('Testemunha 1',20,ySign+50)
  doc.line(115,ySign+45,190,ySign+45)
  doc.text('Testemunha 2',115,ySign+50)

  const fileName=localDocumentFileName(request,options.kind||'ORIGINAL')
  const blob=doc.output('blob')
  if(options.download!==false)doc.save(fileName)
  return {doc,blob,fileName}
}
