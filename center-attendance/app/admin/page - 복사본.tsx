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
  voucher_summary: {
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

function getItemStyle(status?: 'attended' | 'absent' | 'makeup' | 'same_day_absent') {
  if (status === 'attended') return 'bg-blue-100 text-blue-700'
  if (status === 'makeup') return 'bg-blue-100 text-blue-700'
  if (status === 'absent') return 'bg-red-50 text-red-400'
  if (status === 'same_day_absent') return 'bg-red-200 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

export default function AdminPage() {
  const [tab, setTab] = useState<'schedule' | 'children' | 'staff'>('schedule')
  const [viewMode, setViewMode] = useState<'all' | 'staff'>('staff')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [staffs, setStaffs] = useState<Staff[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [classLogRows, setClassLogRows] = useState<ClassLogRow[]>([])

  const [editingCell, setEditingCell] = useState<{
    date: string
    hour: string
    staffId?: number
  } | null>(null)

  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')

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
    const weekDates = getWeekDates(weekBaseDate)
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
        fetch(
          `/api/class-log/by-range?staffId=${selectedStaffId}&startDate=${startDate}&endDate=${endDate}`
        ),
      ])

      const scheduleJson = await scheduleRes.json()
      const classJson = await classRes.json()

      if (!scheduleJson.ok) throw new Error(scheduleJson.message ?? '시간표 조회 실패')
      if (!classJson.ok) throw new Error(classJson.message ?? '수업기록 조회 실패')

      setScheduleRows(scheduleJson.rows)
      setClassLogRows(classJson.rows)
      return
    }

    const activeEmployees = staffs.filter((s) => s.role === 'employee')
    const results = await Promise.all(
      activeEmployees.map(async (staff) => {
        const [scheduleRes, classRes] = await Promise.all([
          fetch(`/api/schedule?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`),
          fetch(
            `/api/class-log/by-range?staffId=${staff.id}&startDate=${startDate}&endDate=${endDate}`
          ),
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
        await loadWeekData()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '시간표 조회 실패')
      } finally {
        setLoading(false)
      }
    }

    if (staffs.length > 0) run()
  }, [selectedStaffId, weekBaseDate, viewMode, staffs.length])

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
        createdByStaffId: staffId,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setEditingCell(null)
      setScheduleChildId('')
      setSelectedMinute('00')
      await loadWeekData()
    }
  }
