'use client'

import { useEffect, useMemo, useState } from 'react'

type Staff = {
  id: number
  login_id: string
  name: string
  role: string
  is_active: boolean
}

type VoucherType =
  | 'none'
  | 'edu_office'
  | 'mental_health'
  | 'after_school'
  | 'gugu'

type Child = {
  id: number
  chart_no: string | null
  child_name: string
  birth_date: string | null
  phone: string | null
  voucher_type: VoucherType
  voucher_label: string
  voucher_color: 'yellow' | 'purple' | 'green' | 'orange' | 'slate'
  age_text: string
  display_name: string
  is_active: boolean
  notes: string | null
  voucher_summary?: {
    ym: string
    used_count: number
  }[]
}

type ScheduleRow = {
  id: number
  staff_id: number
  child_id: number
  schedule_date: string
  time_slot: string
  memo: string | null
}

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
}

type AttendanceRow = {
  id: number
  staff_id: number
  work_date: string
  check_in_time: string | null
  check_out_time: string | null
}

type MonthlyStudentSummaryRow = {
  child_id: number
  child_name: string
  display_name?: string
  age_text: string
  voucher_type: string
  voucher_label: string
  attended_count: number
  absent_count: number
  same_day_absent_count: number
  makeup_count: number
  used_count: number
}

type TodayOverviewRow = {
  id: number
  staff_id: number
  child_id: number
  schedule_date: string
  time_slot: string
  memo: string | null
  input_status: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null
}

