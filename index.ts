window.generateDisciplinaryPDF = async function(request, signature){
  const {jsPDF}=window.jspdf,doc=new jsPDF(),advert=request.penalty_type.toLowerCase().includes('advert')
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(advert?'ADVERTÊNCIA DISCIPLINAR':'CARTA DE SUSPENSÃO',105,25,{align:'center'})
  doc.setFontSize(10);doc.setFont('helvetica','normal');doc.text(`${request.location}, ${formatDate(request.issue_date)}`,20,40);doc.setFont('helvetica','bold');doc.text(`${advert?'ADVERTIMOS':'SUSPENDEMOS'}: ${request.employee_name.toUpperCase()}`,20,52);doc.setFont('helvetica','normal')
  const reason=request.penalty_reasons?.description||'Conduta informada',code=request.penalty_reasons?.code||''
  const body=advert?`Em conformidade com o artigo 482, alínea ${code}, da CLT, aplicamos advertência disciplinar pelo seguinte motivo: ${reason}. Ocorrência em ${request.incident_date}.\n\nEsperamos que a irregularidade não se repita. A reincidência poderá resultar em medidas disciplinares mais severas.`:`Aplicamos suspensão disciplinar em razão de: ${reason}. Ocorrência em ${request.incident_date}.\n\nO período de suspensão será de ${request.suspension_days===3?'3 (três) dias':'1 (um) dia'}. A reincidência poderá resultar em medidas disciplinares mais severas.`
  doc.text(doc.splitTextToSize(body,170),20,66);doc.text('Atenciosamente,',20,155)
  if(signature)try{doc.addImage(signature,'PNG',20,158,50,18)}catch(_){ }
  doc.line(20,180,95,180);doc.text('WE CAN BR – TRABALHO TEMPORÁRIO LTDA',20,186);doc.line(115,180,190,180);doc.text('Assinatura do Colaborador',115,186);doc.line(20,210,95,210);doc.text('Testemunha 1',20,216);doc.line(115,210,190,210);doc.text('Testemunha 2',115,216)
  const safe=request.employee_name.replace(/[^a-zA-ZÀ-ÿ0-9_-]+/g,'_');doc.save(`${request.penalty_type}_${safe}_${request.issue_date}.pdf`)
}