async function handleDeleteSchedule(scheduleId: number) {
    const firstRes = await fetch('/api/schedule/save', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
    })

    const firstJson = await firstRes.json()

    if (firstJson.needsConfirm) {
      const ok = window.confirm(firstJson.message)
      if (!ok) return

      const secondRes = await fetch('/api/schedule/save', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, confirmDelete: true }),
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

  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate])
  const hourSlots = useMemo(() => buildHourSlots(9, 20), [])

  const employeeStaffs = staffs.filter((s) => s.role === 'employee')
  const selectedStaff = employeeStaffs.find((s) => s.id === selectedStaffId) ?? null

  function getScheduleEntries(date: string, hourSlot: string, staffId?: number) {
    const hour = extractHour(hourSlot)

    return scheduleRows
      .filter((row) => {
        const sameHour =
          row.schedule_date === date && extractHour(row.time_slot) === hour
        if (!sameHour) return false
        if (typeof staffId === 'number') return row.staff_id === staffId
        return true
      })
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
  }

  function getClassLogStatus(
    date: string,
    timeSlot: string,
    childId: number,
    staffId: number
  ) {
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
function getDefaultStatus(
    date: string,
    timeSlot: string,
    childId: number,
    staffId: number
  ) {
    return getClassLogStatus(date, timeSlot, childId, staffId) ?? 'attended'
  }

  function renderScheduleCard(entry: ScheduleRow, dateStr: string, staffId: number) {
    const child = children.find((c) => c.id === entry.child_id) ?? null
    const status = child
      ? getClassLogStatus(dateStr, entry.time_slot, child.id, staffId)
      : undefined

    const defaultStatus = child
      ? getDefaultStatus(dateStr, entry.time_slot, child.id, staffId)
      : 'attended'

    return (
      <div
        key={entry.id}
        className={`rounded px-1.5 py-1 text-xs ${getItemStyle(status)}`}
      >
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
        </button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl rounded-2xl bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setTab('schedule')}
            className={`rounded-xl px-4 py-2 ${tab === 'schedule' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            시간표 관리
          </button>
          <button
            onClick={() => setTab('children')}
            className={`rounded-xl px-4 py-2 ${tab === 'children' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            아이 관리
          </button>
          <button
            onClick={() => setTab('staff')}
            className={`rounded-xl px-4 py-2 ${tab === 'staff' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            선생님 관리
          </button>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'schedule' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h1 className="text-2xl font-bold">관리자 시간표</h1>

              <div className="flex flex-col gap-2 md:flex-row">
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'all' | 'staff')}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="staff">선생님별 보기</option>
                  <option value="all">전체 보기</option>
                </select>

                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border px-3 py-2"
                  disabled={viewMode === 'all'}
                >
                  <option value="">선생님 선택</option>
                  {employeeStaffs.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} ({staff.login_id})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() - 7)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2"
                >
                  ◀
                </button>
                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() + 7)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2"
                >
                  ▶
                </button>
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
              <div className="overflow-x-auto">
                <table className="min-w-full border text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-slate-100 px-1 py-2">시간</th>

                      {viewMode === 'staff'
                        ? weekDates.map((date, idx) => (
                            <th
                              key={`staff-${idx}`}
                              className="min-w-[150px] border bg-slate-100 px-1 py-2"
                            >
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
                                          setScheduleChildId(
                                            e.target.value ? Number(e.target.value) : ''
                                          )
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
                                            setScheduleChildId(
                                              e.target.value ? Number(e.target.value) : ''
                                            )
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
            )}
          </div>
        ) : null}

        {tab === 'children' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">아이 등록 / 수정</h2>
              <div className="space-y-3">
                <input value={childForm.chartNo} onChange={(e) => setChildForm((p) => ({ ...p, chartNo: e.target.value }))} placeholder="차트번호" className="w-full rounded-xl border px-3 py-2" />
                <input value={childForm.childName} onChange={(e) => setChildForm((p) => ({ ...p, childName: e.target.value }))} placeholder="이름" className="w-full rounded-xl border px-3 py-2" />
                <input type="date" value={childForm.birthDate} onChange={(e) => setChildForm((p) => ({ ...p, birthDate: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                <input value={childForm.phone} onChange={(e) => setChildForm((p) => ({ ...p, phone: e.target.value }))} placeholder="핸드폰 번호" className="w-full rounded-xl border px-3 py-2" />
                <select value={childForm.voucherType} onChange={(e) => setChildForm((p) => ({ ...p, voucherType: e.target.value as VoucherType }))} className="w-full rounded-xl border px-3 py-2">
                  <option value="none">일반</option>
                  <option value="edu_office">교육청 바우처</option>
                  <option value="mental_health">아청심 바우처</option>
                  <option value="after_school">방과후 바우처</option>
                  <option value="gugu">구구 바우처</option>
                </select>
                <input value={childForm.notes} onChange={(e) => setChildForm((p) => ({ ...p, notes: e.target.value }))} placeholder="메모" className="w-full rounded-xl border px-3 py-2" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={childForm.isActive} onChange={(e) => setChildForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  사용중
                </label>
                <button onClick={handleSaveChild} className="w-full rounded-xl bg-black py-2 text-white">
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
                <input value={staffForm.loginId} onChange={(e) => setStaffForm((p) => ({ ...p, loginId: e.target.value }))} placeholder="로그인 ID" className="w-full rounded-xl border px-3 py-2" />
                <input value={staffForm.name} onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))} placeholder="이름" className="w-full rounded-xl border px-3 py-2" />
                <input type="password" value={staffForm.password} onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))} placeholder={staffForm.id ? '비밀번호 변경 시만 입력' : '비밀번호'} className="w-full rounded-xl border px-3 py-2" />
                <select value={staffForm.role} onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value as 'admin' | 'employee' }))} className="w-full rounded-xl border px-3 py-2">
                  <option value="employee">employee</option>
                  <option value="admin">admin</option>
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={staffForm.isActive} onChange={(e) => setStaffForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  사용중
                </label>
                <button onClick={handleSaveStaff} className="w-full rounded-xl bg-black py-2 text-white">
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
                className="mb-4 w-full rounded-xl border px-3 py-2"
              >
                <option value="attended">출석</option>
                <option value="absent">결석</option>
                <option value="makeup">보강</option>
                <option value="same_day_absent">당일결석</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleSaveRecordStatus} className="flex-1 rounded-xl bg-indigo-600 py-2 text-white">
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
                  className="flex-1 rounded-xl bg-slate-300 py-2"
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
