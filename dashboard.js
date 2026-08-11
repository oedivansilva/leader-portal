let dashboardCharts = {}
window.dashboardCharts = dashboardCharts

if (window.Chart) {
  Chart.defaults.font.family = "'Poppins', 'Segoe UI', Arial, sans-serif"
  Chart.defaults.color = '#6F7480'
  Chart.defaults.borderColor = '#ECECF0'
}


const absCodes = ['AF', 'AL', 'AM', 'F', 'FJ', 'NS', 'justificada', 'injustificada']
const justifiedCodes = ['AM', 'FJ', 'justificada']
const unjustifiedCodes = ['F', 'NS', 'injustificada']

function replaceChart(key, element, config) {
  dashboardCharts[key]?.destroy()
  dashboardCharts[key] = new Chart(element, config)
}

function monthRange(value) {
  const [year, month] = value.split('-').map(Number)
  return {
    start: `${value}-01`,
    end: new Date(year, month, 1).toISOString().slice(0, 10),
    year,
    month
  }
}

function eachDate(start, end, callback) {
  for (
    let date = new Date(`${start}T12:00:00`), limit = new Date(`${end}T12:00:00`);
    date < limit;
    date.setDate(date.getDate() + 1)
  ) {
    callback(new Date(date))
  }
}

async function loadDashboard() {
  const selectedMonth = dashboardMonth.value || new Date().toISOString().slice(0, 7)
  const operation = dashboardOperation.value
  const { start, end } = monthRange(selectedMonth)

  const [
    metricsResult,
    requestsResult,
    employeesResult,
    daysResult,
    historyResult,
    absencesResult,
    scalesResult
  ] = await Promise.all([
    db.from('disciplinary_metrics').select('*').gte('issue_date', start).lt('issue_date', end),
    db.from('disciplinary_requests').select('status,operation_id').gte('issue_date', start).lt('issue_date', end),
    db.from('employees').select('id,registration,full_name,operation_id,scale_id,admission_date,dismissal_date,termination_type'),
    db.from('scale_work_days').select('*'),
    db.from('employee_scale_history').select('*').lte('effective_from', end).or(`effective_to.is.null,effective_to.gte.${start}`),
    db.from('attendance_absences').select('absence_type,absence_date,operation_id,employee_id').gte('absence_date', start).lt('absence_date', end),
    db.from('work_scales').select('id,name,description').order('name')
  ])

  const results = [metricsResult, requestsResult, employeesResult, daysResult, historyResult, absencesResult, scalesResult]
  const error = results.find(result => result.error)?.error
  if (error) return alert(error.message)

  let rows = metricsResult.data || []
  let requests = requestsResult.data || []
  let employees = employeesResult.data || []
  let absences = (absencesResult.data || []).filter(item => absCodes.includes(item.absence_type))
  const scales = scalesResult.data || []

  if (operation) {
    rows = rows.filter(item => item.operation_id === operation)
    requests = requests.filter(item => item.operation_id === operation)
    employees = employees.filter(item => item.operation_id === operation)
    absences = absences.filter(item => item.operation_id === operation)
  }

  const warnings = rows.filter(row => row.penalty_type.toLowerCase().includes('advert'))
  const suspensions = rows.filter(row => row.penalty_type.toLowerCase().includes('susp'))
  const applied = rows.filter(row => row.applied_date)
  const average = key => {
    const values = applied.map(row => Number(row[key])).filter(Number.isFinite)
    return values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)} dias` : '—'
  }

  metricWarnings.textContent = warnings.length
  metricSuspensions.textContent = suspensions.length
  metricApplicationTime.textContent = average('days_from_oldest')
  metricOldest.textContent = average('days_from_oldest')
  metricNewest.textContent = average('days_from_newest')
  metricOccurrenceAverage.textContent = average('average_days_per_occurrence')

  const dayMap = (daysResult.data || []).reduce((map, item) => {
    ;(map[item.scale_id] ??= []).push(item.weekday)
    return map
  }, {})
  const history = historyResult.data || []
  const employeeMap = new Map(employees.map(employee => [employee.id, employee]))
  const scaleMap = new Map(scales.map(scale => [scale.id, scale]))

  const scaleAt = (employee, date) => history
    .filter(item => item.employee_id === employee.id && item.effective_from <= date && (!item.effective_to || item.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.scale_id || employee.scale_id

  let planned = 0
  const plannedEmployeeIds = new Set()
  const plannedByOperation = {}
  const plannedEmployeesByOperation = {}

  employees.forEach(employee => {
    eachDate(start, end, date => {
      const iso = date.toISOString().slice(0, 10)
      const weekdays = dayMap[scaleAt(employee, iso)] || []
      if (
        iso >= employee.admission_date &&
        (!employee.dismissal_date || iso <= employee.dismissal_date) &&
        weekdays.includes(date.getDay())
      ) {
        planned++
        plannedEmployeeIds.add(employee.id)

        const operationLabel = operations.find(current => current.id === employee.operation_id)?.cost_center || 'Sem operação'
        plannedByOperation[operationLabel] = (plannedByOperation[operationLabel] || 0) + 1
        ;(plannedEmployeesByOperation[operationLabel] ||= new Set()).add(employee.id)
      }
    })
  })

  const plannedEmployeeCountByOperation = Object.fromEntries(
    Object.entries(plannedEmployeesByOperation).map(([label, ids]) => [label, ids.size])
  )
  const consideredEmployees = plannedEmployeeIds.size

  metricJustified.textContent = absences.filter(item => justifiedCodes.includes(item.absence_type)).length
  metricUnjustified.textContent = absences.filter(item => unjustifiedCodes.includes(item.absence_type)).length
  metricAbs.textContent = planned ? `${(absences.length / planned * 100).toFixed(2)}%` : 'Escalas pendentes'

  const statusCounts = {
    Pendente: requests.filter(item => !['gerado', 'aplicado'].includes(item.status)).length,
    Gerado: requests.filter(item => item.status === 'gerado').length,
    Aplicado: requests.filter(item => item.status === 'aplicado').length
  }

  replaceChart('status', statusChart, {
    type: 'pie',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: ['#FFB000', '#EE4D2D', '#2EAE67']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      radius: '78%',
      plugins: { legend: { position: 'bottom' } }
    }
  })

  const absenceByOperation = absences.reduce((grouped, item) => {
    const label = operations.find(current => current.id === item.operation_id)?.cost_center || 'Sem operação'
    grouped[label] = (grouped[label] || 0) + 1
    return grouped
  }, {})

  const operationLabels = Object.keys(absenceByOperation)
  const operationAbsences = Object.values(absenceByOperation)

  replaceChart('abs', absOperationChart, {
    type: 'bar',
    data: {
      labels: operationLabels,
      datasets: [{ label: 'Faltas', data: operationAbsences, backgroundColor: '#EE4D2D', borderRadius: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      datasets: { bar: { maxBarThickness: 74, categoryPercentage: .72, barPercentage: .72 } }
    }
  })

  const measuresBy = labeler => Object.values(rows.reduce((grouped, row) => {
    const label = labeler(row)
    grouped[label] = grouped[label] || { label, value: 0 }
    grouped[label].value++
    return grouped
  }, {}))

  const regions = measuresBy(row => row.city_state || 'Sem região')
  const leaders = measuresBy(row => profiles.find(profile => profile.id === row.leader_id)?.full_name || 'Sem líder')

  replaceChart('region', regionChart, {
    type: 'bar',
    data: {
      labels: regions.map(item => item.label),
      datasets: [{ label: 'Medidas', data: regions.map(item => item.value), backgroundColor: '#F56B3F', borderRadius: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      datasets: { bar: { maxBarThickness: 74, categoryPercentage: .72, barPercentage: .72 } }
    }
  })

  replaceChart('leader', leaderChart, {
    type: 'bar',
    data: {
      labels: leaders.map(item => item.label),
      datasets: [{ label: 'Medidas', data: leaders.map(item => item.value), backgroundColor: '#EE4D2D', borderRadius: 8 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      datasets: { bar: { maxBarThickness: 48, categoryPercentage: .72, barPercentage: .72 } }
    }
  })

  // Agrupa F/NS e AM pela escala vigente exatamente na data da ocorrência.
  const absenceByScale = absences
    .filter(item => ['F', 'NS', 'AM'].includes(item.absence_type))
    .reduce((grouped, item) => {
      const employee = employeeMap.get(item.employee_id)
      const scaleId = employee ? scaleAt(employee, item.absence_date) : null
      const scale = scaleMap.get(scaleId)
      const label = scale?.description || scale?.name || 'Sem turno / escala'
      grouped[label] ||= { label, absences: 0, medicalCertificates: 0 }
      if (item.absence_type === 'AM') grouped[label].medicalCertificates++
      else grouped[label].absences++
      return grouped
    }, {})

  const scaleAbsenceRows = Object.values(absenceByScale)
    .sort((a, b) => (b.absences + b.medicalCertificates) - (a.absences + a.medicalCertificates))
  const hasScaleAbsenceData = scaleAbsenceRows.length > 0
  const scaleAbsenceLabels = hasScaleAbsenceData ? scaleAbsenceRows.map(item => item.label) : ['Sem registros no período']

  replaceChart('shiftAbsence', shiftAbsenceChart, {
    type: 'bar',
    data: {
      labels: scaleAbsenceLabels,
      datasets: [
        {
          label: 'Faltas (F/NS)',
          data: hasScaleAbsenceData ? scaleAbsenceRows.map(item => item.absences) : [0],
          backgroundColor: '#D83E22'
        },
        {
          label: 'Atestados (AM)',
          data: hasScaleAbsenceData ? scaleAbsenceRows.map(item => item.medicalCertificates) : [0],
          backgroundColor: '#2EC4B6'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: items => items[0]?.label || ''
          }
        }
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback(value) {
              const label = this.getLabelForValue(value)
              return label.length > 18 ? `${label.slice(0, 18)}…` : label
            }
          }
        },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      },
      datasets: { bar: { maxBarThickness: 44, categoryPercentage: .74, barPercentage: .82 } }
    }
  })

  const activeAt = date => employees.filter(employee =>
    employee.admission_date <= date && (!employee.dismissal_date || employee.dismissal_date >= date)
  ).length
  const headStart = activeAt(start)
  const lastDay = new Date(new Date(`${end}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10)
  const headEnd = activeAt(lastDay)
  const admitted = employees.filter(employee => employee.admission_date >= start && employee.admission_date < end)
  const admissions = admitted.length
  const terminated = employees.filter(employee => employee.dismissal_date >= start && employee.dismissal_date < end)
  const terminations = terminated.length
  const voluntary = terminated.filter(employee => employee.termination_type === 'voluntario').length
  const involuntary = terminated.filter(employee => employee.termination_type === 'involuntario').length
  const averageHead = (headStart + headEnd) / 2

  metricActiveHeadcount.textContent = headEnd
  metricAdmissions.textContent = admissions
  metricTerminations.textContent = terminations
  metricGeneralTurnover.textContent = averageHead ? `${(((admissions + terminations) / 2) / averageHead * 100).toFixed(2)}%` : '—'
  metricTurnover.textContent = averageHead ? `${(terminations / averageHead * 100).toFixed(2)}%` : '—'
  metricVoluntary.textContent = voluntary
  metricInvoluntary.textContent = involuntary

  const movements = [
    ...admitted.map(employee => ({ type: 'Admissão', date: employee.admission_date, employee })),
    ...terminated.map(employee => ({ type: 'Desligamento', date: employee.dismissal_date, employee }))
  ].sort((a, b) => a.date.localeCompare(b.date))

  turnoverMovementRows.innerHTML = movements.map(item => `
    <tr>
      <td><span class="badge ${item.type === 'Admissão' ? 'badge-green' : 'badge-yellow'}">${item.type}</span></td>
      <td>${escapeHTML(item.employee.registration || '—')}</td>
      <td>${escapeHTML(item.employee.full_name || '—')}</td>
      <td>${new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="empty">Nenhuma admissão ou desligamento no período selecionado.</td></tr>'

  replaceChart('turnover', turnoverChart, {
    type: 'bar',
    data: {
      labels: ['Admissões', 'Desligamentos', 'Voluntários', 'Involuntários'],
      datasets: [{
        label: 'Colaboradores',
        data: [admissions, terminations, voluntary, involuntary],
        backgroundColor: ['#2EC4B6', '#EE4D2D', '#FFB000', '#7C5CFC']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      datasets: { bar: { maxBarThickness: 68, categoryPercentage: .62, barPercentage: .68 } }
    }
  })


  // Estado analítico compartilhado com a camada NEXO BI.
  window.NEXO_BI_STATE = window.NEXO_BI_STATE || {}
  window.NEXO_BI_STATE.dashboard = {
    selectedMonth,
    operation,
    operationLabel: operation ? (operations.find(item => item.id === operation)?.cost_center || '') : 'Todas as operações',
    start,end,rows,requests,employees,absences,planned,consideredEmployees,plannedByOperation,plannedEmployeeCountByOperation,
    justifiedCount: absences.filter(item => justifiedCodes.includes(item.absence_type)).length,
    unjustifiedCount: absences.filter(item => unjustifiedCodes.includes(item.absence_type)).length,
    otherAbsenceCount: absences.filter(item => !justifiedCodes.includes(item.absence_type) && !unjustifiedCodes.includes(item.absence_type)).length,
    warnings,suspensions,applied,statusCounts,absenceByOperation,regions,leaders,scaleAbsenceRows,
    headStart,headEnd,averageHead,admitted,terminated,voluntary,involuntary,movements,
    timeOldest: metricOldest.textContent,
    timeNewest: metricNewest.textContent,
    timeAverage: metricOccurrenceAverage.textContent
  }
  window.NexoBI?.refreshOverview?.()
}


function prepareDashboard() {
  dashboardMonth.value = new Date().toISOString().slice(0, 7)
  dashboardOperation.innerHTML = '<option value="">Todas as operações</option>' + operations.map(operation =>
    `<option value="${operation.id}">${escapeHTML(operation.cost_center)} — ${escapeHTML(operation.department)}</option>`
  ).join('')
  loadDashboard()
}
