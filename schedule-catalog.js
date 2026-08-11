(() => {
  const DAY_TO_NUM = {DOM:0,SEG:1,TER:2,QUA:3,QUI:4,SEX:5,SAB:6}
  const NUM_TO_DAY = ['DOM','SEG','TER','QUA','QUI','SEX','SAB']
  const DAY_ORDER = ['SEG','TER','QUA','QUI','SEX','SAB','DOM']

  let catalog = []
  let aliases = []
  let pending = []
  let catalogLoaded = false
  let catalogLoading = null
  let importPreview = []

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().trim()
    .replace(/\bAS\b/g,'-')
    .replace(/[|_/\\]+/g,' ')
    .replace(/[^A-Z0-9:]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()

  const compact = value => normalize(value).replace(/[^A-Z0-9]/g,'')
  const clean = value => String(value ?? '').trim()
  const pct = value => value == null ? '—' : `${Math.round(Number(value) * 100)}%`

  function normalizeCode(value){
    const text = clean(value)
    if(!text) return ''
    if(/^\d+(?:\.0+)?$/.test(text)) return String(parseInt(text,10)).padStart(3,'0')
    const digits = text.match(/^0*\d+$/)?.[0]
    return digits ? String(parseInt(digits,10)).padStart(3,'0') : text.toUpperCase()
  }

  function parseTimeRange(text){
    const m = clean(text).replace(/\s+/g,'').match(/(\d{1,2}:\d{2})\s*(?:-|A|AS|ÀS|ATE|ATÉ)\s*(\d{1,2}:\d{2})/i)
    if(!m) return {start:null,end:null}
    const fix = t => {
      const [h,min] = t.split(':')
      return `${String(Number(h)).padStart(2,'0')}:${min}`
    }
    return {start:fix(m[1]),end:fix(m[2])}
  }

  function expandDayRange(text){
    const n = normalize(text).replace(/\s+/g,'')
    if(!n || n.includes('___')) return []
    const match = n.match(/(DOM|SEG|TER|QUA|QUI|SEX|SAB)(?:-|A)(DOM|SEG|TER|QUA|QUI|SEX|SAB)/)
    if(!match){
      const one = n.match(/DOM|SEG|TER|QUA|QUI|SEX|SAB/)
      return one ? [DAY_TO_NUM[one[0]]] : []
    }
    const start = DAY_ORDER.indexOf(match[1])
    const end = DAY_ORDER.indexOf(match[2])
    if(start < 0 || end < 0) return []
    const out=[]
    let i=start
    for(let guard=0;guard<7;guard++){
      out.push(DAY_TO_NUM[DAY_ORDER[i]])
      if(i===end) break
      i=(i+1)%7
    }
    return out
  }

  function parseJira(jira){
    const parts = clean(jira).split('|').map(x=>x.trim())
    if(parts.length < 4) return null
    const code = normalizeCode(parts[0])
    const baseDays = parts[1] || ''
    const baseTimes = parseTimeRange(parts[2] || '')
    const pattern = clean(parts[3]).toLowerCase()
    const rest = clean(parts[4] || '')
    const exceptionDays = clean(parts[5] || '')
    const exceptionTimes = parseTimeRange(parts[6] || '')
    const weekdays = [...new Set([...expandDayRange(baseDays),...expandDayRange(exceptionDays)])].sort((a,b)=>a-b)
    return {code,baseDays,baseStart:baseTimes.start,baseEnd:baseTimes.end,pattern,rest,exceptionDays,exceptionStart:exceptionTimes.start,exceptionEnd:exceptionTimes.end,weekdays}
  }

  function parseScaleText(scaleText){
    const text = clean(scaleText)
    const pattern = text.match(/\b(\d+\s*[xX]\s*\d+)\b/)?.[1]?.replace(/\s+/g,'').toLowerCase() || ''
    const hours = text.match(/\b(\d{2,3})\s*[hH]\b/)?.[1]
    const dayMatch = normalize(text).match(/(DOM|SEG|TER|QUA|QUI|SEX|SAB)\s*(?:A|-)\s*(DOM|SEG|TER|QUA|QUI|SEX|SAB)/)
    const baseDays = dayMatch ? `${dayMatch[1]}-${dayMatch[2]}` : ''
    const times = parseTimeRange(text)
    return {pattern,weeklyHours:hours?Number(hours):null,baseDays,baseStart:times.start,baseEnd:times.end,weekdays:expandDayRange(baseDays)}
  }

  function parseCatalogRow(source){
    const row={}
    Object.entries(source||{}).forEach(([key,value])=>row[normalize(key).replace(/\s+/g,'_')]=value)
    const code=normalizeCode(row.CODIGO||row.COD||row.CODIGO_INTERNO_DA_VAGA)
    const rawScale=clean(row.ESCALA||row.DESCRICAO||row.HORARIO)
    const jira=clean(row.NOMENCLATURA_JIRA||row.VFINAL||row.NOMENCLATURA)
    const legend=clean(row.LEGENDA||row.DESCRICAO_LEGENDA)
    const jiraParsed=parseJira(jira)
    const scaleParsed=parseScaleText(rawScale)
    const weekdays=[...new Set([...(jiraParsed?.weekdays||[]),...(scaleParsed.weekdays||[])])].sort((a,b)=>a-b)
    const pattern=jiraParsed?.pattern||scaleParsed.pattern||''
    const baseDays=jiraParsed?.baseDays||scaleParsed.baseDays||''
    const baseStart=jiraParsed?.baseStart||scaleParsed.baseStart||null
    const baseEnd=jiraParsed?.baseEnd||scaleParsed.baseEnd||null
    const review=!code||!weekdays.length||!pattern||!baseStart||!baseEnd
    const displayName = [code,baseDays,baseStart&&baseEnd?`${baseStart}-${baseEnd}`:'',pattern].filter(Boolean).join(' | ')
    const fingerprint=compact([code,rawScale,jira,legend].filter(Boolean).join(' '))
    return {
      code,rawScale,jira,legend,displayName,
      scalePattern:pattern,weeklyHours:scaleParsed.weeklyHours,
      baseDays,baseStart,baseEnd,restCode:jiraParsed?.rest||'',
      exceptionDays:jiraParsed?.exceptionDays||'',exceptionStart:jiraParsed?.exceptionStart||null,exceptionEnd:jiraParsed?.exceptionEnd||null,
      weekdays,review,fingerprint,
      errors:[...(!code?['Código ausente']:[]),...(!weekdays.length?['Dias não reconhecidos']:[]),...(!pattern?['Escala não reconhecida']:[]),...(!baseStart||!baseEnd?['Horário não reconhecido']:[])]
    }
  }

  function tokenSet(text){return new Set(normalize(text).split(' ').filter(Boolean))}
  function jaccard(a,b){
    const A=tokenSet(a),B=tokenSet(b)
    if(!A.size||!B.size) return 0
    let intersection=0
    A.forEach(x=>{if(B.has(x))intersection++})
    return intersection/(A.size+B.size-intersection)
  }
  function extractedFeatures(text){
    const norm=normalize(text)
    const times=[...norm.matchAll(/\b\d{1,2}:\d{2}\b/g)].map(m=>m[0].padStart(5,'0'))
    const pattern=norm.match(/\b\d+X\d+\b/)?.[0]||''
    const days=norm.match(/(DOM|SEG|TER|QUA|QUI|SEX|SAB)\s*(?:A|-)?\s*(DOM|SEG|TER|QUA|QUI|SEX|SAB)/)
    return {times,pattern,days:days?`${days[1]}-${days[2]}`:''}
  }
  function similarity(text,item){
    const q=normalize(text)
    if(!q) return 0
    const feat=extractedFeatures(q)
    const target=[item.source_code,item.display_name,item.raw_scale_text,item.jira_nomenclature,item.legend].filter(Boolean).join(' ')
    const tfeat=extractedFeatures(target)
    let score=jaccard(q,target)*0.35
    if(feat.pattern&&tfeat.pattern&&feat.pattern===tfeat.pattern) score+=0.20
    if(feat.days&&tfeat.days&&feat.days===tfeat.days) score+=0.20
    if(feat.times.length>=2&&tfeat.times.length>=2&&feat.times[0]===tfeat.times[0]&&feat.times[1]===tfeat.times[1]) score+=0.25
    return Math.min(1,score)
  }

  async function loadData(){
    if(catalogLoading) return catalogLoading
    catalogLoading=(async()=>{
      const [catRes,aliasRes]=await Promise.all([
        db.from('schedule_catalog').select('*').order('source_code'),
        db.from('schedule_catalog_aliases').select('*')
      ])
      if(catRes.error) throw catRes.error
      if(aliasRes.error) throw aliasRes.error
      catalog=catRes.data||[]
      aliases=aliasRes.data||[]
      catalogLoaded=true
      renderCatalogTable()
      populateEmployeeCatalogSelect()
      await loadPending()
      return catalog
    })().finally(()=>{catalogLoading=null})
    return catalogLoading
  }

  async function ready(){ if(!catalogLoaded) await loadData(); return catalog }

  function resolveImport(text){
    const raw=clean(text)
    if(!raw) return {status:'missing',schedule:null,confidence:null,raw:''}
    const codeMatch=raw.match(/(?:^|\b)(\d{1,4})(?:\b|\s*\|)/)
    if(codeMatch){
      const code=normalizeCode(codeMatch[1])
      const exactCode=catalog.find(x=>x.active&&x.source_code===code&&x.work_scale_id)
      if(exactCode) return {status:'matched',schedule:exactCode,confidence:1,raw,reason:'Código Shopee'}
    }
    const norm=compact(raw)
    const alias=aliases.find(a=>a.alias_normalized===norm)
    if(alias){
      const item=catalog.find(x=>x.id===alias.schedule_id&&x.active&&x.work_scale_id)
      if(item) return {status:'matched',schedule:item,confidence:1,raw,reason:'Correspondência já aprovada'}
    }
    const exact=catalog.find(x=>x.active&&x.work_scale_id&&[
      x.display_name,x.raw_scale_text,x.jira_nomenclature,x.legend
    ].some(v=>v&&compact(v)===norm))
    if(exact) return {status:'matched',schedule:exact,confidence:1,raw,reason:'Correspondência exata'}
    const ranked=catalog.filter(x=>x.active&&x.work_scale_id&&!x.requires_review)
      .map(item=>({item,score:similarity(raw,item)})).sort((a,b)=>b.score-a.score)
    const top=ranked[0]
    if(top&&top.score>=0.72) return {status:'suggested',schedule:top.item,confidence:top.score,raw,reason:'Semelhança'}
    return {status:'missing',schedule:null,confidence:top?.score||null,raw,reason:'Não reconhecido'}
  }

  async function createPending(employeeId,rawValue,suggestedId,confidence,effectiveFrom){
    const {error}=await db.rpc('upsert_employee_schedule_pending',{
      p_employee_id:employeeId,
      p_imported_value:rawValue||null,
      p_suggested_schedule_id:suggestedId||null,
      p_confidence:confidence??null,
      p_effective_from:effectiveFrom||null
    })
    if(error) throw error
    await loadPending()
  }

  async function clearPending(employeeId){
    const {error}=await db.rpc('clear_employee_schedule_pending',{p_employee_id:employeeId})
    if(error) throw error
    await loadPending()
  }

  function scheduleLabel(item){
    if(!item) return '—'
    return `${item.source_code} · ${item.scale_pattern||'Escala'} · ${item.base_days_text||'dias a revisar'}${item.base_start_time&&item.base_end_time?` · ${String(item.base_start_time).slice(0,5)}-${String(item.base_end_time).slice(0,5)}`:''}`
  }

  function injectUI(){
    const structure=document.getElementById('structure')
    const employees=document.getElementById('employees')
    if(!structure||!employees) return

    if(!document.getElementById('scheduleCatalogCard')){
      const block=document.createElement('div')
      block.id='scheduleCatalogCard'
      block.className='card schedule-catalog-card'
      block.innerHTML=`
        <div class="page-head">
          <div><h2>Catálogo de Horários Shopee</h2><p class="muted">Importe a tabela oficial uma vez. O NEXO usa código, nomenclatura Jira e descrição para reconhecer os horários dos colaboradores.</p></div>
          <button class="btn btn-light" type="button" onclick="NexoScheduleCatalog.downloadTemplate()">Modelo de catálogo</button>
        </div>
        <div class="schedule-catalog-kpis">
          <div class="stat"><span>Horários cadastrados</span><strong id="scheduleCatalogTotal">0</strong></div>
          <div class="stat"><span>Prontos para uso</span><strong id="scheduleCatalogReady">0</strong></div>
          <div class="stat"><span>Precisam de revisão</span><strong id="scheduleCatalogReview">0</strong></div>
          <div class="stat"><span>Aliases aprendidos</span><strong id="scheduleCatalogAliases">0</strong></div>
        </div>
        <div class="schedule-import-box">
          <div class="field"><label>Planilha oficial de horários</label><input id="scheduleCatalogFile" type="file" class="input" accept=".xlsx,.xls,.csv"></div>
          <button id="scheduleCatalogReadBtn" class="btn btn-primary" type="button" onclick="NexoScheduleCatalog.readCatalogFile()">Conferir catálogo</button>
        </div>
        <div id="scheduleCatalogPreview" class="hidden"></div>
        <div class="toolbar schedule-catalog-toolbar">
          <input id="scheduleCatalogSearch" class="input" placeholder="Buscar código, escala, Jira ou legenda...">
          <select id="scheduleCatalogStatus" class="input"><option value="">Todos</option><option value="ready">Prontos</option><option value="review">Revisão</option><option value="inactive">Inativos</option></select>
          <button class="btn btn-light" type="button" onclick="NexoScheduleCatalog.load()">Atualizar</button>
        </div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Escala / jornada</th><th>Folga</th><th>Exceção</th><th>Status</th><th>Ações</th></tr></thead><tbody id="scheduleCatalogRows"></tbody></table></div>`
      structure.appendChild(block)
      document.getElementById('scheduleCatalogSearch').addEventListener('input',renderCatalogTable)
      document.getElementById('scheduleCatalogStatus').addEventListener('change',renderCatalogTable)
    }

    if(!document.getElementById('schedulePendingCard')){
      const importCard=employees.querySelector('.card')
      const card=document.createElement('div')
      card.id='schedulePendingCard'
      card.className='card schedule-pending-card'
      card.innerHTML=`
        <div class="page-head">
          <div><h2>Pendências de horário</h2><p class="muted">Colaboradores podem ser importados sem horário. Resolva aqui em lote sem reabrir cadastro por cadastro.</p></div>
          <div class="stat compact"><span>Pendentes</span><strong id="schedulePendingCount">0</strong></div>
        </div>
        <div id="schedulePendingNotice" class="notice schedule-note">Colaboradores sem horário não entram no denominador do ABS até a regularização.</div>
        <div class="toolbar"><input id="schedulePendingSearch" class="input" placeholder="Buscar colaborador, MAT ou valor importado..."><button class="btn btn-light" type="button" onclick="NexoScheduleCatalog.loadPending()">Atualizar</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Colaborador</th><th>Valor importado</th><th>Sugestão</th><th>Vigência</th><th>Ação</th></tr></thead><tbody id="schedulePendingRows"></tbody></table></div>
        <div class="schedule-pending-actions"><label><input id="scheduleRememberBulk" type="checkbox" checked> Lembrar correspondências aprovadas</label><button class="btn btn-primary" type="button" onclick="NexoScheduleCatalog.resolveSelected()">Aplicar selecionados</button></div>`
      importCard?.insertAdjacentElement('afterend',card)
      document.getElementById('schedulePendingSearch').addEventListener('input',renderPending)
    }

    // Campo simples no cadastro individual, antes da escala legada.
    const scaleSelect=document.getElementById('employeeScale')
    if(scaleSelect&&!document.getElementById('employeeScheduleCatalog')){
      const field=scaleSelect.closest('.field')
      const catField=document.createElement('div')
      catField.className='field'
      catField.innerHTML=`<label>Horário Shopee <span class="muted">(opcional)</span></label><select id="employeeScheduleCatalog" class="input"><option value="">Sem horário definido</option></select><small class="muted">Ao escolher um horário do catálogo, a escala usada na Presença/ABS é preenchida automaticamente.</small>`
      field?.insertAdjacentElement('beforebegin',catField)
      scaleSelect.required=false
      field.querySelector('label').textContent='Escala manual / legado (opcional)'
      document.getElementById('employeeScheduleCatalog').addEventListener('change',event=>{
        const item=catalog.find(x=>x.id===event.target.value)
        if(item?.work_scale_id) scaleSelect.value=item.work_scale_id
        if(!event.target.value) scaleSelect.value=''
      })
    }

    // Ajuste de texto da importação sem depender de alteração no HTML-base.
    const importHelp=employees.querySelector('.card .page-head .muted')
    if(importHelp) importHelp.textContent='Importe os colaboradores pela MAT. Horário/escala não é obrigatório; itens não reconhecidos ficam pendentes para aprovação.'
    const headers=[...employees.querySelectorAll('#employeeImportPreview th')]
    const scaleHeader=headers.find(th=>/Turno\/escala/i.test(th.textContent||''))
    if(scaleHeader) scaleHeader.textContent='Horário / escala'
  }

  function populateEmployeeCatalogSelect(){
    const select=document.getElementById('employeeScheduleCatalog')
    if(!select) return
    const current=select.value
    select.innerHTML='<option value="">Sem horário definido</option>'+catalog.filter(x=>x.active&&x.work_scale_id&&!x.requires_review).map(item=>`<option value="${item.id}">${escapeHTML(scheduleLabel(item))}</option>`).join('')
    if([...select.options].some(o=>o.value===current)) select.value=current
  }

  function renderCatalogTable(){
    const rowsEl=document.getElementById('scheduleCatalogRows')
    if(!rowsEl) return
    const q=normalize(document.getElementById('scheduleCatalogSearch')?.value||'')
    const status=document.getElementById('scheduleCatalogStatus')?.value||''
    const filtered=catalog.filter(item=>{
      if(status==='ready'&&(item.requires_review||!item.active||!item.work_scale_id)) return false
      if(status==='review'&&!item.requires_review) return false
      if(status==='inactive'&&item.active) return false
      if(q&&!normalize(`${item.source_code} ${item.display_name||''} ${item.raw_scale_text||''} ${item.jira_nomenclature||''} ${item.legend||''}`).includes(q)) return false
      return true
    })
    rowsEl.innerHTML=filtered.map(item=>{
      const exception=item.exception_days_text&&!item.exception_days_text.includes('___')?`${escapeHTML(item.exception_days_text)}${item.exception_start_time?` · ${String(item.exception_start_time).slice(0,5)}-${String(item.exception_end_time).slice(0,5)}`:''}`:'—'
      return `<tr>
        <td><strong>${escapeHTML(item.source_code)}</strong><br><small>${escapeHTML(item.scale_pattern||'—')}</small></td>
        <td><strong>${escapeHTML(item.base_days_text||'—')}</strong><br><small>${item.base_start_time?`${String(item.base_start_time).slice(0,5)}-${String(item.base_end_time).slice(0,5)}`:'Horário a revisar'}</small></td>
        <td>${escapeHTML(item.rest_code||'—')}</td>
        <td>${exception}</td>
        <td><span class="badge ${item.requires_review?'badge-yellow':item.active?'badge-green':'badge-gray'}">${item.requires_review?'Revisar':item.active?'Pronto':'Inativo'}</span></td>
        <td><div class="actions"><button class="btn btn-light" onclick="NexoScheduleCatalog.edit('${item.id}')">Editar</button><button class="btn btn-light" onclick="NexoScheduleCatalog.toggle('${item.id}',${!item.active})">${item.active?'Inativar':'Ativar'}</button></div></td>
      </tr>`
    }).join('')||'<tr><td colspan="6" class="empty">Nenhum horário encontrado.</td></tr>'
    const readyCount=catalog.filter(x=>x.active&&!x.requires_review&&x.work_scale_id).length
    if(document.getElementById('scheduleCatalogTotal')) document.getElementById('scheduleCatalogTotal').textContent=catalog.length
    if(document.getElementById('scheduleCatalogReady')) document.getElementById('scheduleCatalogReady').textContent=readyCount
    if(document.getElementById('scheduleCatalogReview')) document.getElementById('scheduleCatalogReview').textContent=catalog.filter(x=>x.requires_review).length
    if(document.getElementById('scheduleCatalogAliases')) document.getElementById('scheduleCatalogAliases').textContent=aliases.length
  }

  async function readCatalogFile(){
    const file=document.getElementById('scheduleCatalogFile')?.files?.[0]
    if(!file) return alert('Selecione a planilha oficial de horários.')
    if(!window.XLSX) return alert('A biblioteca de planilhas ainda está carregando. Aguarde um instante e tente novamente.')
    const button=document.getElementById('scheduleCatalogReadBtn')
    button.disabled=true;button.textContent='Lendo...'
    try{
      const buffer=await file.arrayBuffer()
      const book=XLSX.read(buffer,{type:'array',cellDates:true})
      const target=book.SheetNames.find(name=>normalize(name).includes('TABELA DE HORARIOS'))||book.SheetNames.find(name=>normalize(name).includes('HORARIO'))||book.SheetNames[0]
      const sheet=book.Sheets[target]
      const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false})
      const headerIndex=grid.findIndex(line=>{
        const normalized=line.map(cell=>normalize(cell).replace(/\s+/g,'_'))
        return normalized.some(cell=>cell==='CODIGO'||cell==='COD') && normalized.some(cell=>cell==='ESCALA')
      })
      if(headerIndex<0) throw new Error('Não encontrei uma linha de cabeçalho contendo Código e ESCALA.')
      const headers=grid[headerIndex].map((cell,index)=>clean(cell)||`COLUNA_${index+1}`)
      const raw=grid.slice(headerIndex+1).map(line=>Object.fromEntries(headers.map((header,index)=>[header,line[index]??'']))).filter(row=>Object.values(row).some(value=>clean(value)))
      importPreview=raw.map(parseCatalogRow).filter(row=>row.code||row.rawScale||row.jira)
      renderCatalogPreview()
    }catch(error){alert(`Não foi possível ler o catálogo: ${error.message}`)}
    finally{button.disabled=false;button.textContent='Conferir catálogo'}
  }

  function renderCatalogPreview(){
    const box=document.getElementById('scheduleCatalogPreview')
    if(!box) return
    const readyRows=importPreview.filter(x=>!x.review)
    const reviewRows=importPreview.filter(x=>x.review)
    box.classList.remove('hidden')
    box.innerHTML=`
      <div class="schedule-preview-summary"><div class="stat"><span>Encontrados</span><strong>${importPreview.length}</strong></div><div class="stat"><span>Prontos</span><strong>${readyRows.length}</strong></div><div class="stat"><span>Revisar</span><strong>${reviewRows.length}</strong></div></div>
      <div class="table-wrap schedule-preview-table"><table class="table"><thead><tr><th>Código</th><th>Interpretado</th><th>Escala original</th><th>Status</th></tr></thead><tbody>${importPreview.slice(0,120).map(row=>`<tr><td><strong>${escapeHTML(row.code||'—')}</strong></td><td>${escapeHTML(row.displayName||'—')}</td><td>${escapeHTML(row.rawScale||row.jira||'—')}</td><td><span class="badge ${row.review?'badge-yellow':'badge-green'}">${row.review?escapeHTML(row.errors.join(', ')):'Pronto'}</span></td></tr>`).join('')}</tbody></table></div>
      ${importPreview.length>120?`<p class="muted">Prévia limitada aos primeiros 120 registros. Todos os ${importPreview.length} serão processados.</p>`:''}
      <div class="actions"><button class="btn btn-primary" onclick="NexoScheduleCatalog.importCatalog()">Importar ${importPreview.length} horários</button></div>`
  }

  async function importCatalog(){
    if(!importPreview.length) return
    if(!confirm(`Importar/atualizar ${importPreview.length} horários no catálogo Shopee?`)) return
    let ok=0,failed=0
    const queue=[...importPreview]
    const workers=Array.from({length:Math.min(8,queue.length)},async()=>{
      while(queue.length){
        const row=queue.shift()
        try{
          const {error}=await db.rpc('upsert_schedule_catalog_item',{
            p_source_code:row.code,
            p_display_name:row.displayName||null,
            p_raw_scale_text:row.rawScale||null,
            p_jira_nomenclature:row.jira||null,
            p_legend:row.legend||null,
            p_scale_pattern:row.scalePattern||null,
            p_weekly_hours:row.weeklyHours||null,
            p_base_days_text:row.baseDays||null,
            p_base_start_time:row.baseStart||null,
            p_base_end_time:row.baseEnd||null,
            p_rest_code:row.restCode||null,
            p_exception_days_text:row.exceptionDays||null,
            p_exception_start_time:row.exceptionStart||null,
            p_exception_end_time:row.exceptionEnd||null,
            p_normalized_fingerprint:row.fingerprint||null,
            p_work_weekdays:row.weekdays,
            p_requires_review:row.review,
            p_active:true
          })
          if(error) throw error
          ok++
        }catch(_){failed++}
      }
    })
    await Promise.all(workers)
    importPreview=[]
    document.getElementById('scheduleCatalogPreview')?.classList.add('hidden')
    await load(true)
    if(typeof loadManagement==='function') await loadManagement()
    alert(`Catálogo processado.\nSucesso: ${ok}\nFalhas: ${failed}\nItens que não puderam ser interpretados ficaram marcados para revisão.`)
  }

  async function load(force=false){
    if(force){catalogLoaded=false;catalogLoading=null}
    await ready()
    renderCatalogTable()
    await loadPending()
  }

  async function loadPending(){
    const body=document.getElementById('schedulePendingRows')
    if(!body) return
    const [pRes,eRes]=await Promise.all([
      db.from('employee_schedule_pending').select('*').eq('status','pending').order('created_at',{ascending:false}),
      db.from('employees').select('id,registration,full_name,admission_date,operation_id,operations(cost_center)').order('full_name')
    ])
    if(pRes.error){body.innerHTML=`<tr><td colspan="6" class="empty">${escapeHTML(pRes.error.message)}</td></tr>`;return}
    if(eRes.error){body.innerHTML=`<tr><td colspan="6" class="empty">${escapeHTML(eRes.error.message)}</td></tr>`;return}
    const empMap=new Map((eRes.data||[]).map(e=>[e.id,e]))
    pending=(pRes.data||[]).map(p=>({...p,employee:empMap.get(p.employee_id)}))
    renderPending()
  }

  function candidateOptions(item){
    const raw=item.imported_value||''
    const ranked=catalog.filter(x=>x.active&&x.work_scale_id&&!x.requires_review)
      .map(schedule=>({schedule,score:similarity(raw,schedule)})).sort((a,b)=>b.score-a.score).slice(0,6)
    if(item.suggested_schedule_id&&!ranked.some(x=>x.schedule.id===item.suggested_schedule_id)){
      const suggested=catalog.find(x=>x.id===item.suggested_schedule_id)
      if(suggested) ranked.unshift({schedule:suggested,score:Number(item.confidence||0)})
    }
    return ranked
  }

  function renderPending(){
    const body=document.getElementById('schedulePendingRows')
    if(!body) return
    const q=normalize(document.getElementById('schedulePendingSearch')?.value||'')
    const rows=pending.filter(item=>!q||normalize(`${item.employee?.registration||''} ${item.employee?.full_name||''} ${item.imported_value||''}`).includes(q))
    body.innerHTML=rows.map(item=>{
      const candidates=candidateOptions(item)
      const selected=item.suggested_schedule_id||candidates[0]?.schedule.id||''
      return `<tr>
        <td><input type="checkbox" class="schedule-pending-check" value="${item.id}" ${selected?'checked':''}></td>
        <td><strong>${escapeHTML(item.employee?.full_name||'—')}</strong><br><small>${escapeHTML(item.employee?.registration||'')} · ${escapeHTML(item.employee?.operations?.cost_center||'Sem operação')}</small></td>
        <td>${escapeHTML(item.imported_value||'Não informado')} ${item.confidence?`<br><small>melhor semelhança: ${pct(item.confidence)}</small>`:''}</td>
        <td><select class="input schedule-pending-select" data-id="${item.id}"><option value="">Escolha...</option>${candidates.map(c=>`<option value="${c.schedule.id}" ${c.schedule.id===selected?'selected':''}>${escapeHTML(scheduleLabel(c.schedule))}${c.score?` · ${pct(c.score)}`:''}</option>`).join('')}</select></td>
        <td><input type="date" class="input schedule-pending-date" data-id="${item.id}" value="${item.effective_from||item.employee?.admission_date||''}"></td>
        <td><button class="btn btn-primary" onclick="NexoScheduleCatalog.resolveOne('${item.id}')">Aprovar</button></td>
      </tr>`
    }).join('')||'<tr><td colspan="6" class="empty">Nenhum colaborador com horário pendente. 🎉</td></tr>'
    if(document.getElementById('schedulePendingCount')) document.getElementById('schedulePendingCount').textContent=pending.length
  }

  async function resolveOne(id,remember=true){
    const select=document.querySelector(`.schedule-pending-select[data-id="${CSS.escape(id)}"]`)
    const date=document.querySelector(`.schedule-pending-date[data-id="${CSS.escape(id)}"]`)
    if(!select?.value) return alert('Escolha o horário que deve ser aplicado.')
    const {error}=await db.rpc('resolve_employee_schedule_pending',{
      p_pending_id:id,p_schedule_id:select.value,p_effective_from:date?.value||null,p_remember_alias:remember
    })
    if(error) return alert(error.message)
    await loadPending()
    if(typeof loadManagement==='function') await loadManagement()
    if(typeof loadDashboard==='function') await loadDashboard()
  }

  async function resolveSelected(){
    const ids=[...document.querySelectorAll('.schedule-pending-check:checked')].map(x=>x.value)
    if(!ids.length) return alert('Selecione ao menos uma pendência.')
    const remember=document.getElementById('scheduleRememberBulk')?.checked!==false
    let ok=0,fail=0
    for(const id of ids){
      const select=document.querySelector(`.schedule-pending-select[data-id="${CSS.escape(id)}"]`)
      const date=document.querySelector(`.schedule-pending-date[data-id="${CSS.escape(id)}"]`)
      if(!select?.value){fail++;continue}
      const {error}=await db.rpc('resolve_employee_schedule_pending',{p_pending_id:id,p_schedule_id:select.value,p_effective_from:date?.value||null,p_remember_alias:remember})
      error?fail++:ok++
    }
    await loadPending()
    if(typeof loadManagement==='function') await loadManagement()
    if(typeof loadDashboard==='function') await loadDashboard()
    alert(`Pendências processadas.\nSucesso: ${ok}\nNão processadas: ${fail}`)
  }

  async function toggle(id,active){
    const {error}=await db.from('schedule_catalog').update({active,updated_at:new Date().toISOString()}).eq('id',id)
    if(error) return alert(error.message)
    const item=catalog.find(x=>x.id===id)
    if(item?.work_scale_id) await db.from('work_scales').update({active}).eq('id',item.work_scale_id)
    await load(true)
  }

  function edit(id){
    const item=catalog.find(x=>x.id===id)
    if(!item) return
    const checked=new Set(item.work_weekdays||[])
    const overlay=document.createElement('div')
    overlay.className='schedule-modal'
    overlay.innerHTML=`<div class="schedule-modal-card"><div class="page-head"><div><h2>Revisar horário ${escapeHTML(item.source_code)}</h2><p class="muted">Ajuste apenas o necessário. O texto original permanece salvo.</p></div><button class="btn btn-light" id="scheduleEditClose">Fechar</button></div>
      <div class="grid-2"><div class="field"><label>Escala</label><input id="scheduleEditPattern" class="input" value="${escapeHTML(item.scale_pattern||'')}"></div><div class="field"><label>Código de folga</label><input id="scheduleEditRest" class="input" value="${escapeHTML(item.rest_code||'')}"></div><div class="field"><label>Dias base</label><input id="scheduleEditDays" class="input" value="${escapeHTML(item.base_days_text||'')}"></div><div class="field"><label>Horário base</label><div class="schedule-time-pair"><input id="scheduleEditStart" type="time" class="input" value="${item.base_start_time?String(item.base_start_time).slice(0,5):''}"><input id="scheduleEditEnd" type="time" class="input" value="${item.base_end_time?String(item.base_end_time).slice(0,5):''}"></div></div></div>
      <div class="field"><label>Dias realmente trabalhados</label><div class="weekday-grid">${[1,2,3,4,5,6,0].map(day=>`<label><input type="checkbox" class="schedule-edit-weekday" value="${day}" ${checked.has(day)?'checked':''}> ${NUM_TO_DAY[day]}</label>`).join('')}</div><small class="muted">Esses dias alimentam Controle de Presença e ABS.</small></div>
      <div class="field"><label>Legenda original</label><textarea id="scheduleEditLegend" class="input" rows="3">${escapeHTML(item.legend||'')}</textarea></div>
      <button class="btn btn-primary" id="scheduleEditSave">Salvar revisão</button></div>`
    document.body.appendChild(overlay)
    overlay.querySelector('#scheduleEditClose').onclick=()=>overlay.remove()
    overlay.querySelector('#scheduleEditSave').onclick=async()=>{
      const weekdays=[...overlay.querySelectorAll('.schedule-edit-weekday:checked')].map(x=>Number(x.value))
      if(!weekdays.length) return alert('Selecione ao menos um dia trabalhado.')
      const {error}=await db.rpc('upsert_schedule_catalog_item',{
        p_source_code:item.source_code,p_display_name:item.display_name,p_raw_scale_text:item.raw_scale_text,p_jira_nomenclature:item.jira_nomenclature,
        p_legend:overlay.querySelector('#scheduleEditLegend').value.trim()||null,p_scale_pattern:overlay.querySelector('#scheduleEditPattern').value.trim()||null,p_weekly_hours:item.weekly_hours,
        p_base_days_text:overlay.querySelector('#scheduleEditDays').value.trim()||null,p_base_start_time:overlay.querySelector('#scheduleEditStart').value||null,p_base_end_time:overlay.querySelector('#scheduleEditEnd').value||null,
        p_rest_code:overlay.querySelector('#scheduleEditRest').value.trim()||null,p_exception_days_text:item.exception_days_text,p_exception_start_time:item.exception_start_time,p_exception_end_time:item.exception_end_time,
        p_normalized_fingerprint:item.normalized_fingerprint,p_work_weekdays:weekdays,p_requires_review:false,p_active:item.active
      })
      if(error) return alert(error.message)
      overlay.remove();await load(true);if(typeof loadManagement==='function') await loadManagement()
    }
  }

  function downloadTemplate(){
    if(!window.XLSX) return alert('A biblioteca de planilhas ainda está carregando.')
    const headers=['Código','ESCALA','Nomenclatura Jira','LEGENDA']
    const sample=[['005','6x1 - 220h - SEG A SAB - 05:25 às 13:45','005 | SEG-SAB | 05:25-13:45 | 6x1 | F1___ | ___-___ | __:__-__:__','TRABALHA DE SEG-SAB DAS 05:25-13:45 COM FOLGA EM DOM']]
    const ws=XLSX.utils.aoa_to_sheet([headers,...sample]);ws['!cols']=[{wch:12},{wch:48},{wch:70},{wch:90}]
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Tabela de horários');XLSX.writeFile(wb,'MODELO_CATALOGO_HORARIOS_SHOPEE.xlsx')
  }

  window.NexoScheduleCatalog={
    ready,load,loadPending,resolveImport,createPending,clearPending,scheduleLabel,
    readCatalogFile,importCatalog,downloadTemplate,resolveOne,resolveSelected,toggle,edit,
    get catalog(){return catalog},get aliases(){return aliases}
  }

  injectUI()
  load().catch(error=>console.warn('NEXO Catálogo de Horários:',error))
})()
