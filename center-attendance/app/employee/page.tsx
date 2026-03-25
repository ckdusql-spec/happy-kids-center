'use client'

import { useEffect, useMemo, useState } from 'react'

type User = {
  id: number
  loginId: string
  name: string
  role: 'admin' | 'employee'
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
}

type Attendance = {
  id: number
  work_date: string
  check_in_time: string | null
  check_out_time: string | null
} | null

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

type TodayOverviewRow = {
  id: number
  staff_id: number
  child_id: number
  schedule_date: string
  time_slot: string
  memo: string | null
  input_status: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null
}

function formatKSTDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  })
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

function getItemStyle(status?: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null) {
  if (status === 'attended') return 'bg-blue-100 text-blue-700'
  if (status === 'makeup') return 'bg-blue-100 text-blue-700'
  if (status === 'absent') return 'bg-red-50 text-red-400'
  if (status === 'same_day_absent') return 'bg-red-200 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

function getStatusText(status?: 'attended' | 'absent' | 'makeup' | 'same_day_absent' | null) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'same_day_absent') return '당일결석'
  if (status === 'makeup') return '보강'
  return '미입력'
}

export default function EmployeePage() {
  const [tab, setTab] = useState<'today' | 'schedule'>('today')
  const [user, setUser] = useState<User | null>(null)
  const [message, setMessage] = useState('사용자 확인 중...')
  const [loading, setLoading] = useState(false)
  const [time, setTime] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [todayAttendance, setTodayAttendance] = useState<Attendance>(null)

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [classLogRows, setClassLogRows] = useState<ClassLogRow[]>([])
  const [todayMode, setTodayMode] = useState<'all' | 'missing'>('all')
  const [todayRows, setTodayRows] = useState<TodayOverviewRow[]>([])

  const [editingCell, setEditingCell] = useState<{ date: string; hour: string } | null>(null)
  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [scheduleMemo, setScheduleMemo] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const [recordModal, setRecordModal] = useState<{
    open: boolean
    scheduleId: number | null
    childId: number | null
    classDate: string
    classTime: string
    status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
  }>({
    open: false,
    scheduleId: null,
    childId: null,
    classDate: '',
    classTime: '',
    status: 'attended',
  })

  const [childInfoModal, setChildInfoModal] = useState<{
    open: boolean
    child: Child | null
  }>({
    open: false,
    child: null,
  })

  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate])
  const hourSlots = useMemo(() => buildHourSlots(9, 20), [])

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour12: false,
        })
      )
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    localStorage.removeItem('savedLoginId')
    window.location.href = '/'
  }

  async function loadChildren() {
    const res = await fetch('/api/children')
    const json = await res.json()

    if (json.ok) {
      setChildren(json.children)
    } else {
      setMessage(json.message ?? '아이 목록 조회 실패')
    }
  }

  async function loadTodayAttendance(staffId: number) {
    const res = await fetch(`/api/today-attendance?staffId=${staffId}`)
    const json = await res.json()

    if (json.ok) {
      setTodayAttendance(json.attendance)
    }
  }

  async function loadWeekData(staffId: number, baseDate: Date) {
    const weekDates = getWeekDates(baseDate)
    const startDate = toDateString(weekDates[0])
    const endDate = toDateString(weekDates[5])

    const [scheduleRes, classRes] = await Promise.all([
      fetch(`/api/schedule?staffId=${staffId}&startDate=${startDate}&endDate=${endDate}`),
      fetch(`/api/class-log/by-range?staffId=${staffId}&startDate=${startDate}&endDate=${endDate}`),
    ])

    const scheduleJson = await scheduleRes.json()
    const classJson = await classRes.json()

    if (scheduleJson.ok) {
      setScheduleRows(scheduleJson.rows)
    } else {
      setMessage(scheduleJson.message ?? '시간표 조회 실패')
    }

    if (classJson.ok) {
      setClassLogRows(classJson.rows)
    } else {
      setMessage(classJson.message ?? '수업기록 조회 실패')
    }
  }

  async function loadTodayOverview(staffId: number, mode: 'all' | 'missing') {
    const res = await fetch(`/api/admin/today-overview?mode=${mode}`)
    const json = await res.json()

    if (!json.ok) {
      setMessage(json.message ?? '오늘 수업 조회 실패')
      return
    }

    const rows = (json.rows ?? []).filter((row: TodayOverviewRow) => row.staff_id === staffId)
    setTodayRows(rows)
  }

  useEffect(() => {
    async function init() {
      const meRes = await fetch('/api/me')
      const meJson = await meRes.json()

      if (!meJson.ok) {
        setMessage(meJson.message ?? '로그인 정보 없음')
        return
      }

      setUser(meJson.user)
      await loadChildren()
      await loadTodayAttendance(meJson.user.id)
      await loadWeekData(meJson.user.id, weekBaseDate)
      await loadTodayOverview(meJson.user.id, todayMode)
      setMessage('')
    }

    init()
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => {
  if (!user) return

  const run = async () => {
    if (tab === 'schedule') {
      await loadWeekData(user.id, weekBaseDate)
    }

    if (tab === 'today') {
      await loadTodayOverview(user.id, todayMode)
    }
  }

  void run()
}, [weekBaseDate, user, tab, todayMode])


  async function handleAttendance(type: 'check_in' | 'check_out') {
    if (!user) return

    setLoading(true)
    setMessage('')

    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: user.id, type }),
    })

    const json = await res.json()
    setLoading(false)
    setMessage(json.message)

    if (json.ok) {
      await loadTodayAttendance(user.id)
    }
  }

  async function handleSaveSchedule(date: string, hourSlot: string) {
    if (!user) return

    if (!scheduleChildId) {
      setMessage('학생을 선택하세요.')
      return
    }

    const timeSlot = `${extractHour(hourSlot)}:${selectedMinute}`

    const res = await fetch('/api/schedule/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: user.id,
        childId: scheduleChildId,
        scheduleDate: date,
        timeSlot,
        memo: scheduleMemo,
        createdByStaffId: user.id,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setEditingCell(null)
      setScheduleChildId('')
      setSelectedMinute('00')
      setScheduleMemo('')
      setIsDirty(false)
      await loadWeekData(user.id, weekBaseDate)
      await loadTodayOverview(user.id, todayMode)
    }
  }

  async function handleDeleteSchedule(scheduleId: number) {
    if (!user) return

    const res = await fetch('/api/schedule/save', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId, actorStaffId: user.id }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      await loadChildren()
      await loadWeekData(user.id, weekBaseDate)
      await loadTodayOverview(user.id, todayMode)
    }
  }

  async function handleEditMemo(scheduleId: number, currentMemo: string | null) {
    if (!user) return

    const nextMemo = window.prompt('메모 수정', currentMemo ?? '')
    if (nextMemo === null) return

    const res = await fetch('/api/schedule/save', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduleId,
        memo: nextMemo,
        actorStaffId: user.id,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      await loadWeekData(user.id, weekBaseDate)
      await loadTodayOverview(user.id, todayMode)
    }
  }

  async function handleSaveRecordStatus() {
    if (!user || !recordModal.childId) return

    const res = await fetch('/api/class-log/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: user.id,
        childId: recordModal.childId,
        classDate: recordModal.classDate,
        classTime: recordModal.classTime,
        status: recordModal.status,
        note: '',
        actorStaffId: user.id,
      }),
    })

    const json = await res.json()
    setMessage(json.message)

    if (json.ok) {
      setRecordModal({
        open: false,
        scheduleId: null,
        childId: null,
        classDate: '',
        classTime: '',
        status: 'attended',
      })

      await loadChildren()
      await loadWeekData(user.id, weekBaseDate)
      await loadTodayOverview(user.id, todayMode)
    }
  }

  function getScheduleEntries(date: string, hourSlot: string) {
    const hour = extractHour(hourSlot)
    return scheduleRows
      .filter((row) => row.schedule_date === date && extractHour(row.time_slot) === hour)
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
  }

  function getClassLogStatus(date: string, timeSlot: string, childId: number) {
    const matched = classLogRows.find((row) => {
      const t = new Date(row.class_time).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })
      return row.class_date === date && t === timeSlot && row.child_id === childId
    })

    return matched?.status
  }

  function getDefaultStatus(date: string, timeSlot: string, childId: number) {
    return getClassLogStatus(date, timeSlot, childId) ?? 'attended'
  }

  function renderScheduleEntry(entry: ScheduleRow, dateStr: string) {
    const child = children.find((c) => c.id === entry.child_id) ?? null
    const status = child ? getClassLogStatus(dateStr, entry.time_slot, child.id) : undefined
    const defaultStatus = child ? getDefaultStatus(dateStr, entry.time_slot, child.id) : 'attended'
    const hasRecordedStatus = !!status

    return (
      <div
        key={entry.id}
        className={`rounded-xl p-3 text-sm ${getItemStyle(status)}`}
      >
        <button
          type="button"
          onClick={() => {
            if (!child) return
            setRecordModal({
              open: true,
              scheduleId: entry.id,
              childId: child.id,
              classDate: dateStr,
              classTime: entry.time_slot,
              status: defaultStatus,
            })
          }}
          className="w-full text-left"
        >
          <div className="font-medium">
            {entry.time_slot} {child ? child.display_name : '이름없음'}
          </div>

          {entry.memo ? (
            <div className="mt-1 text-[11px] leading-tight text-slate-500">
              {entry.memo}
            </div>
          ) : null}

          {child ? (
            <div className="mt-2 flex flex-wrap gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${getVoucherChipClass(
                  child.voucher_color
                )}`}
              >
                {child.voucher_label}
              </span>
            </div>
          ) : null}
        </button>

        <div className="mt-2 flex flex-wrap gap-1">
          {child ? (
            <button
              type="button"
              onClick={() =>
                setChildInfoModal({
                  open: true,
                  child,
                })
              }
              className="rounded bg-white/70 px-2 py-1 text-xs"
            >
              아이정보
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => handleEditMemo(entry.id, entry.memo)}
            className="rounded bg-white/70 px-2 py-1 text-xs"
          >
            메모수정
          </button>

          {hasRecordedStatus ? (
            <span className="rounded bg-white/70 px-2 py-1 text-xs text-slate-600">
              관리자만 삭제 가능
            </span>
          ) : (
            <button
              type="button"
              onClick={() => handleDeleteSchedule(entry.id)}
              className="rounded bg-white/70 px-2 py-1 text-xs"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderMobileDayCard(date: Date) {
    const dateStr = toDateString(date)

    return (
      <div key={dateStr} className="rounded-2xl border bg-white p-4">
        <div className="mb-3 text-base font-bold">{dateStr}</div>

        <div className="space-y-3">
          {hourSlots.map((hourSlot) => {
            const entries = getScheduleEntries(dateStr, hourSlot)
            const isEditing =
              editingCell?.date === dateStr && editingCell?.hour === hourSlot

            return (
              <div key={`${dateStr}-${hourSlot}`} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">{getHourLabel(hourSlot)}</div>

                {isEditing ? (
                  <div className="space-y-2">
                    <select
                      value={scheduleChildId}
                      onChange={(e) => {
                        setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                        setIsDirty(true)
                      }}
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
                      onChange={(e) => {
                        setSelectedMinute(e.target.value)
                        setIsDirty(true)
                      }}
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
                      onChange={(e) => {
                        setScheduleMemo(e.target.value)
                        setIsDirty(true)
                      }}
                      placeholder="메모 입력"
                      className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveSchedule(dateStr, hourSlot)}
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
                          setIsDirty(false)
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
                        setEditingCell({ date: dateStr, hour: hourSlot })
                        setScheduleChildId('')
                        setSelectedMinute('00')
                        setScheduleMemo('')
                        setIsDirty(false)
                      }}
                      className="mb-2 w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-left text-sm text-slate-500"
                    >
                      + 추가
                    </button>

                    {entries.length === 0 ? (
                      <div className="text-xs text-slate-400">등록 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry) => renderScheduleEntry(entry, dateStr))}
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

    return (
      <div key={row.id} className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{row.time_slot}</div>
            <div className="text-sm text-slate-700">{child?.display_name ?? '이름없음'}</div>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs ${getItemStyle(row.input_status)}`}>
            {getStatusText(row.input_status)}
          </span>
        </div>

        {row.memo ? <div className="mt-2 text-xs text-slate-500">{row.memo}</div> : null}

        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              if (!child) return
              setRecordModal({
                open: true,
                scheduleId: row.id,
                childId: child.id,
                classDate: row.schedule_date,
                classTime: row.time_slot,
                status: (row.input_status ?? 'attended') as
                  | 'attended'
                  | 'absent'
                  | 'makeup'
                  | 'same_day_absent',
              })
            }}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs"
          >
            상태입력
          </button>
        </div>
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
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-bold text-blue-600">{time}</div>
            <h1 className="mt-2 text-xl font-bold">직원 화면</h1>
            <p className="text-sm text-slate-500">
              {user ? `${user.name} (${user.loginId})` : '사용자 없음'}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
          >
            로그아웃
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <button
            onClick={() => handleAttendance('check_in')}
            disabled={loading || !user}
            className="rounded-xl bg-green-500 py-3 text-white disabled:opacity-50"
          >
            출근
          </button>

          <button
            onClick={() => handleAttendance('check_out')}
            disabled={loading || !user}
            className="rounded-xl bg-blue-500 py-3 text-white disabled:opacity-50"
          >
            퇴근
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="mb-2 font-semibold">오늘 출퇴근</div>
          <div>출근 시간: {formatKSTDateTime(todayAttendance?.check_in_time ?? null)}</div>
          <div>퇴근 시간: {formatKSTDateTime(todayAttendance?.check_out_time ?? null)}</div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setTab('today')}
            className={`rounded-xl px-4 py-2 ${tab === 'today' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            오늘보기
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={`rounded-xl px-4 py-2 ${tab === 'schedule' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            주간시간표
          </button>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'today' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-bold">오늘 수업 / 미입력</h2>

              <div className="flex gap-2">
                <button
                  onClick={() => setTodayMode('all')}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    todayMode === 'all' ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                  }`}
                >
                  전체
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
                오늘 데이터 없음
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {todayRows.map((row) => renderTodayCard(row))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'schedule' ? (
          <div className="mt-6 border-t pt-6">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-bold">주간 시간표</h2>

              <div className="flex gap-2">
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

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border text-sm">
                <thead>
                  <tr>
                    <th className="border bg-slate-100 px-2 py-2">시간</th>
                    {weekDates.map((date, idx) => (
                      <th key={idx} className="min-w-[240px] border bg-slate-100 px-2 py-2">
                        <div className="text-sm font-semibold">
                          {['월', '화', '수', '목', '금', '토'][idx]} {toShortMonthDay(date)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hourSlot) => (
                    <tr key={hourSlot}>
                      <td className="whitespace-nowrap border bg-slate-50 px-2 py-2 font-medium">
                        {getHourLabel(hourSlot)}
                      </td>

                      {weekDates.map((date) => {
                        const dateStr = toDateString(date)
                        const entries = getScheduleEntries(dateStr, hourSlot)
                        const isEditing =
                          editingCell?.date === dateStr && editingCell?.hour === hourSlot

                        return (
                          <td
                            key={`${dateStr}-${hourSlot}`}
                            className="min-w-[240px] border px-2 py-2 align-top"
                          >
                            {isEditing ? (
                              <div className="min-h-[88px] space-y-2">
                                <select
                                  value={scheduleChildId}
                                  onChange={(e) => {
                                    setScheduleChildId(
                                      e.target.value ? Number(e.target.value) : ''
                                    )
                                    setIsDirty(true)
                                  }}
                                  className="w-full rounded border bg-white px-2 py-2 text-sm"
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
                                  onChange={(e) => {
                                    setSelectedMinute(e.target.value)
                                    setIsDirty(true)
                                  }}
                                  className="w-full rounded border bg-white px-2 py-2 text-sm"
                                >
                                  {getMinutesOptions().map((m) => (
                                    <option key={m} value={m}>
                                      {m}분
                                    </option>
                                  ))}
                                </select>

                                <input
                                  value={scheduleMemo}
                                  onChange={(e) => {
                                    setScheduleMemo(e.target.value)
                                    setIsDirty(true)
                                  }}
                                  placeholder="메모 입력"
                                  className="w-full rounded border bg-white px-2 py-2 text-sm"
                                />

                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSaveSchedule(dateStr, hourSlot)}
                                    className="flex-1 rounded bg-indigo-600 px-2 py-2 text-white"
                                  >
                                    추가
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingCell(null)
                                      setScheduleChildId('')
                                      setSelectedMinute('00')
                                      setScheduleMemo('')
                                      setIsDirty(false)
                                    }}
                                    className="flex-1 rounded bg-slate-300 px-2 py-2"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCell({ date: dateStr, hour: hourSlot })
                                    setScheduleChildId('')
                                    setSelectedMinute('00')
                                    setScheduleMemo('')
                                    setIsDirty(false)
                                  }}
                                  className="min-h-[36px] w-full rounded border border-dashed border-slate-300 p-2 text-left text-slate-500 hover:bg-slate-100"
                                >
                                  + 추가
                                </button>

                                {entries.map((entry) => renderScheduleEntry(entry, dateStr))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 md:hidden">
              {weekDates.map((date) => renderMobileDayCard(date))}
            </div>

            <div className="mt-3 text-sm text-slate-500">
              파랑=출석/보강, 연빨강=결석, 빨강=당일결석
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
                      scheduleId: null,
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

        {childInfoModal.open && childInfoModal.child ? (
          <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-bold">아이 정보</h3>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">이름:</span> {childInfoModal.child.child_name}
                </div>
                <div>
                  <span className="font-semibold">나이:</span> {childInfoModal.child.age_text || '-'}
                </div>
                <div>
                  <span className="font-semibold">차트번호:</span> {childInfoModal.child.chart_no || '-'}
                </div>
                <div>
                  <span className="font-semibold">생년월일:</span> {childInfoModal.child.birth_date || '-'}
                </div>
                <div>
                  <span className="font-semibold">핸드폰:</span> {childInfoModal.child.phone || '-'}
                </div>
                <div>
                  <span className="font-semibold">바우처:</span> {childInfoModal.child.voucher_label}
                </div>
                <div>
                  <span className="font-semibold">메모:</span> {childInfoModal.child.notes || '-'}
                </div>
              </div>

              <div className="mt-5">
                <button
                  onClick={() =>
                    setChildInfoModal({
                      open: false,
                      child: null,
                    })
                  }
                  className="w-full rounded-xl bg-slate-300 py-3 md:py-2"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}