'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MainTab = 'today' | 'schedule' | 'week_overview'
type AttendanceStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'
type StaffRole = 'admin' | 'employee'

type User = {
  id: number
  name: string
  loginId: string
  role: StaffRole
}

type StaffRow = {
  id: number
  login_id: string
  name: string
  role: StaffRole
  is_active: boolean
}

type ChildRow = {
  id: number
  chart_no: string | null
  child_name: string
  birth_date: string | null
  phone: string | null
  vouchers: string[] | null
  base_price?: number | null
  voucher_prices?: Record<string, number> | null
  notes: string | null
  is_active: boolean
}

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  minute_slot: number | null
  teacher_id: number
  teacher_name: string | null
  child_id: number | null
  voucher_type: string | null
  note: string | null
  is_active: boolean | null
  is_group: boolean | null
  group_id: string | null
  group_name: string | null
  created_at?: string | null
  updated_at?: string | null
}

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: AttendanceStatus
  voucher_type?: string | null
  is_group?: boolean | null
  group_id?: string | null
  group_name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type DisplayScheduleItem = {
  key: string
  date: string
  hourSlot: string
  minuteSlot: number
  staffId: number
  teacherName: string
  voucherType: string
  note: string
  isGroup: boolean
  groupId: string | null
  groupName: string | null
  rows: ScheduleEntryRow[]
}

type EditingCell = {
  date: string
  hour: string
} | null

const VOUCHER_FALLBACK = ['일반']
const STATUS_OPTIONS: AttendanceStatus[] = ['attended', 'absent', 'makeup', 'same_day_absent']

function toDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toShortMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDates(baseDate: Date) {
  const monday = getMonday(baseDate)
  return Array.from({ length: 6 }, (_, i) => {
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

function getAgeText(birthDate: string | null | undefined) {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  const dayDiff = now.getDate() - birth.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
  return String(age)
}

function getDisplayName(child: ChildRow) {
  const ageText = getAgeText(child.birth_date)
  return ageText ? `${child.child_name} (${ageText})` : child.child_name
}

function getVoucherLabel(vouchers: string[] | null | undefined) {
  if (!vouchers || vouchers.length === 0) return '일반'
  return vouchers.join(', ')
}

function getVoucherClass(voucher: string | null | undefined) {
  if (voucher === '디딤') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (voucher === '아청심') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (voucher === '드림스타트') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (voucher === '배움') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (voucher === '그룹수업') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function getStatusLabel(status: AttendanceStatus) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'makeup') return '보강'
  return '당일결석'
}

function getStatusClass(status: AttendanceStatus) {
  if (status === 'attended') return 'bg-blue-100 text-blue-700'
  if (status === 'makeup') return 'bg-sky-100 text-sky-700'
  if (status === 'absent') return 'bg-rose-50 text-rose-600'
  return 'bg-red-100 text-red-700'
}

function getEntryMinuteTotal(entry: ScheduleEntryRow) {
  return Number(entry.time_slot.slice(0, 2)) * 60 + Number(entry.minute_slot ?? 0)
}

function getKSTHourMinuteFromISO(value: string) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))

  const hour = parts.find((p) => p.type === 'hour')?.value
  const minute = parts.find((p) => p.type === 'minute')?.value

  if (!hour || !minute) return null
  return { hour: Number(hour), minute: Number(minute) }
}

function getLogMinuteTotal(log: ClassLogRow) {
  if (!log.class_time) return null
  const hm = getKSTHourMinuteFromISO(log.class_time)
  if (!hm) return null
  return hm.hour * 60 + hm.minute
}

function buildClassTimestamp(date: string, hourSlot: string, minute: number | null | undefined) {
  const hour = hourSlot.slice(0, 2)
  const mm = String(Number(minute ?? 0)).padStart(2, '0')
  return `${date}T${hour}:${mm}:00+09:00`
}

function buildLogicalAttendanceKey(args: {
  classDate: string
  minuteTotal: number
  staffId: number
  childId: number
  isGroup: boolean
  groupId: string | null
}) {
  return [
    args.classDate,
    args.minuteTotal,
    args.staffId,
    args.childId,
    args.isGroup ? 'group' : 'single',
    args.groupId ?? '',
  ].join('|')
}

function uniqueDateList(values: string[]) {
  return Array.from(new Set(values)).sort().join(', ')
}

function getMonthStartEnd(base: Date) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1)
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return { start: toDateString(start), end: toDateString(end) }
}

