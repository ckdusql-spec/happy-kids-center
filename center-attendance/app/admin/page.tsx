'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminDailySchedule from '@/components/AdminDailySchedule'

type MainTab = 'schedule' | 'children' | 'staff' | 'summary'
type ViewMode = 'all' | 'staff' | 'daily'
type SummarySubTab = 'attendance' | 'teacher' | 'settlement'
type StaffRole = 'admin' | 'employee'
type AttendanceStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'

type StaffRow = {
  id: number
  login_id: string
  password?: string | null
  name: string
  role: StaffRole
  is_active: boolean
}

type ChildRow = {
  id: number
  chart_no?: string | null
  child_name: string
  birth_date?: string | null
  phone?: string | null
  voucher_yn?: boolean | null
  monthly_limit?: number | null
  vouchers?: string[] | null
  base_price?: number | null
  voucher_prices?: Record<string, number> | null
  notes?: string | null
  is_active: boolean
}

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  room_number?: number | null
  teacher_id: number
  teacher_name?: string | null
  class_type?: string | null
  child_id: number | null
  child_ids?: number[] | null
  voucher_type?: string | null
  status?: string | null
  created_at?: string | null
  minute_slot?: number | null
  is_active?: boolean | null
  updated_at?: string | null
  note?: string | null
  is_group?: boolean | null
  group_id?: string | null
  group_name?: string | null
}

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: AttendanceStatus
  note?: string | null
  created_at?: string | null
  updated_at?: string | null
  voucher_type?: string | null
  is_group?: boolean | null
  group_id?: string | null
  group_name?: string | null
}

type MonthlyGroupPriceRow = {
  id: string
  child_id: number
  month_key: string
  unit_price: number
}

type SummaryAttendanceRow = {
  key: string
  child_id: number
  child_name: string
  age_text: string
  teacher_name: string
  attended_count: number
  makeup_count: number
  absent_count: number
  same_day_absent_count: number
  attended_dates: string
  makeup_dates: string
  absent_dates: string
  same_day_absent_dates: string
  group_attended_dates: string
  group_absent_dates: string
}

type SummaryTeacherRow = {
  key: string
  teacher_name: string
  child_name: string
  attended_dates: string
  makeup_dates: string
  absent_dates: string
  same_day_absent_dates: string
  group_attended_dates: string
  group_absent_dates: string
}

type SummarySettlementRow = {
  child_id: number
  child_name: string
  age_text: string
  voucher_label: string
  lesson_count: number
  group_count: number
  absent_count: number
  same_day_absent_count: number
  group_unit_price: number
  total_amount: number
}

type ChildForm = {
  id: number | null
  chartNo: string
  childName: string
  birthDate: string
  phone: string
  voucherTypes: string[]
  basePrice: string
  didimPrice: string
  achungsimPrice: string
  dreamStartPrice: string
  baeumPrice: string
  notes: string
  isActive: boolean
}

type StaffForm = {
  id: number | null
  loginId: string
  password: string
  name: string
  role: StaffRole
  isActive: boolean
}

type EditingCell = {
  date: string
  hour: string
  staffId: number
} | null

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

type RecordModalState = {
  open: boolean
  entry: ScheduleEntryRow | null
  status: AttendanceStatus
  teacherName: string
}

type ChildInfoModalState = {
  open: boolean
  child: ChildRow | null
}

const VOUCHER_OPTIONS = ['일반', '디딤', '아청심', '드림스타트', '배움'] as const

function toDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toShortMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getStartOfWeek(baseDate: Date) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function buildWeekDates(baseDate: Date) {
  const start = getStartOfWeek(baseDate)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function getHourSlots() {
  return Array.from({ length: 12 }, (_, i) => String(i + 9).padStart(2, '0') + ':00')
}

function getMinutesOptions() {
  return ['00', '10', '20', '30', '40', '50']
}

function getAgeText(birthDate?: string | null) {
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

function getVoucherLabel(vouchers?: string[] | null) {
  if (!vouchers || vouchers.length === 0) return '일반'
  return vouchers.join(', ')
}

function getVoucherClass(voucher?: string | null) {
  if (voucher === '디딤') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (voucher === '아청심') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (voucher === '드림스타트') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (voucher === '배움') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (voucher === '그룹수업') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function getStatusLabel(status: AttendanceStatus) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'makeup') return '보강'
  return '당일결석'
}

function csvEscape(value: string | number | null | undefined) {
  const str = value == null ? '' : String(value)
  return `"${str.replace(/"/g, '""')}"`
}

function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildClassTimestamp(
  date: string,
  hourSlot: string,
  minute: string | number | null | undefined
) {
  const hh = hourSlot.slice(0, 2)
  const mm = String(Number(minute ?? 0)).padStart(2, '0')
  return `${date}T${hh}:${mm}:00+09:00`
}

function uniqueDateList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort().join(', ')
}

