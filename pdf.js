const WECAN_LOGO_URL='https://lh3.googleusercontent.com/d/1Bz8i5enG3uEI8TPkqOwNgODsEU86pR5V'

function formatDateExtended(dateString){
  if(!dateString)return ''
  const [year,month,day]=dateString.split('-')
  const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${day} de ${months[Number(month)-1]} de ${year}`
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

window.generateDisciplinaryPDF=async function(request,signature){
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

  const code=request.penalty_reasons?.code||'H'
  const reason=request.penalty_reasons?.description||'Faltas injustificadas'
  let body

  if(advert){
    body=`Em conformidade com o ARTIGO 482 alínea ${code} da C.L.T., vimos adverti-lo pelo seguinte motivo:\n\n`+
      `Ato de indisciplina: ${reason} ocorridas em: ${request.incident_date}.\n\n`+
      'Esperamos que tome as providências necessárias para que a irregularidade acima não se repita. '+
      'Aproveitamos para esclarecer que a repetição ou prática de condutas semelhantes poderá resultar em penalidades '+
      'mais severas, inclusive a demissão por justa causa, conforme previsto no Artigo 482 e suas alíneas da CLT.'
  }else{
    const days=Number(request.suspension_days||1)
    const duration=days===3?'3 (três) dias':'1 (um) dia'
    body='Pela presente fica V.Sa. suspenso das atividades laborais em razão das irregularidades em virtude de '+
      `${reason} ocorridas nas datas: ${request.incident_date}.\n\n`+
      `Em razão da conduta, fica aplicada a suspensão disciplinar pelo período de ${duration}.\n\n`+
      'Lembramos que a reincidência deste comportamento poderá resultar em justa causa conforme artigo 482 da CLT.'
  }

  doc.text(doc.splitTextToSize(body,170),20,65)

  const ySign=160
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
  doc.line(20,ySign+45,95,ySign+45)
  doc.text('Testemunha 1',20,ySign+50)
  doc.line(115,ySign+45,190,ySign+45)
  doc.text('Testemunha 2',115,ySign+50)

  const safe=request.employee_name.replace(/[^a-zA-ZÀ-ÿ0-9_-]+/g,'_')
  doc.save(`${request.penalty_type}_${safe}_${request.issue_date}.pdf`)
}