type AuditLogRow = {
  id: number
  actor_staff_id: number | null
  action_type: string
  target_table: string
  target_id: number | null
  before_data: unknown
  after_data: unknown
  created_at: string
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function toDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toShortMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function getWeekDates(baseDate: Date) {
  const monday = getMonday(baseDate)
  return Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function buildHourSlots(start = 9, end = 20) {
  const slots: string[] = []
  for (let hour = start; hour <= end; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return slots
}

function getHourLabel(hourSlot: string) {
  return `${Number(hourSlot.slice(0, 2))}시`
}

function getMinutesOptions() {
  return ['00', '10', '20', '30', '40', '50']
}

function extractHour(timeSlot: string) {
  return timeSlot.slice(0, 2)
}

function getVoucherChipClass(color: Child['voucher_color']) {
  switch (color) {
    case 'yellow':
      return 'bg-yellow-100 text-yellow-800'
    case 'purple':
      return 'bg-purple-100 text-purple-800'
    case 'green':
      return 'bg-green-100 text-green-800'
    case 'orange':
      return 'bg-orange-100 text-orange-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getItemStyle(
  status?: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null
) {
  if (status === 'attended') return 'bg-blue-100 text-blue-700'
  if (status === 'makeup') return 'bg-blue-100 text-blue-700'
  if (status === 'absent') return 'bg-red-50 text-red-400'
  if (status === 'same_day_absent') return 'bg-red-200 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

function getStatusText(
  status?: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null
) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'same_day_absent') return '당일결석'
  if (status === 'makeup') return '보강'
  return '미입력'
}

function formatDateTimeForCsv(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  })
}

export default function AdminPage() {
  const [tab, setTab] = useState<
    'schedule' | 'today' | 'summary' | 'children' | 'staff' | 'audit'
  >('schedule')
  const [viewMode, setViewMode] = useState<'all' | 'staff'>('staff')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [staffs, setStaffs] = useState<Staff[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [csvMonth, setCsvMonth] = useState(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })

  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [classLogRows, setClassLogRows] = useState<ClassLogRow[]>([])
  const [monthlySummaryRows, setMonthlySummaryRows] = useState<MonthlyStudentSummaryRow[]>([])
  const [todayRows, setTodayRows] = useState<TodayOverviewRow[]>([])
  const [todayMode, setTodayMode] = useState<'all' | 'missing'>('all')
  const [summarySearch, setSummarySearch] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)

  const [editingCell, setEditingCell] = useState<{
    date: string
    hour: string
    staffId?: number
  } | null>(null)

  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [scheduleMemo, setScheduleMemo] = useState('')

  const [recordModal, setRecordModal] = useState<{
    open: boolean
    staffId: number | null
    childId: number | null
    classDate: string
    classTime: string
    status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
  }>({
    open: false,
    staffId: null,
    childId: null,
    classDate: '',
    classTime: '',
    status: 'attended',
  })

  const [childForm, setChildForm] = useState({
    id: 0,
    chartNo: '',
    childName: '',
    birthDate: '',
    phone: '',
    voucherType: 'none' as VoucherType,
    notes: '',
    isActive: true,
  })

  const [staffForm, setStaffForm] = useState({
    id: 0,
    loginId: '',
    password: '',
    name: '',
    role: 'employee' as 'admin' | 'employee',
    isActive: true,
  })

  const employeeStaffs = staffs.filter((s) => s.role === 'employee')
  const selectedStaff = employeeStaffs.find((s) => s.id === selectedStaffId) ?? null
  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate])
  const hourSlots = useMemo(() => buildHourSlots(9, 20), [])

  const filteredSummaryRows = useMemo(() => {
    const q = summarySearch.trim().toLowerCase()
    if (!q) return monthlySummaryRows
    return monthlySummaryRows.filter((row) =>
      `${row.child_name} ${row.age_text} ${row.voucher_label}`.toLowerCase().includes(q)
    )
  }, [monthlySummaryRows, summarySearch])

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    localStorage.removeItem('savedLoginId')
    window.location.href = '/'
  }

  async function downloadStudentCsv() {
    try {
      const [year, month] = csvMonth.split('-').map(Number)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const targetStaffs =
        viewMode === 'staff' && selectedStaffId
          ? employeeStaffs.filter((s) => s.id === selectedStaffId)
          : employeeStaffs

      if (targetStaffs.length === 0) {
        setMessage('다운로드할 선생님 데이터가 없습니다.')
        return
      }

      const monthlyResults = await Promise.all(
        targetStaffs.map(async (staff) => {
          const [scheduleRes, classLogRes] = await Promise.all([
            fetch(`/api/schedule?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`),
            fetch(`/api/class-log/by-range?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`),
          ])

          const scheduleJson = await scheduleRes.json()
          const classLogJson = await classLogRes.json()

          return {
            staff,
            schedules: (scheduleJson.ok ? scheduleJson.rows : []) as ScheduleRow[],
            classLogs: (classLogJson.ok ? classLogJson.rows : []) as ClassLogRow[],
          }
        })
      )

      const rows = monthlyResults.flatMap(({ staff, schedules, classLogs }) =>
        schedules.map((row) => {
          const child = children.find((c) => c.id === row.child_id)
          const matched = classLogs.find((log) => {
            const t = new Date(log.class_time).toLocaleTimeString('ko-KR', {
              timeZone: 'Asia/Seoul',
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              log.class_date === row.schedule_date &&
              log.child_id === row.child_id &&
              t === row.time_slot
            )
          })

          return {
            날짜: row.schedule_date,
            시간: row.time_slot,
            선생님: staff.name,
            학생: child?.child_name ?? '',
            나이: child?.age_text ?? '',
            바우처: child?.voucher_label ?? '',
            상태: getStatusText(matched?.status),
            메모: row.memo ?? '',
          }
        })
      )

      rows.sort((a, b) => {
        if (a.날짜 !== b.날짜) return a.날짜.localeCompare(b.날짜)
        if (a.선생님 !== b.선생님) return a.선생님.localeCompare(b.선생님)
        return a.시간.localeCompare(b.시간)
      })

      const header = ['날짜', '시간', '선생님', '학생', '나이', '바우처', '상태', '메모']

      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.날짜,
            r.시간,
            `"${String(r.선생님).replace(/"/g, '""')}"`,
            `"${String(r.학생).replace(/"/g, '""')}"`,
            `"${String(r.나이).replace(/"/g, '""')}"`,
            `"${String(r.바우처).replace(/"/g, '""')}"`,
            `"${String(r.상태).replace(/"/g, '""')}"`,
            `"${String(r.메모).replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ].join('\n')

      const blob = new Blob(['\ufeff' + csv], {
        type: 'text/csv;charset=utf-8;',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `학생-${csvMonth}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '학생 CSV 다운로드 실패')
    }
  }

  async function downloadStaffCsv() {
    try {
      const [year, month] = csvMonth.split('-').map(Number)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const targetStaffs =
        viewMode === 'staff' && selectedStaffId
          ? employeeStaffs.filter((s) => s.id === selectedStaffId)
          : employeeStaffs

      if (targetStaffs.length === 0) {
        setMessage('다운로드할 선생님 데이터가 없습니다.')
        return
      }

      const results = await Promise.all(
        targetStaffs.map(async (staff) => {
          const res = await fetch(
            `/api/attendance/by-range?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`
          )
          const json = await res.json()

          return {
            staff,
            rows: (json.ok ? json.rows : []) as AttendanceRow[],
          }
        })
      )

      const rows = results.flatMap(({ staff, rows }) =>
        rows.map((r) => ({
          날짜: r.work_date,
          선생님: staff.name,
          출근시간: formatDateTimeForCsv(r.check_in_time),
          퇴근시간: formatDateTimeForCsv(r.check_out_time),
        }))
      )

      rows.sort((a, b) => {
        if (a.날짜 !== b.날짜) return a.날짜.localeCompare(b.날짜)
        return a.선생님.localeCompare(b.선생님)
      })

      const header = ['날짜', '선생님', '출근시간', '퇴근시간']

      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.날짜,
            `"${String(r.선생님).replace(/"/g, '""')}"`,
            `"${String(r.출근시간).replace(/"/g, '""')}"`,
            `"${String(r.퇴근시간).replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ].join('\n')

      const blob = new Blob(['\ufeff' + csv], {
        type: 'text/csv;charset=utf-8;',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `선생님-${csvMonth}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '선생님 CSV 다운로드 실패')
    }
  }

  async function loadStaffs() {
    const res = await fetch('/api/admin/staff-list')
    const json = await res.json()
    if (!json.ok) throw new Error(json.message ?? '선생님 목록 조회 실패')
    const rows = (json.rows as Staff[]).filter((s) => s.is_active)
    setStaffs(rows)
    return rows
  }

  async function loadChildren() {
    const res = await fetch('/api/children')
    const json = await res.json()
    if (!json.ok) throw new Error(json.message ?? '아이 목록 조회 실패')
    setChildren(json.children)
  }

  async function loadWeekData() {
    const startDate = toDateString(weekDates[0])
    const endDate = toDateString(weekDates[5])

    if (viewMode === 'staff') {
      if (!selectedStaffId) {
        setScheduleRows([])
        setClassLogRows([])
        return
      }

      const [scheduleRes, classRes] = await Promise.all([
        fetch(`/api/schedule?staffId=${selectedStaffId}&startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/class-log/by-range?staffId=${selectedStaffId}&startDate=${startDate}&endDate=${endDate}`),
      ])

      const scheduleJson = await scheduleRes.json()
      const classJson = await classRes.json()

      if (!scheduleJson.ok) throw new Error(scheduleJson.message ?? '시간표 조회 실패')
      if (!classJson.ok) throw new Error(classJson.message ?? '수업기록 조회 실패')

      setScheduleRows(scheduleJson.rows)
      setClassLogRows(classJson.rows)
      return
    }

    const results = await Promise.all(
      employeeStaffs.map(async (staff) => {
        const [scheduleRes, classRes] = await Promise.all([
          fetch(`/api/schedule?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`),
          fetch(`/api/class-log/by-range?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`),
        ])

        const scheduleJson = await scheduleRes.json()
        const classJson = await classRes.json()

        if (!scheduleJson.ok) throw new Error(scheduleJson.message ?? '전체 시간표 조회 실패')
        if (!classJson.ok) throw new Error(classJson.message ?? '전체 수업기록 조회 실패')

        return {
          scheduleRows: scheduleJson.rows as ScheduleRow[],
          classLogRows: classJson.rows as ClassLogRow[],
        }
      })
    )

    setScheduleRows(results.flatMap((r) => r.scheduleRows))
    setClassLogRows(results.flatMap((r) => r.classLogRows))
  }

  async function loadMonthlySummary() {
    const res = await fetch(`/api/admin/monthly-student-summary?month=${csvMonth}`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.message ?? '월별 정산 조회 실패')
    setMonthlySummaryRows(json.rows ?? [])
  }

  async function loadTodayOverview(mode: 'all' | 'missing') {
    const res = await fetch(`/api/admin/today-overview?mode=${mode}`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.message ?? '오늘 수업 조회 실패')
    setTodayRows(json.rows ?? [])
  }

  async function loadAuditLogs(page = 1) {
    const res = await fetch(`/api/admin/audit-logs?page=${page}&limit=20`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.message ?? '감사로그 조회 실패')
    setAuditLogs(json.rows ?? [])
    setAuditTotal(json.total ?? 0)
  }

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        setMessage('')
        const rows = await loadStaffs()
        await loadChildren()
        const firstEmployee = rows.find((row) => row.role === 'employee') ?? rows[0]
        if (firstEmployee) setSelectedStaffId(firstEmployee.id)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '초기 로딩 실패')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    async function run() {
      try {
        setLoading(true)
        setMessage('')
        if (tab === 'schedule') {
          await loadWeekData()
        } else if (tab === 'summary') {
          await loadMonthlySummary()
        } else if (tab === 'today') {
          await loadTodayOverview(todayMode)
        } else if (tab === 'audit') {
          await loadAuditLogs(auditPage)
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '조회 실패')
      } finally {
        setLoading(false)
      }
    }

    if (staffs.length > 0) run()
  }, [selectedStaffId, weekBaseDate, viewMode, staffs.length, tab, csvMonth, todayMode, auditPage])

  async function handleSaveSchedule(date: string, hourSlot: string, staffId: number) {
    if (!scheduleChildId) {
      setMessage('학생을 선택하세요.')
      return
    }

    const timeSlot = `${extractHour(hourSlot)}:${selectedMinute}`

    const res = await fetch('/api/schedule/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId,
        childId: scheduleChildId,
        scheduleDate: date,
        timeSlot,
        memo: scheduleMemo,
        createdByStaffId: staffId,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setEditingCell(null)
      setScheduleChildId('')
      setSelectedMinute('00')
      setScheduleMemo('')
      await loadWeekData()
    }
  }

  async function handleDeleteSchedule(scheduleId: number) {
    const firstRes = await fetch('/api/schedule/save', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId, actorStaffId: selectedStaffId || null }),
    })

    const firstJson = await firstRes.json()

    if (firstJson.needsConfirm) {
      const ok = window.confirm(firstJson.message)
      if (!ok) return

      const secondRes = await fetch('/api/schedule/save', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          confirmDelete: true,
          actorStaffId: selectedStaffId || null,
        }),
      })

     const secondJson = await secondRes.json()
      setMessage(secondJson.message)

      if (secondJson.ok) {
        await loadChildren()
        await loadWeekData()
      }
      return
    }

    setMessage(firstJson.message)

    if (firstJson.ok) {
      await loadChildren()
      await loadWeekData()
    }
  }

  async function handleEditMemo(scheduleId: number, currentMemo: string | null) {
    const nextMemo = window.prompt('메모 수정', currentMemo ?? '')
    if (nextMemo === null) return

    const res = await fetch('/api/schedule/save', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduleId,
        memo: nextMemo,
        actorStaffId: selectedStaffId || null,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      await loadWeekData()
    }
  }

  async function handleSaveRecordStatus() {
    if (!recordModal.childId || !recordModal.staffId) return

    const res = await fetch('/api/class-log/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: recordModal.staffId,
        childId: recordModal.childId,
        classDate: recordModal.classDate,
        classTime: recordModal.classTime,
        status: recordModal.status,
        note: '',
        actorStaffId: selectedStaffId || null,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setRecordModal({
        open: false,
        staffId: null,
        childId: null,
        classDate: '',
        classTime: '',
        status: 'attended',
      })
      await loadChildren()
      await loadWeekData()
      if (tab === 'today') await loadTodayOverview(todayMode)
      if (tab === 'summary') await loadMonthlySummary()
    }
  }

  async function handleSaveChild() {
    const method = childForm.id ? 'PUT' : 'POST'
    const res = await fetch('/api/admin/children/manage', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(childForm),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setChildForm({
        id: 0,
        chartNo: '',
        childName: '',
        birthDate: '',
        phone: '',
        voucherType: 'none',
        notes: '',
        isActive: true,
      })
      await loadChildren()
      if (tab === 'summary') await loadMonthlySummary()
    }
  }

  async function handleSaveStaff() {
    const method = staffForm.id ? 'PUT' : 'POST'
    const res = await fetch('/api/admin/staff/manage', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staffForm),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setStaffForm({
        id: 0,
        loginId: '',
        password: '',
        name: '',
        role: 'employee',
        isActive: true,
      })
      await loadStaffs()
    }
  }

  function getScheduleEntries(date: string, hourSlot: string, staffId?: number) {
    const hour = extractHour(hourSlot)

    return scheduleRows
      .filter((row) => {
        const sameHour = row.schedule_date === date && extractHour(row.time_slot) === hour
        if (!sameHour) return false
        if (typeof staffId === 'number') return row.staff_id === staffId
        return true
      })
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
  }

  function getClassLogStatus(date: string, timeSlot: string, childId: number, staffId: number) {
    const matched = classLogRows.find((row) => {
      const t = new Date(row.class_time).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })

      return (
        row.staff_id === staffId &&
        row.class_date === date &&
        t === timeSlot &&
        row.child_id === childId
      )
    })

    return matched?.status
  }

  function getDefaultStatus(date: string, timeSlot: string, childId: number, staffId: number) {
    return getClassLogStatus(date, timeSlot, childId, staffId) ?? 'attended'
  }

  function renderScheduleCard(entry: ScheduleRow, dateStr: string, staffId: number) {
    const child = children.find((c) => c.id === entry.child_id) ?? null
    const status = child ? getClassLogStatus(dateStr, entry.time_slot, child.id, staffId) : undefined
    const defaultStatus = child ? getDefaultStatus(dateStr, entry.time_slot, child.id, staffId) : 'attended'

    return (
      <div key={entry.id} className={`rounded-xl px-2 py-2 text-xs ${getItemStyle(status)}`}>
        <button
          type="button"
          onClick={() => {
            if (!child) return
            setRecordModal({
              open: true,
              staffId,
              childId: child.id,
              classDate: dateStr,
              classTime: entry.time_slot,
              status: defaultStatus,
            })
          }}
          className="w-full text-left"
        >
          <div className="font-medium leading-tight">{entry.time_slot}</div>
          <div className="leading-tight">{child ? child.display_name : '이름없음'}</div>

          {entry.memo ? (
            <div className="mt-1 text-[10px] leading-tight text-slate-500">
              {entry.memo}
            </div>
          ) : null}

          {child ? (
            <div className="mt-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${getVoucherChipClass(child.voucher_color)}`}>
                {child.voucher_label}
              </span>
            </div>
          ) : null}
        </button>

        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleEditMemo(entry.id, entry.memo)}
            className="rounded bg-white/70 px-2 py-1 text-[10px]"
          >
            메모수정
          </button>

          <button
            type="button"
            onClick={() => handleDeleteSchedule(entry.id)}
            className="rounded bg-white/70 px-2 py-1 text-[10px]"
          >
            삭제
          </button>
        </div>
      </div>
    )
  }

  function renderMobileDayCard(date: Date, staffId?: number) {
    const dateStr = toDateString(date)
    const staffName =
      typeof staffId === 'number'
        ? staffs.find((s) => s.id === staffId)?.name ?? ''
        : selectedStaff?.name ?? ''

    return (
      <div key={`${dateStr}-${staffId ?? 'all'}`} className="rounded-2xl border bg-white p-4">
        <div className="mb-3 font-bold">
          {dateStr}
          {staffName ? <span className="ml-2 text-sm text-slate-500">{staffName}</span> : null}
        </div>

        <div className="space-y-3">
          {hourSlots.map((hourSlot) => {
            const entries = getScheduleEntries(dateStr, hourSlot, staffId)
            const isEditing =
              editingCell?.date === dateStr &&
              editingCell?.hour === hourSlot &&
              (typeof staffId === 'number' ? editingCell?.staffId === staffId : true)

            return (
              <div key={`${dateStr}-${staffId ?? 'all'}-${hourSlot}`} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">{getHourLabel(hourSlot)}</div>
{isEditing ? (
                  <div className="space-y-2">
                    <select
                      value={scheduleChildId}
                      onChange={(e) =>
                        setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
                    >
                      <option value="">학생 선택</option>
                      {children
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.display_name}
                          </option>
                        ))}
                    </select>

                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(e.target.value)}
                      className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
                    >
                      {getMinutesOptions().map((m) => (
                        <option key={m} value={m}>
                          {m}분
                        </option>
                      ))}
                    </select>

                    <input
                      value={scheduleMemo}
                      onChange={(e) => setScheduleMemo(e.target.value)}
                      placeholder="메모 입력"
                      className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleSaveSchedule(
                            dateStr,
                            hourSlot,
                            typeof staffId === 'number' ? staffId : Number(selectedStaffId)
                          )
                        }
                        className="flex-1 rounded-xl bg-indigo-600 px-3 py-3 text-sm text-white"
                      >
                        추가
                      </button>
                      <button
                        onClick={() => {
                          setEditingCell(null)
                          setScheduleChildId('')
                          setSelectedMinute('00')
                          setScheduleMemo('')
                        }}
                        className="flex-1 rounded-xl bg-slate-300 px-3 py-3 text-sm"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCell({
                          date: dateStr,
                          hour: hourSlot,
                          staffId: staffId,
                        })
                        setScheduleChildId('')
                        setSelectedMinute('00')
                        setScheduleMemo('')
                      }}
                      className="mb-2 w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-left text-sm text-slate-500"
                    >
                      + 추가
                    </button>

                    {entries.length === 0 ? (
                      <div className="text-xs text-slate-400">등록 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry) =>
                          renderScheduleCard(entry, dateStr, typeof staffId === 'number' ? staffId : entry.staff_id)
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderTodayCard(row: TodayOverviewRow) {
    const child = children.find((c) => c.id === row.child_id)
    const staff = staffs.find((s) => s.id === row.staff_id)

    return (
      <div key={row.id} className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{row.time_slot}</div>
            <div className="text-sm text-slate-700">{child?.display_name ?? '이름없음'}</div>
            <div className="text-xs text-slate-500">{staff?.name ?? ''}</div>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs ${getItemStyle(row.input_status)}`}>
            {getStatusText(row.input_status)}
          </span>
        </div>
        {row.memo ? <div className="mt-2 text-xs text-slate-500">{row.memo}</div> : null}
      </div>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fffaf5_0%,#f9fff8_45%,#fff7fb_100%)] p-3 md:p-6">
      <div className="pointer-events-none absolute left-[-50px] top-[90px] h-48 w-48 rounded-full bg-orange-100/70 blur-3xl" />
      <div className="pointer-events-none absolute right-[-40px] top-[130px] h-56 w-56 rounded-full bg-emerald-100/60 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[70px] left-[8%] h-44 w-44 rounded-full bg-purple-100/60 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[80px] right-[10%] h-52 w-52 rounded-full bg-pink-100/50 blur-3xl" />

      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab('schedule')}
              className={`rounded-xl px-4 py-2 ${tab === 'schedule' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              시간표
            </button>
            <button
              onClick={() => setTab('today')}
              className={`rounded-xl px-4 py-2 ${tab === 'today' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              오늘보기
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`rounded-xl px-4 py-2 ${tab === 'summary' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              월정산
            </button>
            <button
              onClick={() => setTab('children')}
              className={`rounded-xl px-4 py-2 ${tab === 'children' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              아이관리
            </button>
            <button
              onClick={() => setTab('staff')}
              className={`rounded-xl px-4 py-2 ${tab === 'staff' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              선생님관리
            </button>
            <button
              onClick={() => setTab('audit')}
              className={`rounded-xl px-4 py-2 ${tab === 'audit' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              수정이력
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="month"
              value={csvMonth}
              onChange={(e) => setCsvMonth(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />

            <button
              onClick={downloadStudentCsv}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow"
            >
              학생CSV
            </button>

            <button
              onClick={downloadStaffCsv}
              className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white shadow"
            >
              선생님CSV
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
            >
              로그아웃
            </button>
          </div>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'schedule' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3">
              <h1 className="text-xl font-bold md:text-2xl">관리자 시간표</h1>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setViewMode('all')}
                    className={`rounded-xl px-4 py-2 text-sm font-medium ${
                      viewMode === 'all' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    전체보기
                  </button>

                  <button
                    onClick={() => setViewMode('staff')}
                    className={`rounded-xl px-4 py-2 text-sm font-medium ${
                      viewMode === 'staff' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    선생님별 보기
                  </button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {viewMode === 'staff' ? (
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value ? Number(e.target.value) : '')}
                      className="rounded-xl border px-3 py-3 md:py-2"
                    >
                      <option value="">선생님 선택</option>
                      {employeeStaffs.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} ({staff.login_id})
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const d = new Date(weekBaseDate)
                        d.setDate(d.getDate() - 7)
                        setWeekBaseDate(d)
                      }}
                      className="rounded-lg bg-slate-200 px-3 py-3 md:py-2"
                    >
                      ◀
                    </button>

                    <button
                      onClick={() => {
                        const d = new Date(weekBaseDate)
                        d.setDate(d.getDate() + 7)
                        setWeekBaseDate(d)
                      }}
                      className="rounded-lg bg-slate-200 px-3 py-3 md:py-2"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                시간표 불러오는 중...
              </div>
            ) : viewMode === 'staff' && !selectedStaff ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                선생님을 선택하세요.
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-slate-100 px-1 py-2">시간</th>

                        {viewMode === 'staff'
                          ? weekDates.map((date, idx) => (
                              <th key={`staff-${idx}`} className="min-w-[150px] border bg-slate-100 px-1 py-2">
                                <div className="text-sm font-semibold leading-tight">
                                  {['월', '화', '수', '목', '금', '토'][idx]} {toShortMonthDay(date)}
                                </div>
                                <div className="mt-1 text-xs font-normal leading-tight text-slate-500">
                                  {selectedStaff?.name}
                                </div>
                              </th>
                            ))
                          : weekDates.flatMap((date, idx) =>
                              employeeStaffs.map((staff) => (
                                <th
                                  key={`all-${toDateString(date)}-${staff.id}`}
                                  className="min-w-[130px] border bg-slate-100 px-1 py-2"
                                >
                                  <div className="text-sm font-semibold leading-tight">
                                    {['월', '화', '수', '목', '금', '토'][idx]} {toShortMonthDay(date)}
                                  </div>
                                  <div className="mt-1 text-xs font-normal leading-tight text-slate-500">
                                    {staff.name}
                                  </div>
                                </th>
                              ))
                            )}
                      </tr>
                    </thead>
                    <tbody>
                      {hourSlots.map((hourSlot) => (
                        <tr key={hourSlot}>
                          <td className="whitespace-nowrap border bg-slate-50 px-1 py-1 font-medium">
                            {getHourLabel(hourSlot)}
                          </td>

                          {viewMode === 'staff' && selectedStaff
                            ? weekDates.map((date) => {
                                const dateStr = toDateString(date)
                                const entries = getScheduleEntries(dateStr, hourSlot, selectedStaff.id)
                                const isEditing =
                                  editingCell?.date === dateStr &&
                                  editingCell?.hour === hourSlot &&
                                  editingCell?.staffId === selectedStaff.id

                                return (
                                  <td
                                    key={`${selectedStaff.id}-${dateStr}-${hourSlot}`}
                                    className="min-w-[150px] border px-1 py-1 align-top"
                                  >
                                    {isEditing ? (
                                      <div className="min-h-[72px] space-y-1">
                                        <select
                                          value={scheduleChildId}
                                          onChange={(e) =>
                                            setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                                          }
                                          className="w-full rounded border bg-white px-2 py-1 text-xs"
                                        >
                                          <option value="">학생 선택</option>
                                          {children
                                            .filter((c) => c.is_active)
                                            .map((c) => (
                                              <option key={c.id} value={c.id}>
                                                {c.display_name}
                                              </option>
                                            ))}
                                        </select>

                                        <select
                                          value={selectedMinute}
                                          onChange={(e) => setSelectedMinute(e.target.value)}
                                          className="w-full rounded border bg-white px-2 py-1 text-xs"
                                        >
                                          {getMinutesOptions().map((m) => (
                                            <option key={m} value={m}>
                                              {m}분
                                            </option>
                                          ))}
                                        </select>

                                        <input
                                          value={scheduleMemo}
                                          onChange={(e) => setScheduleMemo(e.target.value)}
                                          placeholder="메모 입력"
                                          className="w-full rounded border bg-white px-2 py-1 text-xs"
                                        />

                                        <div className="flex gap-1">
                                          <button
                                            onClick={() =>
                                              handleSaveSchedule(dateStr, hourSlot, selectedStaff.id)
                                            }
                                            className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                                          >
                                            추가
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingCell(null)
                                              setScheduleChildId('')
                                              setSelectedMinute('00')
                                              setScheduleMemo('')
                                            }}
                                            className="flex-1 rounded bg-slate-300 px-2 py-1 text-xs"
                                          >
                                            취소
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-0.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingCell({
                                              date: dateStr,
                                              hour: hourSlot,
                                              staffId: selectedStaff.id,
                                            })
                                            setScheduleChildId('')
                                            setSelectedMinute('00')
                                            setScheduleMemo('')
                                          }}
                                          className="min-h-[28px] w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
                                        >
                                          + 추가
                                        </button>

                                        {entries.map((entry) =>
                                          renderScheduleCard(entry, dateStr, selectedStaff.id)
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )
                              })
                            : weekDates.flatMap((date) =>
                                employeeStaffs.map((staff) => {
                                  const dateStr = toDateString(date)
                                  const entries = getScheduleEntries(dateStr, hourSlot, staff.id)
                                  const isEditing =
                                    editingCell?.date === dateStr &&
                                    editingCell?.hour === hourSlot &&
                                    editingCell?.staffId === staff.id

                                  return (
                                    <td
                                      key={`all-${staff.id}-${dateStr}-${hourSlot}`}
                                      className="min-w-[130px] border px-1 py-1 align-top"
                                    >
                                      {isEditing ? (
                                        <div className="min-h-[72px] space-y-1">
                                          <select
                                            value={scheduleChildId}
                                            onChange={(e) =>
                                              setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                                            }
                                            className="w-full rounded border bg-white px-2 py-1 text-xs"
                                          >
                                            <option value="">학생 선택</option>
                                            {children
                                              .filter((c) => c.is_active)
                                              .map((c) => (
                                                <option key={c.id} value={c.id}>
                                                  {c.display_name}
                                                </option>
                                              ))}
                                          </select>

                                          <select
                                            value={selectedMinute}
                                            onChange={(e) => setSelectedMinute(e.target.value)}
                                            className="w-full rounded border bg-white px-2 py-1 text-xs"
                                          >
                                            {getMinutesOptions().map((m) => (
                                              <option key={m} value={m}>
                                                {m}분
                                              </option>
                                            ))}
                                          </select>

                                          <input
                                            value={scheduleMemo}
                                            onChange={(e) => setScheduleMemo(e.target.value)}
                                            placeholder="메모 입력"
                                            className="w-full rounded border bg-white px-2 py-1 text-xs"
                                          />

                                          <div className="flex gap-1">
                                            <button
                                              onClick={() =>
                                                handleSaveSchedule(dateStr, hourSlot, staff.id)
                                              }
                                              className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                                            >
                                              추가
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingCell(null)
                                                setScheduleChildId('')
                                                setSelectedMinute('00')
                                                setScheduleMemo('')
                                              }}
                                              className="flex-1 rounded bg-slate-300 px-2 py-1 text-xs"
                                            >
                                              취소
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-0.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingCell({
                                                date: dateStr,
                                                hour: hourSlot,
                                                staffId: staff.id,
                                              })
                                              setScheduleChildId('')
                                              setSelectedMinute('00')
                                              setScheduleMemo('')
                                            }}
                                            className="min-h-[28px] w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
                                          >
                                            + 추가
                                          </button>

                                          {entries.map((entry) =>
                                            renderScheduleCard(entry, dateStr, staff.id)
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })
                              )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4 md:hidden">
                  {viewMode === 'staff' && selectedStaff
                    ? weekDates.map((date) => renderMobileDayCard(date, selectedStaff.id))
                    : weekDates.flatMap((date) =>
                        employeeStaffs.map((staff) => renderMobileDayCard(date, staff.id))
                      )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'today' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h1 className="text-xl font-bold md:text-2xl">오늘 수업 / 미입력</h1>

              <div className="flex gap-2">
                <button
                  onClick={() => setTodayMode('all')}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    todayMode === 'all' ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                  }`}
                >
                  오늘 전체
                </button>
                <button
                  onClick={() => setTodayMode('missing')}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    todayMode === 'missing' ? 'bg-rose-500 text-white' : 'bg-slate-200'
                  }`}
                >
                  미입력만
                </button>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                조회 중...
              </div>
            ) : todayRows.length === 0 ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                데이터 없음
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {todayRows.map((row) => renderTodayCard(row))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'summary' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h1 className="text-xl font-bold md:text-2xl">월별 학생 정산</h1>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  placeholder="학생 이름 검색"
                  className="rounded-xl border px-3 py-2"
                />
                <button
                  onClick={loadMonthlySummary}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-white"
                >
                  새로고침
                </button>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                정산 불러오는 중...
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-slate-100 px-3 py-2">학생</th>
                        <th className="border bg-slate-100 px-3 py-2">나이</th>
                        <th className="border bg-slate-100 px-3 py-2">바우처</th>
                        <th className="border bg-slate-100 px-3 py-2">출석</th>
                        <th className="border bg-slate-100 px-3 py-2">결석</th>
                        <th className="border bg-slate-100 px-3 py-2">당일결석</th>
                        <th className="border bg-slate-100 px-3 py-2">보강</th>
                        <th className="border bg-slate-100 px-3 py-2">사용</th>
                     
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSummaryRows.map((row) => (
                        <tr key={row.child_id}>
                         <td className="border px-3 py-2">{row.child_name}</td>
                          <td className="border px-3 py-2">{row.age_text}</td>
                          <td className="border px-3 py-2">{row.voucher_label}</td>
                          <td className="border px-3 py-2 text-center">{row.attended_count}</td>
                          <td className="border px-3 py-2 text-center">{row.absent_count}</td>
                          <td className="border px-3 py-2 text-center">{row.same_day_absent_count}</td>
                          <td className="border px-3 py-2 text-center">{row.makeup_count}</td>
                          <td className="border px-3 py-2 text-center">{row.used_count}</td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {filteredSummaryRows.map((row) => (
                    <div key={row.child_id} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{row.child_name}</div>
                          <div className="text-sm text-slate-500">
                            {row.age_text} / {row.voucher_label}
                          </div>
                        </div>
                                            </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-slate-50 p-2">출석 {row.attended_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">결석 {row.absent_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">당일결석 {row.same_day_absent_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">보강 {row.makeup_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">사용 {row.used_count}</div>

                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'children' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">아이 등록 / 수정</h2>
              <div className="space-y-3">
                <input
                  value={childForm.chartNo}
                  onChange={(e) => setChildForm((p) => ({ ...p, chartNo: e.target.value }))}
                  placeholder="차트번호"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <input
                  value={childForm.childName}
                  onChange={(e) => setChildForm((p) => ({ ...p, childName: e.target.value }))}
                  placeholder="이름"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <input
                  type="date"
                  value={childForm.birthDate}
                  onChange={(e) => setChildForm((p) => ({ ...p, birthDate: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <input
                  value={childForm.phone}
                  onChange={(e) => setChildForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="핸드폰 번호"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <select
                  value={childForm.voucherType}
                  onChange={(e) =>
                    setChildForm((p) => ({ ...p, voucherType: e.target.value as VoucherType }))
                  }
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                >
                  <option value="none">일반</option>
                  <option value="edu_office">교육청 바우처</option>
                  <option value="mental_health">아청심 바우처</option>
                  <option value="after_school">방과후 바우처</option>
                  <option value="gugu">구구 바우처</option>
                </select>
                <input
                  value={childForm.notes}
                  onChange={(e) => setChildForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="메모"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={childForm.isActive}
                    onChange={(e) => setChildForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  사용중
                </label>
                <button
                  onClick={handleSaveChild}
                  className="w-full rounded-xl bg-black py-3 text-white md:py-2"
                >
                  {childForm.id ? '아이 수정' : '아이 등록'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">아이 목록</h2>
              <div className="space-y-2">
                {children.length === 0 ? (
                  <div className="rounded-xl border p-3 text-slate-500">등록된 아이가 없습니다.</div>
                ) : (
                  children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() =>
                        setChildForm({
                          id: child.id,
                          chartNo: child.chart_no ?? '',
                          childName: child.child_name,
                          birthDate: child.birth_date ?? '',
                          phone: child.phone ?? '',
                          voucherType: child.voucher_type,
                          notes: child.notes ?? '',
                          isActive: child.is_active,
                        })
                      }
                      className="w-full rounded-xl border p-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{child.display_name}</div>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${getVoucherChipClass(child.voucher_color)}`}>
                          {child.voucher_label}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {child.chart_no ? `차트번호 ${child.chart_no}` : '차트번호 없음'}
                        {child.phone ? ` / ${child.phone}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'staff' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">선생님 등록 / 수정</h2>
              <div className="space-y-3">
                <input
                  value={staffForm.loginId}
                  onChange={(e) => setStaffForm((p) => ({ ...p, loginId: e.target.value }))}
                  placeholder="로그인 ID"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <input
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="이름"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <input
                  type="password"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder={staffForm.id ? '비밀번호 변경 시만 입력' : '비밀번호'}
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />
                <select
                  value={staffForm.role}
                  onChange={(e) =>
                    setStaffForm((p) => ({ ...p, role: e.target.value as 'admin' | 'employee' }))
                  }
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                >
                  <option value="employee">employee</option>
                  <option value="admin">admin</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={staffForm.isActive}
                    onChange={(e) => setStaffForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  사용중
                </label>
                <button
                  onClick={handleSaveStaff}
                  className="w-full rounded-xl bg-black py-3 text-white md:py-2"
                >
                  {staffForm.id ? '선생님 수정' : '선생님 등록'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">선생님 목록</h2>
              <div className="space-y-2">
                {staffs.length === 0 ? (
                  <div className="rounded-xl border p-3 text-slate-500">등록된 선생님이 없습니다.</div>
                ) : (
                  staffs.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() =>
                        setStaffForm({
                          id: staff.id,
                          loginId: staff.login_id,
                          password: '',
                          name: staff.name,
                          role: staff.role as 'admin' | 'employee',
                          isActive: staff.is_active,
                        })
                      }
                      className="w-full rounded-xl border p-3 text-left hover:bg-slate-50"
                    >
                      <div className="font-medium">
                        {staff.name} ({staff.login_id})
                      </div>
                      <div className="text-sm text-slate-500">
                        {staff.role} / {staff.is_active ? '사용중' : '중지'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'audit' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h1 className="text-xl font-bold md:text-2xl">수정이력</h1>
              <button
                onClick={() => loadAuditLogs(auditPage)}
                className="rounded-xl bg-slate-700 px-4 py-2 text-white"
              >
                새로고침
              </button>
            </div>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                감사로그 불러오는 중...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                로그 없음
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="font-semibold">{log.action_type}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString('ko-KR')}
                      </div>
                    </div>

                    <div className="mt-2 grid gap-1 text-sm text-slate-600">
                      <div>작업자 ID: {log.actor_staff_id ?? '-'}</div>
                      <div>테이블: {log.target_table}</div>
                      <div>대상 ID: {log.target_id ?? '-'}</div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-rose-50 p-3">
                        <div className="mb-2 text-xs font-bold text-rose-600">Before</div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-700">
                          {JSON.stringify(log.before_data, null, 2)}
                        </pre>
                      </div>

                      <div className="rounded-xl bg-emerald-50 p-3">
                        <div className="mb-2 text-xs font-bold text-emerald-600">After</div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-700">
                          {JSON.stringify(log.after_data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                className="rounded-xl bg-slate-200 px-4 py-2"
              >
                이전
              </button>
              <button
                onClick={() => setAuditPage((p) => p + 1)}
                className="rounded-xl bg-slate-200 px-4 py-2"
              >
                다음
              </button>
              <div className="text-sm text-slate-500">총 {auditTotal}건</div>
            </div>
          </div>
        ) : null}

        {recordModal.open ? (
          <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-bold">수업 상태 선택</h3>
              <div className="mb-3 text-sm text-slate-600">
                {recordModal.classDate} / {recordModal.classTime}
              </div>
              <select
                value={recordModal.status}
                onChange={(e) =>
                  setRecordModal((prev) => ({
                    ...prev,
                    status: e.target.value as
                      | 'attended'
                      | 'absent'
                      | 'makeup'
                      | 'same_day_absent',
                  }))
                }
                className="mb-4 w-full rounded-xl border px-3 py-3 md:py-2"
              >
                <option value="attended">출석</option>
                <option value="absent">결석</option>
                <option value="makeup">보강</option>
                <option value="same_day_absent">당일결석</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveRecordStatus}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-white md:py-2"
                >
                  저장
                </button>
                <button
                  onClick={() =>
                    setRecordModal({
                      open: false,
                      staffId: null,
                      childId: null,
                      classDate: '',
                      classTime: '',
                      status: 'attended',
                    })
                  }
                  className="flex-1 rounded-xl bg-slate-300 py-3 md:py-2"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}