export default function EmployeePage() {
  const [tab, setTab] = useState<MainTab>('today')
  const [user, setUser] = useState<User | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [children, setChildren] = useState<ChildRow[]>([])
  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleEntryRow[]>([])
  const [classLogRows, setClassLogRows] = useState<ClassLogRow[]>([])

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [selectedTodayDate, setSelectedTodayDate] = useState(() => toDateString(new Date()))

  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [selectedVoucher, setSelectedVoucher] = useState('')
  const [scheduleMemo, setScheduleMemo] = useState('')
  const [isGroupLesson, setIsGroupLesson] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [selectedGroupChildIds, setSelectedGroupChildIds] = useState<number[]>([])

  const [recordModal, setRecordModal] = useState<{
    open: boolean
    entry: ScheduleEntryRow | null
    status: AttendanceStatus
  }>({
    open: false,
    entry: null,
    status: 'attended',
  })

  const [childInfoModal, setChildInfoModal] = useState<{
    open: boolean
    child: ChildRow | null
  }>({
    open: false,
    child: null,
  })

  const weekDates = useMemo(() => getWeekDates(weekBaseDate), [weekBaseDate])
  const hourSlots = useMemo(() => buildHourSlots(9, 20), [])
  const weekRange = useMemo(() => {
    return {
      start: toDateString(weekDates[0]),
      end: toDateString(weekDates[weekDates.length - 1]),
    }
  }, [weekDates])

  const dataRange = useMemo(() => {
    const values = [weekRange.start, weekRange.end, selectedTodayDate].sort()
    return {
      start: values[0],
      end: values[values.length - 1],
    }
  }, [weekRange.start, weekRange.end, selectedTodayDate])

  const filteredGroupChildren = useMemo(() => {
    const keyword = groupSearch.trim()
    return children.filter((c) => {
      if (!c.is_active) return false
      if (!keyword) return true
      return c.child_name.includes(keyword) || getDisplayName(c).includes(keyword)
    })
  }, [children, groupSearch])

  const attendanceMap = useMemo(() => {
    const map = new Map<string, ClassLogRow>()

    classLogRows.forEach((log) => {
      const minuteTotal = getLogMinuteTotal(log)
      if (minuteTotal == null) return

      const key = buildLogicalAttendanceKey({
        classDate: log.class_date,
        minuteTotal,
        staffId: Number(log.staff_id),
        childId: Number(log.child_id),
        isGroup: Boolean(log.is_group),
        groupId: log.group_id ?? null,
      })

      const prev = map.get(key)
      if (!prev) {
        map.set(key, log)
        return
      }

      const prevTime = new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()
      const nextTime = new Date(log.updated_at ?? log.created_at ?? 0).getTime()

      if (nextTime >= prevTime) {
        map.set(key, log)
      }
    })

    return map
  }, [classLogRows])

  const todayItems = useMemo(() => {
    return scheduleRows
      .filter((row) => row.date === selectedTodayDate && row.is_active)
      .map((row) => {
        const child = children.find((c) => Number(c.id) === Number(row.child_id))
        const status = attendanceMap.get(getAttendanceKey(row))?.status ?? null
        return { row, child, status }
      })
      .sort((a, b) => {
        const aMinute = getEntryMinuteTotal(a.row)
        const bMinute = getEntryMinuteTotal(b.row)
        return aMinute - bMinute
      })
  }, [scheduleRows, children, attendanceMap, selectedTodayDate])

  const selectedChildMonthlyLogs = useMemo(() => {
    if (!childInfoModal.child) return []
    const { start, end } = getMonthStartEnd(new Date())
    return classLogRows.filter(
      (log) =>
        Number(log.child_id) === Number(childInfoModal.child?.id) &&
        log.class_date >= start &&
        log.class_date <= end
    )
  }, [childInfoModal.child, classLogRows])

  const childInfoDates = useMemo(() => {
    const individualRows = selectedChildMonthlyLogs.filter((r) => !r.is_group)
    const groupRows = selectedChildMonthlyLogs.filter((r) => Boolean(r.is_group))

    return {
      attended: uniqueDateList(individualRows.filter((r) => r.status === 'attended').map((r) => r.class_date)),
      makeup: uniqueDateList(individualRows.filter((r) => r.status === 'makeup').map((r) => r.class_date)),
      absent: uniqueDateList(individualRows.filter((r) => r.status === 'absent').map((r) => r.class_date)),
      sameDayAbsent: uniqueDateList(individualRows.filter((r) => r.status === 'same_day_absent').map((r) => r.class_date)),
      groupAttended: uniqueDateList(
        groupRows.filter((r) => r.status === 'attended' || r.status === 'makeup').map((r) => r.class_date)
      ),
      groupAbsent: uniqueDateList(
        groupRows.filter((r) => r.status === 'absent' || r.status === 'same_day_absent').map((r) => r.class_date)
      ),
    }
  }, [selectedChildMonthlyLogs])

  function getAttendanceKey(entry: ScheduleEntryRow) {
    return buildLogicalAttendanceKey({
      classDate: entry.date,
      minuteTotal: getEntryMinuteTotal(entry),
      staffId: Number(entry.teacher_id),
      childId: Number(entry.child_id),
      isGroup: Boolean(entry.is_group),
      groupId: entry.group_id ?? null,
    })
  }

  function resetScheduleEditor() {
    setEditingCell(null)
    setEditingEntryId(null)
    setEditingGroupId(null)
    setScheduleChildId('')
    setSelectedMinute('00')
    setSelectedVoucher('')
    setScheduleMemo('')
    setIsGroupLesson(false)
    setGroupName('')
    setGroupSearch('')
    setSelectedGroupChildIds([])
  }

  function buildDisplayItems(dateStr: string, hourSlot: string) {
    const rows = scheduleRows.filter(
      (entry) =>
        entry.date === dateStr &&
        entry.time_slot === hourSlot &&
        Number(entry.teacher_id) === Number(user?.id) &&
        entry.is_active
    )

    const groupMap = new Map<string, DisplayScheduleItem>()

    rows.forEach((row) => {
      const itemKey =
        row.is_group && row.group_id
          ? `group-${row.group_id}`
          : `single-${row.id}`

      if (!groupMap.has(itemKey)) {
        groupMap.set(itemKey, {
          key: itemKey,
          date: row.date,
          hourSlot: row.time_slot,
          minuteSlot: Number(row.minute_slot ?? 0),
          staffId: Number(row.teacher_id),
          teacherName: row.teacher_name ?? '',
          voucherType: row.voucher_type ?? '',
          note: row.note ?? '',
          isGroup: Boolean(row.is_group),
          groupId: row.group_id ?? null,
          groupName: row.group_name ?? null,
          rows: [],
        })
      }

      groupMap.get(itemKey)!.rows.push(row)
    })

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.minuteSlot !== b.minuteSlot) return a.minuteSlot - b.minuteSlot
      return (a.groupName ?? '').localeCompare(b.groupName ?? '', 'ko')
    })
  }

  function buildCompactWeekItems(dateStr: string, hourSlot: string) {
    const items = buildDisplayItems(dateStr, hourSlot)

    return items.map((item) => {
      const names = item.isGroup
        ? item.rows
            .map((row) => children.find((c) => Number(c.id) === Number(row.child_id))?.child_name ?? '')
            .filter(Boolean)
        : [
            children.find((c) => Number(c.id) === Number(item.rows[0]?.child_id))?.child_name ?? '-',
          ]

      const relatedLogs = item.rows
        .map((row) => attendanceMap.get(getAttendanceKey(row)))
        .filter(Boolean)

      let colorClass = 'text-slate-700'
      if (relatedLogs.some((log) => log?.status === 'attended' || log?.status === 'makeup')) {
        colorClass = 'text-blue-600 font-semibold'
      } else if (
        relatedLogs.some((log) => log?.status === 'absent' || log?.status === 'same_day_absent')
      ) {
        colorClass = 'text-red-500 font-semibold'
      }

      const label =
        item.isGroup
          ? names.length <= 2
            ? `${String(item.minuteSlot).padStart(2, '0')} ${names.join(', ')}`
            : `${String(item.minuteSlot).padStart(2, '0')} ${names.slice(0, 2).join(', ')} 외${names.length - 2}`
          : `${String(item.minuteSlot).padStart(2, '0')} ${names[0] ?? '-'}`

      return {
        key: item.key,
        label,
        colorClass,
      }
    })
  }

  function getVoucherOptionsForChild(childId: number | '') {
    if (!childId) return VOUCHER_FALLBACK
    const child = children.find((c) => c.id === Number(childId))
    if (!child) return VOUCHER_FALLBACK
    if (Array.isArray(child.vouchers) && child.vouchers.length > 0) return child.vouchers
    return VOUCHER_FALLBACK
  }

  function toggleGroupChild(childId: number) {
    setSelectedGroupChildIds((prev) => {
      const exists = prev.includes(childId)
      if (exists) return prev.filter((id) => id !== childId)
      if (prev.length >= 8) return prev
      return [...prev, childId]
    })
  }

  function handleEditSchedule(item: DisplayScheduleItem) {
    setEditingCell({
      date: item.date,
      hour: item.hourSlot,
    })

    setScheduleMemo(item.note ?? '')

    if (item.isGroup) {
      setIsGroupLesson(true)
      setEditingGroupId(item.groupId)
      setEditingEntryId(null)
      setSelectedGroupChildIds(item.rows.map((row) => Number(row.child_id)))
      setGroupName(item.groupName || '')
      setSelectedMinute(String(item.minuteSlot).padStart(2, '0'))
      setScheduleChildId('')
      setSelectedVoucher('')
      setGroupSearch('')
    } else {
      const row = item.rows[0]
      if (!row) return
      setIsGroupLesson(false)
      setEditingGroupId(null)
      setEditingEntryId(row.id)
      setScheduleChildId(row.child_id ? Number(row.child_id) : '')
      setSelectedMinute(String(row.minute_slot ?? 0).padStart(2, '0'))
      setSelectedVoucher(row.voucher_type ?? '')
      setSelectedGroupChildIds([])
      setGroupName('')
      setGroupSearch('')
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function loadMe() {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' })
      const json = await res.json()

      if (json?.ok && json?.user) {
        const nextUser: User = {
          id: Number(json.user.id),
          name: json.user.name ?? '',
          loginId: json.user.login_id ?? json.user.loginId ?? '',
          role: (json.user.role ?? 'employee') as StaffRole,
        }

        localStorage.setItem('staff_id', String(nextUser.id))
        localStorage.setItem('staff_name', nextUser.name)
        localStorage.setItem('staff_role', nextUser.role)

        setUser(nextUser)
        return nextUser
      }
    } catch {
      // localStorage fallback 사용
    }

    const storedId = localStorage.getItem('staff_id')
    const storedName = localStorage.getItem('staff_name')
    const storedRole = localStorage.getItem('staff_role') as StaffRole | null

    if (!storedId) {
      setMessage('로그인 정보가 없습니다.')
      return null
    }

    const nextUser: User = {
      id: Number(storedId),
      name: storedName ?? '',
      loginId: '',
      role: storedRole ?? 'employee',
    }

    setUser(nextUser)
    return nextUser
  }

  async function loadStaffs(staffId?: number) {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('id, login_id, name, role, is_active')
      .order('name', { ascending: true })

    if (error) throw error
    setStaffs((data ?? []) as StaffRow[])

    const targetId = Number(staffId ?? user?.id)
    if (targetId) {
      const mine = (data ?? []).find((s: any) => Number(s.id) === targetId)
      if (mine) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                loginId: mine.login_id,
                name: mine.name,
                role: mine.role,
              }
            : {
                id: targetId,
                loginId: mine.login_id,
                name: mine.name,
                role: mine.role,
              }
        )

        localStorage.setItem('staff_id', String(targetId))
        localStorage.setItem('staff_name', mine.name)
        localStorage.setItem('staff_role', mine.role)
      }
    }
  }

  async function loadChildren() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('is_active', true)
      .order('child_name', { ascending: true })

    if (error) throw error
    setChildren((data ?? []) as ChildRow[])
  }

  async function loadSchedules(staffId: number) {
    const { data, error } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('teacher_id', staffId)
      .gte('date', dataRange.start)
      .lte('date', dataRange.end)
      .eq('is_active', true)
      .order('date', { ascending: true })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })

    if (error) throw error
    setScheduleRows((data ?? []) as ScheduleEntryRow[])
  }

  async function loadClassLogs(staffId: number) {
    const { data, error } = await supabase
      .from('class_logs')
      .select('*')
      .eq('staff_id', staffId)
      .gte('class_date', dataRange.start)
      .lte('class_date', dataRange.end)
      .order('class_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    setClassLogRows((data ?? []) as ClassLogRow[])
  }

  async function loadAll(staffId: number) {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([loadStaffs(staffId), loadChildren(), loadSchedules(staffId), loadClassLogs(staffId)])
    } catch (err: any) {
      setMessage(err?.message ?? '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const me = await loadMe()
      if (!mounted || !me) return
      await loadAll(me.id)
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    Promise.all([loadSchedules(user.id), loadClassLogs(user.id)]).catch((err: any) =>
      setMessage(err?.message ?? '주간 데이터 불러오기 실패')
    )
  }, [weekRange.start, weekRange.end, selectedTodayDate, user?.id])

  async function handleLogout() {
    localStorage.removeItem('staff_id')
    localStorage.removeItem('staff_name')
    localStorage.removeItem('staff_role')
    window.location.href = '/'
  }

  async function handleSaveSchedule(dateStr: string, hourSlot: string) {
    try {
      if (!user) return

      const staff = staffs.find((s) => Number(s.id) === Number(user.id))
      const minute = Number(selectedMinute)

      if (isGroupLesson) {
        if (selectedGroupChildIds.length === 0) {
          setMessage('그룹수업 학생을 1명 이상 선택하세요.')
          return
        }
        if (selectedGroupChildIds.length > 8) {
          setMessage('그룹수업은 최대 8명까지 가능합니다.')
          return
        }

        const groupId = editingGroupId || crypto.randomUUID()
        const rows = selectedGroupChildIds.map((childId) => ({
          date: dateStr,
          time_slot: hourSlot,
          minute_slot: minute,
          teacher_id: Number(user.id),
          teacher_name: staff?.name ?? user.name,
          child_id: Number(childId),
          voucher_type: '그룹수업',
          note: scheduleMemo || null,
          is_active: true,
          is_group: true,
          group_id: groupId,
          group_name: groupName || '그룹수업',
        }))

        if (editingGroupId) {
          const { error: offError } = await supabase
            .from('schedule_entries')
            .update({ is_active: false })
            .eq('group_id', editingGroupId)

          if (offError) throw offError
        }

        const { error } = await supabase.from('schedule_entries').insert(rows)
        if (error) throw error
      } else {
        if (!scheduleChildId) {
          setMessage('학생을 선택하세요.')
          return
        }
        if (!selectedVoucher) {
          setMessage('바우처를 선택하세요.')
          return
        }

        if (editingEntryId) {
          const { error } = await supabase
            .from('schedule_entries')
            .update({
              child_id: Number(scheduleChildId),
              minute_slot: minute,
              voucher_type: selectedVoucher,
              note: scheduleMemo || null,
              is_group: false,
              group_id: null,
              group_name: null,
            })
            .eq('id', editingEntryId)

          if (error) throw error
        } else {
          const { error } = await supabase.from('schedule_entries').insert({
            date: dateStr,
            time_slot: hourSlot,
            minute_slot: minute,
            teacher_id: Number(user.id),
            teacher_name: staff?.name ?? user.name,
            child_id: Number(scheduleChildId),
            voucher_type: selectedVoucher,
            note: scheduleMemo || null,
            is_active: true,
            is_group: false,
            group_id: null,
            group_name: null,
          })

          if (error) throw error
        }
      }

      resetScheduleEditor()
      await loadSchedules(user.id)
      setMessage('시간표가 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '시간표 저장 실패')
    }
  }

  async function handleDeleteSchedule(item: DisplayScheduleItem) {
    try {
      if (!user) return
      const ok = window.confirm('이 시간표를 삭제할까요?')
      if (!ok) return

      if (item.isGroup && item.groupId) {
        const { error } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('group_id', item.groupId)

        if (error) throw error
      } else {
        const targetId = item.rows[0]?.id
        if (!targetId) return

        const { error } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('id', targetId)

        if (error) throw error
      }

      await loadSchedules(user.id)
      setMessage('시간표가 삭제되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  function openRecordModal(entry: ScheduleEntryRow) {
    const existing = attendanceMap.get(getAttendanceKey(entry))
    setRecordModal({
      open: true,
      entry,
      status: existing?.status ?? 'attended',
    })
  }

  async function handleSaveRecordStatus() {
    try {
      if (!user || !recordModal.entry) return

      const entry = recordModal.entry
      const classTime = buildClassTimestamp(entry.date, entry.time_slot, entry.minute_slot)
      const existing = attendanceMap.get(getAttendanceKey(entry))

      if (existing?.id) {
        const { error } = await supabase
          .from('class_logs')
          .update({
            status: recordModal.status,
            voucher_type: entry.voucher_type ?? null,
            is_group: Boolean(entry.is_group),
            group_id: entry.group_id ?? null,
            group_name: entry.group_name ?? null,
          })
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('class_logs').insert({
          staff_id: Number(entry.teacher_id),
          child_id: Number(entry.child_id),
          class_date: entry.date,
          class_time: classTime,
          status: recordModal.status,
          voucher_type: entry.voucher_type ?? null,
          is_group: Boolean(entry.is_group),
          group_id: entry.group_id ?? null,
          group_name: entry.group_name ?? null,
        })

        if (error) throw error
      }

      await loadClassLogs(user.id)
      setRecordModal({
        open: false,
        entry: null,
        status: 'attended',
      })
      setMessage('출결이 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '출결 저장 실패')
    }
  }

  function renderScheduleCard(item: DisplayScheduleItem, dateStr: string) {
    const firstChild = children.find((c) => c.id === Number(item.rows[0]?.child_id))
    const title = item.isGroup
      ? `${item.hourSlot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${item.groupName || '그룹수업'}`
      : `${item.hourSlot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${firstChild?.child_name ?? ''} (${getAgeText(firstChild?.birth_date ?? null)})`

    const isEditing =
      editingCell?.date === dateStr &&
      editingCell?.hour === item.hourSlot &&
      (editingEntryId === item.rows[0]?.id || editingGroupId === item.groupId)

    return (
      <div
        key={item.key}
        className={`rounded-lg border border-slate-200 px-2 py-2 text-[11px] shadow-sm ${getScheduleCardBgClass(item, classLogRows)}`}
      >
        {isEditing ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isGroupLesson}
                onChange={(e) => {
                  setIsGroupLesson(e.target.checked)
                  setSelectedVoucher('')
                  setScheduleChildId('')
                  setSelectedGroupChildIds([])
                }}
              />
              그룹수업
            </label>

            {isGroupLesson ? (
              <>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="그룹명"
                  className="w-full rounded border bg-white px-2 py-1 text-xs"
                />
                <input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="학생 이름 검색"
                  className="w-full rounded border bg-white px-2 py-1 text-xs"
                />
                <div className="rounded border bg-white p-2">
                  <div className="mb-2 text-[11px] text-slate-500">
                    학생 선택 ({selectedGroupChildIds.length}/8)
                  </div>
                  <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto">
                    {filteredGroupChildren.map((c) => {
                      const active = selectedGroupChildIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleGroupChild(c.id)}
                          className={`rounded px-2 py-1 text-left text-[11px] ${
                            active ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {getDisplayName(c)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <select
                  value={scheduleChildId}
                  onChange={(e) => setScheduleChildId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded border bg-white px-2 py-1 text-xs"
                >
                  <option value="">학생 선택</option>
                  {children.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>
                      {getDisplayName(c)}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedVoucher}
                  onChange={(e) => setSelectedVoucher(e.target.value)}
                  className="w-full rounded border bg-white px-2 py-1 text-xs"
                >
                  <option value="">바우처 선택</option>
                  {getVoucherOptionsForChild(scheduleChildId).map((voucher) => (
                    <option key={voucher} value={voucher}>
                      {voucher}
                    </option>
                  ))}
                </select>
              </>
            )}

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
                onClick={() => handleSaveSchedule(dateStr, item.hourSlot)}
                className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
              >
                저장
              </button>
              <button
                onClick={resetScheduleEditor}
                className="flex-1 rounded bg-slate-300 px-2 py-1 text-xs"
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
                const firstEntry = item.rows[0]
                if (firstEntry) openRecordModal(firstEntry)
              }}
              className="w-full text-left"
            >
              <div className="font-medium text-slate-800">{title}</div>
            </button>

            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${getVoucherClass(item.voucherType)}`}>
                {item.voucherType || '일반'}
              </span>
              {item.isGroup ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                  그룹
                </span>
              ) : null}
            </div>

            {item.note ? (
              <div className="mt-1 text-[11px] text-slate-500">
                {item.note}
              </div>
            ) : null}

            {item.isGroup ? (
              <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                {item.rows.map((r) => {
                  const child = children.find((c) => c.id === Number(r.child_id))
                  const log = attendanceMap.get(getAttendanceKey(r))

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openRecordModal(r)}
                      className="block w-full rounded bg-white/70 px-2 py-1 text-left hover:bg-white"
                    >
                      {child?.child_name ?? `학생(${r.child_id})`}
                      {log?.status ? ` (${getStatusLabel(log.status)})` : ' (미입력)'}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1">
              {!item.isGroup && firstChild ? (
                <button
                  onClick={() => setChildInfoModal({ open: true, child: firstChild })}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  아이정보
                </button>
              ) : null}

              <button
                onClick={() => handleEditSchedule(item)}
                className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
              >
                수정
              </button>

              <button
                onClick={() => handleDeleteSchedule(item)}
                className="rounded bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
              >
                삭제
              </button>
            </div>
          </>
        )}
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
            const items = buildDisplayItems(dateStr, hourSlot)
            const isEditing =
              editingCell?.date === dateStr && editingCell?.hour === hourSlot

            return (
              <div key={`${dateStr}-${hourSlot}`} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">{getHourLabel(hourSlot)}</div>

                {isEditing ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={isGroupLesson}
                        onChange={(e) => {
                          setIsGroupLesson(e.target.checked)
                          setSelectedVoucher('')
                          setScheduleChildId('')
                          setSelectedGroupChildIds([])
                        }}
                      />
                      그룹수업
                    </label>

                    {isGroupLesson ? (
                      <>
                        <input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="그룹명"
                          className="w-full rounded border bg-white px-2 py-2 text-sm"
                        />
                        <input
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder="학생 이름 검색"
                          className="w-full rounded border bg-white px-2 py-2 text-sm"
                        />
                        <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded border p-2">
                          {filteredGroupChildren.map((c) => {
                            const active = selectedGroupChildIds.includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleGroupChild(c.id)}
                                className={`rounded px-2 py-2 text-left text-sm ${
                                  active ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {getDisplayName(c)}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <select
                          value={scheduleChildId}
                          onChange={(e) => setScheduleChildId(e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded border bg-white px-2 py-2 text-sm"
                        >
                          <option value="">학생 선택</option>
                          {children.filter((c) => c.is_active).map((c) => (
                            <option key={c.id} value={c.id}>
                              {getDisplayName(c)}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedVoucher}
                          onChange={(e) => setSelectedVoucher(e.target.value)}
                          className="w-full rounded border bg-white px-2 py-2 text-sm"
                        >
                          <option value="">바우처 선택</option>
                          {getVoucherOptionsForChild(scheduleChildId).map((voucher) => (
                            <option key={voucher} value={voucher}>
                              {voucher}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(e.target.value)}
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
                      onChange={(e) => setScheduleMemo(e.target.value)}
                      placeholder="메모 입력"
                      className="w-full rounded border bg-white px-2 py-2 text-sm"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveSchedule(dateStr, hourSlot)}
                        className="flex-1 rounded bg-indigo-600 px-3 py-2 text-sm text-white"
                      >
                        저장
                      </button>
                      <button
                        onClick={resetScheduleEditor}
                        className="flex-1 rounded bg-slate-300 px-3 py-2 text-sm"
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
                        setEditingEntryId(null)
                        setEditingGroupId(null)
                        setScheduleChildId('')
                        setSelectedMinute('00')
                        setSelectedVoucher('')
                        setScheduleMemo('')
                        setIsGroupLesson(false)
                        setGroupName('')
                        setSelectedGroupChildIds([])
                        setGroupSearch('')
                      }}
                      className="mb-2 w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-left text-sm text-slate-500"
                    >
                      + 추가
                    </button>

                    {items.length === 0 ? (
                      <div className="text-xs text-slate-400">등록 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item) => renderScheduleCard(item, dateStr))}
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

  function renderTodayCard(row: ScheduleEntryRow) {
    const child = children.find((c) => c.id === row.child_id)
    const status = attendanceMap.get(getAttendanceKey(row))?.status ?? null
    const timeText = `${row.time_slot.slice(0, 2)}:${String(row.minute_slot ?? 0).padStart(2, '0')}`
    const ageText = child ? getAgeText(child.birth_date) : ''
    const groupChildren = row.is_group
      ? scheduleRows
          .filter(
            (item) =>
              item.date === row.date &&
              item.time_slot === row.time_slot &&
              Number(item.minute_slot ?? 0) === Number(row.minute_slot ?? 0) &&
              Number(item.teacher_id) === Number(row.teacher_id) &&
              Boolean(item.is_group) &&
              (item.group_id ?? '') === (row.group_id ?? '') &&
              item.is_active
          )
          .map((item) => children.find((c) => c.id === item.child_id)?.child_name)
          .filter((name): name is string => Boolean(name))
      : []

    return (
      <div key={row.id} className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{timeText}</div>
            <div className="text-sm text-slate-700">
              {row.is_group ? row.group_name || '그룹수업' : child?.child_name ?? '이름없음'}
            </div>
            {row.is_group ? (
              <div className="mt-1 text-xs text-slate-500">
                학생: {groupChildren.length > 0 ? groupChildren.join(', ') : '이름없음'}
              </div>
            ) : child ? (
              <div className="mt-1 text-xs text-slate-500">
                나이: {ageText || '-'}
              </div>
            ) : null}
          </div>
          {status ? (
            <span className={`rounded-full px-2 py-1 text-xs ${getStatusClass(status)}`}>
              {getStatusLabel(status)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
              미입력
            </span>
          )}
        </div>

        {row.note ? <div className="mt-2 text-xs text-slate-500">{row.note}</div> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openRecordModal(row)}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs"
          >
            상태입력
          </button>
          {!row.is_group && child ? (
            <button
              type="button"
              onClick={() => setChildInfoModal({ open: true, child })}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700"
            >
              아이정보
            </button>
          ) : null}
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
            <h1 className="text-xl font-bold">직원 화면</h1>
            <p className="mt-1 text-sm text-slate-500">
              {user ? `${user.name} (${user.loginId || 'employee'})` : '사용자 없음'}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
          >
            로그아웃
          </button>
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
          <button
            onClick={() => setTab('week_overview')}
            className={`rounded-xl px-4 py-2 ${tab === 'week_overview' ? 'bg-black text-white' : 'bg-slate-200'}`}
          >
            추가 시간표
          </button>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'today' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-bold">오늘보기 / 날짜선택</h2>
              <input
                type="date"
                value={selectedTodayDate}
                onChange={(e) => setSelectedTodayDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                조회 중...
              </div>
            ) : todayItems.length === 0 ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
                오늘 데이터 없음
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {todayItems.map(({ row }) => renderTodayCard(row))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'schedule' ? (
          <div className="mt-0 border-t-0 pt-0">
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

            <div className="hidden md:block">
              <table className="w-full table-fixed border text-xs">
                <thead>
                  <tr>
                    <th className="w-[64px] border bg-slate-100 px-1 py-2">시간</th>
                    {weekDates.map((date, idx) => (
                      <th key={idx} className="w-[15.6%] border bg-slate-100 px-1 py-2">
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
                        const items = buildDisplayItems(dateStr, hourSlot)
                        const isEditing =
                          editingCell?.date === dateStr && editingCell?.hour === hourSlot

                        return (
                          <td
                            key={`${dateStr}-${hourSlot}`}
                            className="border px-1 py-2 align-top"
                          >
                            {isEditing ? (
                              <div className="min-h-[88px] space-y-2">
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={isGroupLesson}
                                    onChange={(e) => {
                                      setIsGroupLesson(e.target.checked)
                                      setSelectedVoucher('')
                                      setScheduleChildId('')
                                      setSelectedGroupChildIds([])
                                    }}
                                  />
                                  그룹수업
                                </label>

                                {isGroupLesson ? (
                                  <>
                                    <input
                                      value={groupName}
                                      onChange={(e) => setGroupName(e.target.value)}
                                      placeholder="그룹명"
                                      className="w-full rounded border bg-white px-2 py-2 text-sm"
                                    />
                                    <input
                                      value={groupSearch}
                                      onChange={(e) => setGroupSearch(e.target.value)}
                                      placeholder="학생 이름 검색"
                                      className="w-full rounded border bg-white px-2 py-2 text-sm"
                                    />
                                    <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded border p-2">
                                      {filteredGroupChildren.map((c) => {
                                        const active = selectedGroupChildIds.includes(c.id)
                                        return (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleGroupChild(c.id)}
                                            className={`rounded px-2 py-2 text-left text-sm ${
                                              active ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
                                            }`}
                                          >
                                            {getDisplayName(c)}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={scheduleChildId}
                                      onChange={(e) => setScheduleChildId(e.target.value ? Number(e.target.value) : '')}
                                      className="w-full rounded border bg-white px-2 py-2 text-sm"
                                    >
                                      <option value="">학생 선택</option>
                                      {children
                                        .filter((c) => c.is_active)
                                        .map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {getDisplayName(c)}
                                          </option>
                                        ))}
                                    </select>

                                    <select
                                      value={selectedVoucher}
                                      onChange={(e) => setSelectedVoucher(e.target.value)}
                                      className="w-full rounded border bg-white px-2 py-2 text-sm"
                                    >
                                      <option value="">바우처 선택</option>
                                      {getVoucherOptionsForChild(scheduleChildId).map((voucher) => (
                                        <option key={voucher} value={voucher}>
                                          {voucher}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                )}

                                <select
                                  value={selectedMinute}
                                  onChange={(e) => setSelectedMinute(e.target.value)}
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
                                  onChange={(e) => setScheduleMemo(e.target.value)}
                                  placeholder="메모 입력"
                                  className="w-full rounded border bg-white px-2 py-2 text-sm"
                                />

                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSaveSchedule(dateStr, hourSlot)}
                                    className="flex-1 rounded bg-indigo-600 px-2 py-2 text-white"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={resetScheduleEditor}
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
                                    setEditingEntryId(null)
                                    setEditingGroupId(null)
                                    setScheduleChildId('')
                                    setSelectedMinute('00')
                                    setSelectedVoucher('')
                                    setScheduleMemo('')
                                    setIsGroupLesson(false)
                                    setGroupName('')
                                    setSelectedGroupChildIds([])
                                    setGroupSearch('')
                                  }}
                                  className="min-h-[32px] w-full rounded border border-dashed border-slate-300 p-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-100"
                                >
                                  + 추가
                                </button>

                                {items.length === 0 ? null : items.map((item) => renderScheduleCard(item, dateStr))}
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
              파랑=출석/보강, 연빨강=결석/당일결석
            </div>
          </div>
        ) : null}

        {tab === 'week_overview' ? (
          <div className="mt-0 border-t-0 pt-0">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              

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

            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="min-w-[720px] table-fixed border-collapse text-[10px] md:min-w-full md:text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-[52px] border-b border-r bg-slate-100 px-1 py-2 text-center font-semibold">
                      시간
                    </th>
                    {weekDates.map((date, idx) => (
                      <th
                        key={idx}
                        className="w-[90px] border-b border-r bg-slate-100 px-0.5 py-2 text-center font-semibold"
                      >
                        <div>{['월', '화', '수', '목', '금', '토'][idx]}</div>
                        <div className="text-[10px] text-slate-500 md:text-xs">{toShortMonthDay(date)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hourSlot) => (
                    <tr key={`overview-${hourSlot}`}>
                      <td className="sticky left-0 z-10 border-b border-r bg-slate-50 px-1 py-2 text-center font-medium">
                        {getHourLabel(hourSlot)}
                      </td>

                      {weekDates.map((date) => {
                        const dateStr = toDateString(date)
                        const compactItems = buildCompactWeekItems(dateStr, hourSlot)

                        return (
                          <td
                            key={`overview-${dateStr}-${hourSlot}`}
                            className="align-top border-b border-r px-0.5 py-1"
                          >
                            {compactItems.length === 0 ? (
                              <div className="min-h-[42px] text-[10px] text-slate-300">-</div>
                            ) : (
                              <div className="space-y-1">
                                {compactItems.map((item) => (
                                  <div
                                    key={item.key}
                                    className={`rounded-md bg-slate-50 px-0.5 py-1 leading-tight ${item.colorClass}`}
                                  >
                                    {item.label}
                                  </div>
                                ))}
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

            <div className="mt-3 text-xs text-slate-500 md:text-sm">
              파랑=출석/보강, 빨강=결석/당일결석
            </div>
          </div>
        ) : null}

        {recordModal.open && recordModal.entry ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-bold">수업 상태 선택</h3>

              <div className="mb-3 text-sm text-slate-600">
                {recordModal.entry.date} / {recordModal.entry.time_slot.slice(0, 2)}:
                {String(recordModal.entry.minute_slot ?? 0).padStart(2, '0')}
              </div>

              <select
                value={recordModal.status}
                onChange={(e) =>
                  setRecordModal((prev) => ({
                    ...prev,
                    status: e.target.value as AttendanceStatus,
                  }))
                }
                className="mb-4 w-full rounded-xl border px-3 py-3 md:py-2"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
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
                      entry: null,
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-bold">아이 정보</h3>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">이름:</span> {childInfoModal.child.child_name}
                </div>
                <div>
                  <span className="font-semibold">나이:</span> {getAgeText(childInfoModal.child.birth_date) || '-'}
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
                  <span className="font-semibold">바우처:</span> {getVoucherLabel(childInfoModal.child.vouchers)}
                </div>
                <div>
                  <span className="font-semibold">메모:</span> {childInfoModal.child.notes || '-'}
                </div>

                <div className="border-t pt-3">
                  <div className="mb-2 font-semibold">이번 달 출결</div>
                  <div><span className="font-medium">출석:</span> {childInfoDates.attended || '-'}</div>
                  <div><span className="font-medium">보강:</span> {childInfoDates.makeup || '-'}</div>
                  <div><span className="font-medium">결석:</span> {childInfoDates.absent || '-'}</div>
                  <div><span className="font-medium">당일결석:</span> {childInfoDates.sameDayAbsent || '-'}</div>
                  <div><span className="font-medium">그룹출석/보강:</span> {childInfoDates.groupAttended || '-'}</div>
                  <div><span className="font-medium">그룹결석/당일결석:</span> {childInfoDates.groupAbsent || '-'}</div>
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