function getVoucherPrices(child: ChildRow) {
  const value = child.voucher_prices
  if (!value || typeof value !== 'object') return {}
  return value
}

function toMinuteNumberFromTimestamp(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

function getEntryMinuteTotal(entry: ScheduleEntryRow) {
  return Number(entry.time_slot.slice(0, 2)) * 60 + Number(entry.minute_slot ?? 0)
}

function getLogMinuteTotal(log: ClassLogRow) {
  return toMinuteNumberFromTimestamp(log.class_time)
}

function buildLogicalAttendanceKey(params: {
  classDate: string
  minuteTotal: number
  staffId: number
  childId: number
  isGroup?: boolean | null
  groupId?: string | null
}) {
  return [
    params.classDate,
    params.minuteTotal,
    Number(params.staffId),
    Number(params.childId),
    params.isGroup ? 'group' : 'single',
    params.groupId ?? '',
  ].join('|')
}

function isSameAttendanceLog(entry: ScheduleEntryRow, log: ClassLogRow) {
  const logMinute = getLogMinuteTotal(log)
  const entryMinute = getEntryMinuteTotal(entry)
  if (logMinute == null) return false

  const sameBase =
    entry.date === log.class_date &&
    Number(entry.teacher_id) === Number(log.staff_id) &&
    Number(entry.child_id) === Number(log.child_id) &&
    entryMinute === logMinute

  if (!sameBase) return false

  if (entry.is_group) {
    return Boolean(log.is_group) && (entry.group_id ?? '') === (log.group_id ?? '')
  }

  return !log.is_group
}

function getScheduleCardBgClass(item: DisplayScheduleItem, classLogs: ClassLogRow[]) {
  const relatedLogs = classLogs
    .filter((log) => {
      const sameDate = log.class_date === item.date
      const sameStaff = Number(log.staff_id) === Number(item.staffId)
      const logMinute = getLogMinuteTotal(log)
      const itemMinute =
        Number(item.hourSlot.slice(0, 2)) * 60 + Number(item.minuteSlot)

      if (logMinute == null) return false
      if (!sameDate || !sameStaff || logMinute !== itemMinute) return false

      if (item.isGroup) {
        return Boolean(log.is_group) && (log.group_id ?? '') === (item.groupId ?? '')
      }

      const firstRow = item.rows[0]
      return Number(log.child_id) === Number(firstRow?.child_id) && !log.is_group
    })
    .sort((a, b) => {
      const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
      return bTime - aTime
    })

  if (relatedLogs.length === 0) return 'bg-white'

  if (item.isGroup) {
    const hasBlue = relatedLogs.some(
      (log) => log.status === 'attended' || log.status === 'makeup'
    )
    const hasOnlyRed =
      relatedLogs.length > 0 &&
      relatedLogs.every(
        (log) => log.status === 'absent' || log.status === 'same_day_absent'
      )

    if (hasBlue) return 'bg-sky-50'
    if (hasOnlyRed) return 'bg-rose-50'
    return 'bg-white'
  }

  const latest = relatedLogs[0]
  if (!latest?.status) return 'bg-white'
  if (latest.status === 'attended' || latest.status === 'makeup') return 'bg-sky-50'
  if (latest.status === 'absent' || latest.status === 'same_day_absent') return 'bg-rose-50'
  return 'bg-white'
}

function formatKoreanStatus(status?: string | null) {
  if (status === 'attended') return '출석'
  if (status === 'makeup') return '보강'
  if (status === 'absent') return '결석'
  if (status === 'same_day_absent') return '당일결석'
  return ''
}

function formatClassTimeText(timeSlot?: string | null, minuteSlot?: number | null) {
  if (!timeSlot) return ''
  return `${timeSlot.slice(0, 2)}:${String(minuteSlot ?? 0).padStart(2, '0')}`
}

function formatTimestampToText(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

export default function AdminPage() {
  const [tab, setTab] = useState<MainTab>('schedule')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [summarySubTab, setSummarySubTab] = useState<SummarySubTab>('attendance')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [csvMonth, setCsvMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [dailyDate, setDailyDate] = useState(() => toDateString(new Date()))
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [children, setChildren] = useState<ChildRow[]>([])
  const [allScheduleEntries, setAllScheduleEntries] = useState<ScheduleEntryRow[]>([])
  const [classLogs, setClassLogs] = useState<ClassLogRow[]>([])
  const [monthlyGroupPrices, setMonthlyGroupPrices] = useState<Record<number, string>>({})

  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [selectedVoucher, setSelectedVoucher] = useState('')
  const [isGroupLesson, setIsGroupLesson] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedGroupChildIds, setSelectedGroupChildIds] = useState<number[]>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [childSearch, setChildSearch] = useState('')

  const [recordModal, setRecordModal] = useState<RecordModalState>({
    open: false,
    entry: null,
    status: 'attended',
    teacherName: '',
  })

  const [childInfoModal, setChildInfoModal] = useState<ChildInfoModalState>({
    open: false,
    child: null,
  })

  const [childForm, setChildForm] = useState<ChildForm>({
    id: null,
    chartNo: '',
    childName: '',
    birthDate: '',
    phone: '',
    voucherTypes: [],
    basePrice: '60000',
    didimPrice: '10000',
    achungsimPrice: '54000',
    dreamStartPrice: '40000',
    baeumPrice: '10000',
    notes: '',
    isActive: true,
  })

  const [staffForm, setStaffForm] = useState<StaffForm>({
    id: null,
    loginId: '',
    password: '',
    name: '',
    role: 'employee',
    isActive: true,
  })

  const weekDates = useMemo(() => buildWeekDates(weekBaseDate), [weekBaseDate])
  const hourSlots = useMemo(() => getHourSlots(), [])
  const employeeStaffs = useMemo(
    () => staffs.filter((s) => s.role === 'employee' && s.is_active),
    [staffs]
  )

  const selectedStaff = useMemo(
    () => employeeStaffs.find((s) => Number(s.id) === Number(selectedStaffId)),
    [employeeStaffs, selectedStaffId]
  )

  const filteredChildren = useMemo(() => {
    const q = childSearch.trim()
    if (!q) return children
    return children.filter((c) => c.child_name.includes(q))
  }, [children, childSearch])

  const filteredGroupChildren = useMemo(() => {
    const q = groupSearch.trim()
    const base = children.filter((c) => c.is_active)
    if (!q) return base
    return base.filter((c) => c.child_name.includes(q))
  }, [children, groupSearch])

  async function loadStaffs() {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    setStaffs((data ?? []) as StaffRow[])
  }

  async function loadChildren() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .order('child_name', { ascending: true })

    if (error) throw error
    setChildren((data ?? []) as ChildRow[])
  }

  async function loadSchedules() {
    const weekStart = toDateString(weekDates[0])
    const weekEnd = toDateString(weekDates[weekDates.length - 1])
    const start = weekStart < dailyDate ? weekStart : dailyDate
    const end = weekEnd > dailyDate ? weekEnd : dailyDate

    const { data, error } = await supabase
      .from('schedule_entries')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .eq('is_active', true)
      .order('date', { ascending: true })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })

    if (error) throw error
    setAllScheduleEntries((data ?? []) as ScheduleEntryRow[])
  }

  async function loadClassLogsForMonth() {
    const start = `${csvMonth}-01`
    const endDate = new Date(start)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)
    const end = toDateString(endDate)

    const { data, error } = await supabase
      .from('class_logs')
      .select('*')
      .gte('class_date', start)
      .lte('class_date', end)
      .order('class_date', { ascending: true })

    if (error) throw error
    setClassLogs((data ?? []) as ClassLogRow[])
  }

  async function loadMonthlyGroupPrices() {
    const { data, error } = await supabase
      .from('monthly_group_prices')
      .select('id, child_id, month_key, unit_price')
      .eq('month_key', csvMonth)

    if (error) {
      setMonthlyGroupPrices({})
      return
    }

    const next: Record<number, string> = {}
    ;((data ?? []) as MonthlyGroupPriceRow[]).forEach((row) => {
      next[Number(row.child_id)] = String(row.unit_price ?? 0)
    })
    setMonthlyGroupPrices(next)
  }

  async function loadAll() {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([
        loadStaffs(),
        loadChildren(),
        loadSchedules(),
        loadClassLogsForMonth(),
        loadMonthlyGroupPrices(),
      ])
    } catch (err: any) {
      setMessage(err?.message ?? '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    loadSchedules().catch((err: any) => setMessage(err?.message ?? '시간표 불러오기 실패'))
  }, [weekBaseDate, dailyDate])

  useEffect(() => {
    Promise.all([loadClassLogsForMonth(), loadMonthlyGroupPrices()]).catch((err: any) =>
      setMessage(err?.message ?? '월정산 불러오기 실패')
    )
  }, [csvMonth])

  function resetScheduleEditor() {
    setEditingCell(null)
    setEditingEntryId(null)
    setEditingGroupId(null)
    setScheduleChildId('')
    setSelectedMinute('00')
    setSelectedVoucher('')
    setIsGroupLesson(false)
    setGroupName('')
    setSelectedGroupChildIds([])
    setGroupSearch('')
  }

  function getScheduleEntries(dateStr: string, hourSlot: string, staffId: number) {
    return allScheduleEntries.filter(
      (entry) =>
        entry.date === dateStr &&
        entry.time_slot === hourSlot &&
        Number(entry.teacher_id) === Number(staffId) &&
        entry.is_active
    )
  }

  function buildDisplayItems(dateStr: string, hourSlot: string, staffId: number) {
    const rows = getScheduleEntries(dateStr, hourSlot, staffId)
    const groupMap = new Map<string, DisplayScheduleItem>()

    rows.forEach((row) => {
      const itemKey =
        row.is_group && row.group_id ? `group-${row.group_id}` : `single-${row.id}`

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
function startAddSchedule(dateStr: string, hourSlot: string, staffId: number) {
    resetScheduleEditor()
    setEditingCell({ date: dateStr, hour: hourSlot, staffId })
  }

  function startEditSchedule(item: DisplayScheduleItem) {
    const first = item.rows[0]
    if (!first) return

    setEditingCell({
      date: item.date,
      hour: item.hourSlot,
      staffId: Number(item.staffId),
    })

    if (item.isGroup) {
      setIsGroupLesson(true)
      setEditingGroupId(item.groupId)
      setGroupName(item.groupName ?? '')
      setSelectedMinute(String(item.minuteSlot).padStart(2, '0'))
      setSelectedVoucher(first.voucher_type ?? '')
      setSelectedGroupChildIds(item.rows.map((r) => Number(r.child_id)))
    } else {
      setIsGroupLesson(false)
      setEditingEntryId(first.id)
      setScheduleChildId(Number(first.child_id))
      setSelectedMinute(String(item.minuteSlot).padStart(2, '0'))
      setSelectedVoucher(first.voucher_type ?? '')
    }
  }

  async function saveSchedule() {
    try {
      if (!editingCell) return

      if (isGroupLesson) {
        if (!groupName.trim()) {
          setMessage('그룹 이름을 입력하세요.')
          return
        }
        if (selectedGroupChildIds.length === 0) {
          setMessage('그룹 학생을 선택하세요.')
          return
        }

        let groupId = editingGroupId
        if (!groupId) {
          groupId = `group-${Date.now()}`
        }

        if (editingGroupId) {
          await supabase
            .from('schedule_entries')
            .update({ is_active: false })
            .eq('group_id', editingGroupId)
        }

        const rows = selectedGroupChildIds.map((childId) => ({
          date: editingCell.date,
          time_slot: editingCell.hour,
          minute_slot: Number(selectedMinute),
          teacher_id: editingCell.staffId,
          teacher_name: selectedStaff?.name ?? '',
          child_id: childId,
          voucher_type: selectedVoucher || null,
          is_group: true,
          group_id: groupId,
          group_name: groupName,
          is_active: true,
        }))

        const { error } = await supabase.from('schedule_entries').insert(rows)
        if (error) throw error
      } else {
        if (!scheduleChildId) {
          setMessage('학생을 선택하세요.')
          return
        }

        if (editingEntryId) {
          const { error } = await supabase
            .from('schedule_entries')
            .update({
              child_id: Number(scheduleChildId),
              voucher_type: selectedVoucher || null,
              minute_slot: Number(selectedMinute),
            })
            .eq('id', editingEntryId)

          if (error) throw error
        } else {
          const { error } = await supabase.from('schedule_entries').insert({
            date: editingCell.date,
            time_slot: editingCell.hour,
            minute_slot: Number(selectedMinute),
            teacher_id: editingCell.staffId,
            teacher_name: selectedStaff?.name ?? '',
            child_id: Number(scheduleChildId),
            voucher_type: selectedVoucher || null,
            is_group: false,
            is_active: true,
          })

          if (error) throw error
        }
      }

      resetScheduleEditor()
      await loadSchedules()
      setMessage('저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '저장 실패')
    }
  }

  async function deleteSchedule(item: DisplayScheduleItem) {
    try {
      if (item.isGroup && item.groupId) {
        await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('group_id', item.groupId)
      } else {
        await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('id', item.rows[0].id)
      }

      await loadSchedules()
      setMessage('삭제되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  const attendanceMap = useMemo(() => {
    const map = new Map<string, ClassLogRow>()

    classLogs.forEach((log) => {
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
  }, [classLogs])

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

  function findExistingClassLog(entry: ScheduleEntryRow) {
    return classLogs.find((log) => isSameAttendanceLog(entry, log)) ?? null
  }

  function openRecordModal(entry: ScheduleEntryRow) {
    const existing = findExistingClassLog(entry)
    const teacher = staffs.find((s) => Number(s.id) === Number(entry.teacher_id))

    setRecordModal({
      open: true,
      entry,
      status: existing?.status ?? 'attended',
      teacherName: teacher?.name ?? entry.teacher_name ?? '',
    })
  }

  async function handleSaveAttendanceFromModal() {
    try {
      if (!recordModal.entry) return

      const entry = recordModal.entry
      const classTime = buildClassTimestamp(entry.date, entry.time_slot, entry.minute_slot)
      const existing = findExistingClassLog(entry)

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

      await loadClassLogsForMonth()

      setRecordModal({
        open: false,
        entry: null,
        status: 'attended',
        teacherName: '',
      })

      setMessage('출결 저장 완료')
    } catch (err: any) {
      setMessage(err?.message ?? '출결 저장 실패')
    }
  }
function getRunningAbsentCount(childId: number) {
    const rows = classLogs.filter((log) => Number(log.child_id) === Number(childId))

    let count = 0

    rows
      .sort((a, b) => {
        const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
        const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
        return aTime - bTime
      })
      .forEach((log) => {
        if (log.status === 'absent' || log.status === 'same_day_absent') count++
        else if (log.status === 'makeup') count = Math.max(0, count - 1)
      })

    return count
  }

  const validClassLogs = useMemo(() => {
    const start = `${csvMonth}-01`
    const endDate = new Date(start)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)
    const end = toDateString(endDate)

    const monthlySchedules = allScheduleEntries.filter(
      (row) => row.date >= start && row.date <= end && row.is_active
    )

    return classLogs.filter((log) => {
      const logMinute = getLogMinuteTotal(log)
      if (logMinute == null) return false

      return monthlySchedules.some((row) => {
        const rowMinute =
          Number(row.time_slot.slice(0, 2)) * 60 + Number(row.minute_slot ?? 0)

        if (row.is_group) {
          return (
            row.date === log.class_date &&
            Number(row.teacher_id) === Number(log.staff_id) &&
            Number(row.child_id) === Number(log.child_id) &&
            rowMinute === logMinute &&
            Boolean(log.is_group) &&
            (row.group_id ?? '') === (log.group_id ?? '')
          )
        }

        return (
          row.date === log.class_date &&
          Number(row.teacher_id) === Number(log.staff_id) &&
          Number(row.child_id) === Number(log.child_id) &&
          rowMinute === logMinute &&
          !log.is_group
        )
      })
    })
  }, [allScheduleEntries, classLogs, csvMonth])

  function downloadStudentCsv() {
    const rows = children.map((c) => [
      csvMonth,
      c.child_name,
      getAgeText(c.birth_date),
    ])

    downloadCsvFile(
      `학생_${csvMonth}.csv`,
      ['월', '이름', '나이'],
      rows
    )
  }

  function downloadStaffCsv() {
    const rows = staffs.map((s) => [
      csvMonth,
      s.name,
    ])

    downloadCsvFile(
      `선생님_${csvMonth}.csv`,
      ['월', '선생님'],
      rows
    )
  }

  function handleLogout() {
    localStorage.removeItem('staff_id')
    localStorage.removeItem('staff_name')
    localStorage.removeItem('staff_role')
    window.location.href = '/'
  }

  function renderScheduleCard(item: DisplayScheduleItem) {
    const bg = getScheduleCardBgClass(item, classLogs)

    return (
      <div
        key={item.key}
        className={`rounded-lg border p-2 text-sm shadow-sm ${bg}`}
      >
        <div className="font-semibold">
          {item.hourSlot}:{String(item.minuteSlot).padStart(2, '0')}
        </div>

        {item.isGroup ? (
          <>
            <div className="text-rose-500 font-bold">
              {item.groupName || '그룹수업'}
            </div>
            {item.rows.map((r) => {
              const child = children.find((c) => c.id === Number(r.child_id))
              const key = getAttendanceKey(r)
              const log = attendanceMap.get(key)

              return (
                <div key={r.id}>
                  {child?.child_name} ({formatKoreanStatus(log?.status)})
                </div>
              )
            })}
          </>
        ) : (
          <>
            {item.rows.map((r) => {
              const child = children.find((c) => c.id === Number(r.child_id))
              const key = getAttendanceKey(r)
              const log = attendanceMap.get(key)

              return (
                <div key={r.id}>
                  {child?.child_name} ({formatKoreanStatus(log?.status)})
                </div>
              )
            })}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button
            className="text-blue-500"
            onClick={() => openRecordModal(item.rows[0])}
          >
            출결
          </button>
          <button
            className="text-red-500"
            onClick={() => deleteSchedule(item)}
          >
            삭제
          </button>
        </div>
      </div>
    )
  }

  const filteredStaffsForDaily = useMemo(() => {
    return employeeStaffs.filter((staff) =>
      allScheduleEntries.some(
        (e) =>
          e.date === dailyDate &&
          Number(e.teacher_id) === Number(staff.id) &&
          e.is_active
      )
    )
  }, [employeeStaffs, allScheduleEntries, dailyDate])

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab('schedule')}>관리자 시간표</button>
        <button onClick={() => setTab('children')}>아이등록</button>
        <button onClick={() => setTab('staff')}>선생님등록</button>
        <button onClick={() => setTab('summary')}>월정산</button>
      </div>

      {tab === 'schedule' && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('all')}>전체보기</button>
            <button onClick={() => setViewMode('staff')}>선생님별 보기</button>
            <button onClick={() => setViewMode('daily')}>일별 보기</button>
          </div>

          {viewMode === 'daily' && (
            <div className="space-y-4">
              {filteredStaffsForDaily.map((staff) => (
                <div key={staff.id}>
                  <h3 className="font-bold">{staff.name}</h3>
                  {hourSlots.map((hour) => {
                    const items = buildDisplayItems(dailyDate, hour, staff.id)
                    return (
                      <div key={hour} className="border p-2">
                        <div>{hour}</div>
                        <div className="grid gap-2">
                          {items.map(renderScheduleCard)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {recordModal.open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-xl w-[300px] space-y-4">
            <div className="font-bold text-lg">수업 상태 선택</div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['attended', '출석'],
                ['makeup', '보강'],
                ['absent', '결석'],
                ['same_day_absent', '당일결석'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`p-2 rounded ${
                    recordModal.status === value ? 'bg-blue-500 text-white' : 'bg-gray-200'
                  }`}
                  onClick={() =>
                    setRecordModal((prev) => ({
                      ...prev,
                      status: value as AttendanceStatus,
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 bg-blue-500 text-white p-2 rounded"
                onClick={handleSaveAttendanceFromModal}
              >
                저장
              </button>
              <button
                className="flex-1 bg-gray-300 p-2 rounded"
                onClick={() =>
                  setRecordModal({
                    open: false,
                    entry: null,
                    status: 'attended',
                    teacherName: '',
                  })
                }
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}