'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MainTab = 'schedule' | 'children' | 'staff' | 'summary'
type ViewMode = 'all' | 'staff' | 'daily'
type SummarySubTab = 'attendance' | 'teacher' | 'settlement'
type StaffRole = 'admin' | 'employee'
type AttendanceStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'

type StaffRow = {
  id: number
  login_id: string
  name: string
  role: StaffRole
  is_active: boolean
  password?: string | null
}

type ChildRow = {
  id: number
  child_name: string
  voucher_yn?: boolean | null
  monthly_limit?: number | null
  is_active: boolean
  notes?: string | null
  chart_no?: string | null
  birth_date?: string | null
  phone?: string | null
  vouchers?: string[] | null
  base_price?: number | null
  voucher_prices?: Record<string, number> | null
}

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  room_number: number | null
  teacher_id: number
  teacher_name: string | null
  class_type: string | null
  child_id: number | null
  child_ids?: number[] | null
  voucher_type: string | null
  status: string | null
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

type ChildForm = {
  id: number | null
  childName: string
  birthDate: string
  phone: string
  chartNo: string
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

type AttendanceSummaryRow = {
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

type TeacherLessonRow = {
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

type SettlementRow = {
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
  return Array.from({ length: 12 }, (_, i) => `${String(i + 9).padStart(2, '0')}:00`)
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.getHours() * 60 + date.getMinutes()
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

function getScheduleCardBgClass(
  item: DisplayScheduleItem,
  classLogs: ClassLogRow[]
) {
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
function DailyScheduleView({
  selectedDate,
  staffs,
  children,
  entries,
  classLogs,
  attendanceMap,
  onOpenRecord,
}: {
  selectedDate: string
  staffs: StaffRow[]
  children: ChildRow[]
  entries: ScheduleEntryRow[]
  classLogs: ClassLogRow[]
  attendanceMap: Map<string, ClassLogRow>
  onOpenRecord: (entry: ScheduleEntryRow) => void
}) {
  const dayEntries = entries.filter((e) => e.date === selectedDate && e.is_active)
  const activeTeacherIds = new Set(dayEntries.map((e) => Number(e.teacher_id)))
  const teacherList = staffs.filter(
    (s) => s.role === 'employee' && s.is_active && activeTeacherIds.has(Number(s.id))
  )
  const slots = getHourSlots()

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

  function buildItems(hourSlot: string, staffId: number) {
    const rows = dayEntries.filter(
      (row) =>
        row.time_slot === hourSlot &&
        Number(row.teacher_id) === Number(staffId) &&
        row.is_active
    )

    const groupMap = new Map<string, DisplayScheduleItem>()

    rows.forEach((row) => {
      const key = row.is_group && row.group_id ? `group-${row.group_id}` : `single-${row.id}`
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
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
      groupMap.get(key)!.rows.push(row)
    })

    return Array.from(groupMap.values()).sort((a, b) => a.minuteSlot - b.minuteSlot)
  }

  if (teacherList.length === 0) {
    return (
      <div className="rounded-3xl border bg-white p-5 text-center text-slate-500 shadow-sm">
        선택한 날짜에 수업이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-900">일별 보기</div>
            <div className="mt-1 text-sm text-slate-500">
              해당 날짜에 수업이 있는 선생님만 표시됩니다.
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            선생님 {teacherList.length}명
          </div>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {teacherList.map((teacher) => (
          <div key={teacher.id} className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-base font-bold text-slate-900">{teacher.name}</div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {selectedDate}
              </div>
            </div>

            <div className="space-y-3">
              {slots.map((slot) => {
                const items = buildItems(slot, teacher.id)
                if (items.length === 0) return null

                return (
                  <div key={`${teacher.id}-${slot}`} className="rounded-2xl border bg-slate-50/80 p-3">
                    <div className="mb-2 text-sm font-bold text-slate-800">{slot}</div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const firstChild = children.find((c) => c.id === Number(item.rows[0]?.child_id))
                        const title = item.isGroup
                          ? `${slot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${item.groupName || '그룹수업'}`
                          : `${slot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${firstChild?.child_name ?? ''} (${getAgeText(firstChild?.birth_date ?? null)})`

                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              const firstEntry = item.rows[0]
                              if (firstEntry) onOpenRecord(firstEntry)
                            }}
                            className={`block w-full rounded-2xl border px-3 py-3 text-left shadow-sm ${getScheduleCardBgClass(
                              item,
                              classLogs
                            )}`}
                          >
                            <div className="font-semibold text-slate-900">{title}</div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getVoucherClass(item.voucherType)}`}>
                                {item.voucherType || '일반'}
                              </span>
                              {item.isGroup ? (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700">
                                  그룹
                                </span>
                              ) : null}
                            </div>

                            {item.isGroup ? (
                              <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                                {item.rows.map((r) => {
                                  const child = children.find((c) => c.id === Number(r.child_id))
                                  const log = attendanceMap.get(getAttendanceKey(r))
                                  return (
                                    <div key={r.id} className="rounded-xl bg-white/80 px-2 py-2">
                                      {child?.child_name ?? `학생(${r.child_id})`}
                                      {log?.status ? ` (${getStatusLabel(log.status)})` : ' (미입력)'}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-3xl border bg-white shadow-sm md:block">
        <table className="min-w-[900px] border text-sm">
          <thead>
            <tr>
              <th className="border bg-slate-100 px-2 py-2">시간</th>
              {teacherList.map((teacher) => (
                <th key={teacher.id} className="min-w-[220px] border bg-slate-100 px-2 py-2">
                  {teacher.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot}>
                <td className="border bg-slate-50 px-2 py-2 font-medium">{slot}</td>
                {teacherList.map((teacher) => {
                  const items = buildItems(slot, teacher.id)
                  return (
                    <td key={`${slot}-${teacher.id}`} className="border px-2 py-2 align-top">
                      <div className="space-y-2">
                        {items.length === 0 ? (
                          <div className="min-h-[36px]" />
                        ) : (
                          items.map((item) => {
                            const firstChild = children.find((c) => c.id === Number(item.rows[0]?.child_id))
                            const title = item.isGroup
                              ? `${slot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${item.groupName || '그룹수업'}`
                              : `${slot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${firstChild?.child_name ?? ''} (${getAgeText(firstChild?.birth_date ?? null)})`

                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  const firstEntry = item.rows[0]
                                  if (firstEntry) onOpenRecord(firstEntry)
                                }}
                                className={`block w-full rounded-2xl border px-3 py-3 text-left shadow-sm ${getScheduleCardBgClass(
                                  item,
                                  classLogs
                                )}`}
                              >
                                <div className="font-semibold text-slate-900">{title}</div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
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

  const [childInfoModal, setChildInfoModal] = useState<{
    open: boolean
    child: ChildRow | null
  }>({
    open: false,
    child: null,
  })

  const [childForm, setChildForm] = useState<ChildForm>({
    id: null,
    childName: '',
    birthDate: '',
    phone: '',
    chartNo: '',
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
      const itemKey = row.is_group && row.group_id ? `group-${row.group_id}` : `single-${row.id}`
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

  function getVoucherOptionsForChild(childId: number | '') {
    if (!childId) return ['일반']
    const child = children.find((c) => c.id === Number(childId))
    if (!child) return ['일반']
    if (Array.isArray(child.vouchers) && child.vouchers.length > 0) return child.vouchers
    return ['일반']
  }

  function toggleChildVoucher(voucher: string) {
    setChildForm((prev) => {
      const exists = prev.voucherTypes.includes(voucher)
      return {
        ...prev,
        voucherTypes: exists
          ? prev.voucherTypes.filter((v) => v !== voucher)
          : [...prev.voucherTypes, voucher],
      }
    })
  }

  function toggleGroupChild(childId: number) {
    setSelectedGroupChildIds((prev) => {
      const exists = prev.includes(childId)
      if (exists) return prev.filter((id) => id !== childId)
      if (prev.length >= 8) return prev
      return [...prev, childId]
    })
  }

  async function handleSaveChild() {
    try {
      if (!childForm.childName.trim()) {
        setMessage('아이 이름을 입력하세요.')
        return
      }
      if (childForm.voucherTypes.length === 0) {
        setMessage('바우처를 1개 이상 선택하세요.')
        return
      }

      const voucherPrices = {
        디딤: Number(childForm.didimPrice || 0),
        아청심: Number(childForm.achungsimPrice || 0),
        드림스타트: Number(childForm.dreamStartPrice || 0),
        배움: Number(childForm.baeumPrice || 0),
      }

      const payload = {
        child_name: childForm.childName,
        birth_date: childForm.birthDate || null,
        phone: childForm.phone || null,
        chart_no: childForm.chartNo || null,
        vouchers: childForm.voucherTypes,
        voucher_yn: childForm.voucherTypes.some((v) => v !== '일반'),
        monthly_limit: Number(childForm.basePrice || 0),
        base_price: Number(childForm.basePrice || 0),
        voucher_prices: voucherPrices,
        notes: childForm.notes || null,
        is_active: childForm.isActive,
      }

      if (childForm.id) {
        const { error } = await supabase.from('children').update(payload).eq('id', childForm.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('children').insert(payload)
        if (error) throw error
      }

      await loadChildren()
      setMessage('아이 정보가 저장되었습니다.')
      setChildForm({
        id: null,
        childName: '',
        birthDate: '',
        phone: '',
        chartNo: '',
        voucherTypes: [],
        basePrice: '60000',
        didimPrice: '10000',
        achungsimPrice: '54000',
        dreamStartPrice: '40000',
        baeumPrice: '10000',
        notes: '',
        isActive: true,
      })
    } catch (err: any) {
      setMessage(err?.message ?? '아이 저장 실패')
    }
  }

  async function handleSaveStaff() {
    try {
      if (!staffForm.loginId.trim()) {
        setMessage('로그인 ID를 입력하세요.')
        return
      }
      if (!staffForm.name.trim()) {
        setMessage('이름을 입력하세요.')
        return
      }
      if (!staffForm.id && !staffForm.password.trim()) {
        setMessage('비밀번호를 입력하세요.')
        return
      }

      const payload: any = {
        login_id: staffForm.loginId,
        name: staffForm.name,
        role: staffForm.role,
        is_active: staffForm.isActive,
      }

      if (staffForm.password.trim()) payload.password = staffForm.password

      if (staffForm.id) {
        const { error } = await supabase.from('staff_accounts').update(payload).eq('id', staffForm.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('staff_accounts').insert(payload)
        if (error) throw error
      }

      await loadStaffs()
      setMessage('선생님 정보가 저장되었습니다.')
      setStaffForm({
        id: null,
        loginId: '',
        password: '',
        name: '',
        role: 'employee',
        isActive: true,
      })
    } catch (err: any) {
      setMessage(err?.message ?? '선생님 저장 실패')
    }
  }

  async function handleSaveSchedule(dateStr: string, hourSlot: string, staffId: number) {
    try {
      const staff = employeeStaffs.find((s) => Number(s.id) === Number(staffId))
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

        const groupId =
          editingGroupId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `group-${Date.now()}`)

        if (editingGroupId) {
          const oldGroupRows = allScheduleEntries.filter((row) => row.group_id === editingGroupId && row.is_active)

          const { error: clearError } = await supabase
            .from('schedule_entries')
            .update({ is_active: false })
            .eq('group_id', editingGroupId)
          if (clearError) throw clearError

          for (const row of oldGroupRows) {
            await supabase
              .from('class_logs')
              .delete()
              .match({
                class_date: row.date,
                staff_id: Number(row.teacher_id),
                child_id: Number(row.child_id),
              })
          }
        }

        const groupRows = selectedGroupChildIds.map((childId) => ({
          date: dateStr,
          time_slot: hourSlot,
          room_number: 1,
          teacher_id: Number(staffId),
          teacher_name: staff?.name ?? '',
          class_type: 'group',
          child_id: Number(childId),
          child_ids: [],
          voucher_type: '그룹수업',
          status: 'scheduled',
          minute_slot: minute,
          is_active: true,
          note: null,
          is_group: true,
          group_id: groupId,
          group_name: groupName || '그룹수업',
        }))

        const { error } = await supabase.from('schedule_entries').insert(groupRows)
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
          const oldEntry = allScheduleEntries.find((row) => row.id === editingEntryId)

          const payload = {
            date: dateStr,
            time_slot: hourSlot,
            room_number: 1,
            teacher_id: Number(staffId),
            teacher_name: staff?.name ?? '',
            class_type: 'individual',
            child_id: Number(scheduleChildId),
            voucher_type: selectedVoucher,
            status: 'scheduled',
            minute_slot: minute,
            is_active: true,
            note: null,
            is_group: false,
            group_id: null,
            group_name: null,
          }

          const { error } = await supabase
            .from('schedule_entries')
            .update(payload)
            .eq('id', editingEntryId)
          if (error) throw error

          if (oldEntry) {
            await supabase
              .from('class_logs')
              .delete()
              .match({
                class_date: oldEntry.date,
                staff_id: Number(oldEntry.teacher_id),
                child_id: Number(oldEntry.child_id),
              })
          }
        } else {
          const payload = {
            date: dateStr,
            time_slot: hourSlot,
            room_number: 1,
            teacher_id: Number(staffId),
            teacher_name: staff?.name ?? '',
            class_type: 'individual',
            child_id: Number(scheduleChildId),
            voucher_type: selectedVoucher,
            status: 'scheduled',
            minute_slot: minute,
            is_active: true,
            note: null,
            is_group: false,
            group_id: null,
            group_name: null,
          }

          const { error } = await supabase.from('schedule_entries').insert(payload)
          if (error) throw error
        }
      }

      resetScheduleEditor()
      await loadSchedules()
      await loadClassLogsForMonth()
      setMessage('시간표가 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '시간표 저장 실패')
    }
  }

  async function handleDeleteSchedule(item: DisplayScheduleItem) {
    try {
      const ok = window.confirm('이 시간표를 삭제할까요?')
      if (!ok) return

      if (item.isGroup && item.groupId) {
        const targetRows = allScheduleEntries.filter(
          (row) => row.group_id === item.groupId && row.is_active
        )

        const { error } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('group_id', item.groupId)
        if (error) throw error

        for (const row of targetRows) {
          await supabase
            .from('class_logs')
            .delete()
            .match({
              class_date: row.date,
              staff_id: Number(row.teacher_id),
              child_id: Number(row.child_id),
            })
        }
      } else {
        const targetId = item.rows[0]?.id
        const targetRow = item.rows[0]
        if (!targetId || !targetRow) return

        const { error } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .eq('id', targetId)
        if (error) throw error

        await supabase
          .from('class_logs')
          .delete()
          .match({
            class_date: targetRow.date,
            staff_id: Number(targetRow.teacher_id),
            child_id: Number(targetRow.child_id),
          })
      }

      await loadSchedules()
      await loadClassLogsForMonth()
      setMessage('시간표가 삭제되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  function handleEditSchedule(item: DisplayScheduleItem) {
    setEditingCell({
      date: item.date,
      hour: item.hourSlot,
      staffId: Number(item.staffId),
    })

    if (item.isGroup) {
      setIsGroupLesson(true)
      setEditingGroupId(item.groupId ?? null)
      setEditingEntryId(null)
      setSelectedGroupChildIds(item.rows.map((row) => Number(row.child_id)))
      setGroupName(item.groupName || '')
      setSelectedMinute(String(item.minuteSlot).padStart(2, '0'))
      setScheduleChildId('')
      setSelectedVoucher('')
    } else {
      const row = item.rows[0]
      setIsGroupLesson(false)
      setEditingGroupId(null)
      setEditingEntryId(row.id)
      setScheduleChildId(row.child_id ? Number(row.child_id) : '')
      setSelectedMinute(String(row.minute_slot ?? 0).padStart(2, '0'))
      setSelectedVoucher(row.voucher_type ?? '')
      setSelectedGroupChildIds([])
      setGroupName('')
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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

  function findExistingClassLog(entry: ScheduleEntryRow) {
    return classLogs.find((log) => isSameAttendanceLog(entry, log)) ?? null
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
        if (log.status === 'absent' || log.status === 'same_day_absent') count += 1
        else if (log.status === 'makeup') count = Math.max(0, count - 1)
      })

    return count
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
      setMessage('출결이 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '출결 저장 실패')
    }
  }

  async function saveGroupUnitPrice(childId: number, value: string) {
    try {
      const unitPrice = Number(value || 0)
      const { error } = await supabase
        .from('monthly_group_prices')
        .upsert(
          {
            child_id: childId,
            month_key: csvMonth,
            unit_price: unitPrice,
          },
          { onConflict: 'child_id,month_key' }
        )

      if (error) throw error
      await loadMonthlyGroupPrices()
      setMessage('그룹 단가가 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '그룹 단가 저장 실패')
    }
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

    const matchedLogs = classLogs.filter((log) => {
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

    const dedupedMap = new Map<string, ClassLogRow>()

    matchedLogs.forEach((log) => {
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

      const prev = dedupedMap.get(key)
      if (!prev) {
        dedupedMap.set(key, log)
        return
      }

      const prevTime = new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()
      const nextTime = new Date(log.updated_at ?? log.created_at ?? 0).getTime()

      if (nextTime >= prevTime) {
        dedupedMap.set(key, log)
      }
    })

    return Array.from(dedupedMap.values())
  }, [allScheduleEntries, classLogs, csvMonth])
function getIndividualRowAmount(row: ScheduleEntryRow, child: ChildRow, didimIndex: number) {
    const voucherPrices = getVoucherPrices(child)
    const basePrice = Number(child.base_price ?? child.monthly_limit ?? 60000)

    if (row.is_group) return 0
    if (row.voucher_type === '디딤') return didimIndex <= 3 ? 0 : basePrice
    if (row.voucher_type === '아청심') return Number(voucherPrices['아청심'] ?? 54000)
    if (row.voucher_type === '드림스타트') return Number(voucherPrices['드림스타트'] ?? 40000)
    if (row.voucher_type === '배움') return Number(voucherPrices['배움'] ?? 10000)
    return basePrice
  }

  const attendanceSummaryRows = useMemo<AttendanceSummaryRow[]>(() => {
    const teacherMap = new Map<number, string>(staffs.map((s) => [Number(s.id), s.name]))
    const grouped = new Map<string, ClassLogRow[]>()

    validClassLogs.forEach((log) => {
      const key = `${log.child_id}-${log.staff_id}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(log)
    })

    return Array.from(grouped.entries())
      .map(([key, rows]) => {
        const first = rows[0]
        const child = children.find((c) => Number(c.id) === Number(first.child_id))
        const individualRows = rows.filter((r) => !r.is_group)
        const groupRows = rows.filter((r) => Boolean(r.is_group))

        return {
          key,
          child_id: Number(first.child_id),
          child_name: child?.child_name ?? `학생(${first.child_id})`,
          age_text: getAgeText(child?.birth_date),
          teacher_name: teacherMap.get(Number(first.staff_id)) ?? `선생님(${first.staff_id})`,
          attended_count: individualRows.filter((r) => r.status === 'attended').length,
          makeup_count: individualRows.filter((r) => r.status === 'makeup').length,
          absent_count: individualRows.filter((r) => r.status === 'absent').length,
          same_day_absent_count: individualRows.filter((r) => r.status === 'same_day_absent').length,
          attended_dates: uniqueDateList(individualRows.filter((r) => r.status === 'attended').map((r) => r.class_date)),
          makeup_dates: uniqueDateList(individualRows.filter((r) => r.status === 'makeup').map((r) => r.class_date)),
          absent_dates: uniqueDateList(individualRows.filter((r) => r.status === 'absent').map((r) => r.class_date)),
          same_day_absent_dates: uniqueDateList(individualRows.filter((r) => r.status === 'same_day_absent').map((r) => r.class_date)),
          group_attended_dates: uniqueDateList(
            groupRows.filter((r) => r.status === 'attended' || r.status === 'makeup').map((r) => r.class_date)
          ),
          group_absent_dates: uniqueDateList(
            groupRows.filter((r) => r.status === 'absent' || r.status === 'same_day_absent').map((r) => r.class_date)
          ),
        }
      })
      .sort((a, b) => {
        const nameCompare = a.child_name.localeCompare(b.child_name, 'ko')
        if (nameCompare !== 0) return nameCompare
        return a.teacher_name.localeCompare(b.teacher_name, 'ko')
      })
  }, [children, staffs, validClassLogs])

  const teacherLessonRows = useMemo<TeacherLessonRow[]>(() => {
    const teacherMap = new Map<number, string>(staffs.map((s) => [Number(s.id), s.name]))
    const childMap = new Map<number, string>(children.map((c) => [Number(c.id), c.child_name]))
    const grouped = new Map<string, ClassLogRow[]>()

    validClassLogs.forEach((log) => {
      const key = `${log.staff_id}-${log.child_id}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(log)
    })

    return Array.from(grouped.entries())
      .map(([key, rows]) => {
        const first = rows[0]
        const individualRows = rows.filter((r) => !r.is_group)
        const groupRows = rows.filter((r) => Boolean(r.is_group))

        return {
          key,
          teacher_name: teacherMap.get(Number(first.staff_id)) ?? `선생님(${first.staff_id})`,
          child_name: childMap.get(Number(first.child_id)) ?? `학생(${first.child_id})`,
          attended_dates: uniqueDateList(individualRows.filter((r) => r.status === 'attended').map((r) => r.class_date)),
          makeup_dates: uniqueDateList(individualRows.filter((r) => r.status === 'makeup').map((r) => r.class_date)),
          absent_dates: uniqueDateList(individualRows.filter((r) => r.status === 'absent').map((r) => r.class_date)),
          same_day_absent_dates: uniqueDateList(individualRows.filter((r) => r.status === 'same_day_absent').map((r) => r.class_date)),
          group_attended_dates: uniqueDateList(
            groupRows.filter((r) => r.status === 'attended' || r.status === 'makeup').map((r) => r.class_date)
          ),
          group_absent_dates: uniqueDateList(
            groupRows.filter((r) => r.status === 'absent' || r.status === 'same_day_absent').map((r) => r.class_date)
          ),
        }
      })
      .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, 'ko'))
  }, [staffs, children, validClassLogs])

  const settlementRows = useMemo<SettlementRow[]>(() => {
    const start = `${csvMonth}-01`
    const endDate = new Date(start)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)
    const end = toDateString(endDate)

    const monthlyScheduleRows = allScheduleEntries.filter(
      (row) => row.date >= start && row.date <= end && row.is_active
    )

    return children
      .filter((child) => child.is_active)
      .map((child) => {
        const scheduleRows = monthlyScheduleRows.filter((r) => Number(r.child_id) === Number(child.id))
        const attendanceRows = validClassLogs.filter((r) => Number(r.child_id) === Number(child.id))

        const groupRows = scheduleRows.filter((r) => Boolean(r.is_group))
        const individualRows = scheduleRows.filter((r) => !r.is_group)

        let didimCounter = 0
        let individualAmount = 0

        individualRows.forEach((row) => {
          if (row.voucher_type === '디딤') {
            didimCounter++
            individualAmount += getIndividualRowAmount(row, child, didimCounter)
          } else {
            individualAmount += getIndividualRowAmount(row, child, didimCounter)
          }
        })

        const groupUnitPrice = Number(monthlyGroupPrices[child.id] ?? 0)
        const groupAmount = groupRows.length * groupUnitPrice

        return {
          child_id: child.id,
          child_name: child.child_name,
          age_text: getAgeText(child.birth_date),
          voucher_label: getVoucherLabel(child.vouchers),
          lesson_count: individualRows.length,
          group_count: groupRows.length,
          absent_count: attendanceRows.filter((r) => !r.is_group && r.status === 'absent').length,
          same_day_absent_count: attendanceRows.filter((r) => !r.is_group && r.status === 'same_day_absent').length,
          group_unit_price: groupUnitPrice,
          total_amount: individualAmount + groupAmount,
        }
      })
      .sort((a, b) => a.child_name.localeCompare(b.child_name, 'ko'))
  }, [csvMonth, allScheduleEntries, children, validClassLogs, monthlyGroupPrices])

  const selectedChildMonthlyLogs = useMemo(() => {
    if (!childInfoModal.child) return []
    return validClassLogs.filter(
      (log) =>
        Number(log.child_id) === Number(childInfoModal.child?.id) &&
        log.class_date.startsWith(csvMonth)
    )
  }, [childInfoModal.child, validClassLogs, csvMonth])

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

  function downloadStudentCsv() {
    const rows = settlementRows.map((row) => [
      csvMonth,
      row.child_name,
      row.age_text,
      row.voucher_label,
      row.lesson_count,
      row.group_count,
      row.absent_count,
      row.same_day_absent_count,
      row.group_unit_price,
      row.total_amount,
    ])

    downloadCsvFile(
      `학생정산_${csvMonth}.csv`,
      ['정산월', '학생', '나이', '바우처', '개별수업횟수', '그룹수업횟수', '결석', '당일결석', '그룹단가', '총금액'],
      rows
    )
  }

  function downloadStaffCsv() {
    const rows = teacherLessonRows.map((row) => [
      csvMonth,
      row.teacher_name,
      row.child_name,
      row.attended_dates,
      row.makeup_dates,
      row.absent_dates,
      row.same_day_absent_dates,
      row.group_attended_dates,
      row.group_absent_dates,
    ])

    downloadCsvFile(
      `선생님수업정리_${csvMonth}.csv`,
      ['정산월', '선생님', '학생', '출석날짜', '보강날짜', '결석날짜', '당일결석날짜', '그룹출석/보강', '그룹결석/당일결석'],
      rows
    )
  }

  function downloadAttendanceRawCsv() {
    const rows = validClassLogs
      .slice()
      .sort((a, b) => {
        const aKey = `${a.class_date} ${a.class_time}`
        const bKey = `${b.class_date} ${b.class_time}`
        return aKey.localeCompare(bKey)
      })
      .map((log) => {
        const child = children.find((c) => Number(c.id) === Number(log.child_id))
        const staff = staffs.find((s) => Number(s.id) === Number(log.staff_id))

        return [
          log.id,
          log.class_date,
          formatTimestampToText(log.class_time),
          staff?.name ?? log.staff_id,
          child?.child_name ?? log.child_id,
          getAgeText(child?.birth_date),
          log.voucher_type ?? '',
          log.is_group ? 'Y' : 'N',
          log.group_name ?? '',
          formatKoreanStatus(log.status),
          log.note ?? '',
          formatTimestampToText(log.created_at),
          formatTimestampToText(log.updated_at),
        ]
      })

    downloadCsvFile(
      `출결RAW_${csvMonth}.csv`,
      ['로그ID', '수업일자', '수업시간', '선생님', '학생', '나이', '바우처', '그룹여부', '그룹명', '출결상태', '메모', '생성일시', '수정일시'],
      rows
    )
  }

  function downloadScheduleRawCsv() {
    const rows = allScheduleEntries
      .filter((row) => row.date.startsWith(csvMonth))
      .slice()
      .sort((a, b) => {
        const aKey = `${a.date} ${a.time_slot} ${String(a.minute_slot ?? 0).padStart(2, '0')}`
        const bKey = `${b.date} ${b.time_slot} ${String(b.minute_slot ?? 0).padStart(2, '0')}`
        return aKey.localeCompare(bKey)
      })
      .map((row) => {
        const child = children.find((c) => Number(c.id) === Number(row.child_id))
        const staff = staffs.find((s) => Number(s.id) === Number(row.teacher_id))

        return [
          row.id,
          row.date,
          formatClassTimeText(row.time_slot, row.minute_slot),
          staff?.name ?? row.teacher_name ?? row.teacher_id,
          child?.child_name ?? row.child_id ?? '',
          getAgeText(child?.birth_date),
          row.voucher_type ?? '',
          row.class_type ?? '',
          row.is_group ? 'Y' : 'N',
          row.group_name ?? '',
          row.room_number ?? '',
          row.is_active ? '사용중' : '삭제됨',
          row.note ?? '',
          formatTimestampToText(row.created_at),
          formatTimestampToText(row.updated_at),
        ]
      })

    downloadCsvFile(
      `시간표RAW_${csvMonth}.csv`,
      ['시간표ID', '수업일자', '수업시간', '선생님', '학생', '나이', '바우처', '수업유형', '그룹여부', '그룹명', '방번호', '활성상태', '메모', '생성일시', '수정일시'],
      rows
    )
  }

  function handleLogout() {
    localStorage.removeItem('staff_id')
    localStorage.removeItem('staff_name')
    localStorage.removeItem('staff_role')
    window.location.href = '/'
  }

  return (
    <main className="min-h-screen bg-slate-50 p-2 sm:p-3 md:p-6">
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur sm:p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTab('schedule')} className={`rounded-xl px-4 py-2 ${tab === 'schedule' ? 'bg-black text-white' : 'bg-slate-200'}`}>관리자 시간표</button>
            <button onClick={() => setTab('children')} className={`rounded-xl px-4 py-2 ${tab === 'children' ? 'bg-black text-white' : 'bg-slate-200'}`}>아이등록</button>
            <button onClick={() => setTab('staff')} className={`rounded-xl px-4 py-2 ${tab === 'staff' ? 'bg-black text-white' : 'bg-slate-200'}`}>선생님등록</button>
            <button onClick={() => setTab('summary')} className={`rounded-xl px-4 py-2 ${tab === 'summary' ? 'bg-black text-white' : 'bg-slate-200'}`}>월정산</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={csvMonth} onChange={(e) => setCsvMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
            <button onClick={downloadStudentCsv} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow">학생CSV</button>
            <button onClick={downloadStaffCsv} className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-bold text-white shadow">선생님CSV</button>
            <button onClick={downloadAttendanceRawCsv} className="rounded-xl bg-purple-500 px-3 py-2 text-sm font-bold text-white shadow">출결RAW</button>
            <button onClick={downloadScheduleRawCsv} className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-bold text-white shadow">시간표RAW</button>
            <button onClick={handleLogout} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold text-white shadow">로그아웃</button>
          </div>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'schedule' ? (
          <div className="space-y-4">
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap gap-2">
                <button onClick={() => setViewMode('all')} className={`rounded-xl px-4 py-2 text-sm ${viewMode === 'all' ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>전체보기</button>
                <button onClick={() => setViewMode('staff')} className={`rounded-xl px-4 py-2 text-sm ${viewMode === 'staff' ? 'bg-indigo-500 text-white' : 'bg-slate-200'}`}>선생님별 보기</button>
                <button onClick={() => setViewMode('daily')} className={`rounded-xl px-4 py-2 text-sm ${viewMode === 'daily' ? 'bg-orange-500 text-white' : 'bg-slate-200'}`}>일별 보기</button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const d = new Date(weekBaseDate)
                      d.setDate(d.getDate() - 7)
                      setWeekBaseDate(d)
                    }}
                    className="rounded-xl bg-slate-200 px-4 py-2"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(weekBaseDate)
                      d.setDate(d.getDate() + 7)
                      setWeekBaseDate(d)
                    }}
                    className="rounded-xl bg-slate-200 px-4 py-2"
                  >
                    ▶
                  </button>
                </div>

                {viewMode === 'staff' ? (
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value ? Number(e.target.value) : '')}
                    className="rounded-xl border px-3 py-2"
                  >
                    <option value="">선생님 선택</option>
                    {employeeStaffs.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} ({staff.login_id})
                      </option>
                    ))}
                  </select>
                ) : null}

                {viewMode === 'daily' ? (
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                  />
                ) : null}
              </div>
            </div>

            {loading ? (
              <div className="rounded-3xl border bg-white p-6 text-center text-slate-500 shadow-sm">
                불러오는 중...
              </div>
            ) : viewMode === 'daily' ? (
              <DailyScheduleView
                selectedDate={dailyDate}
                staffs={staffs}
                children={children}
                entries={allScheduleEntries}
                classLogs={classLogs}
                attendanceMap={attendanceMap}
                onOpenRecord={openRecordModal}
              />
            ) : (
              <div className="rounded-3xl border bg-white p-5 text-center text-slate-500 shadow-sm">
                전체보기 / 선생님별 보기는 현재 안정화 위해 기본 레이아웃 유지, 모바일 사용은 일별 보기를 권장
              </div>
            )}
          </div>
        ) : null}

        {tab === 'children' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">아이 등록 / 수정</h2>
              <div className="space-y-3">
                <input value={childForm.chartNo} onChange={(e) => setChildForm((p) => ({ ...p, chartNo: e.target.value }))} placeholder="차트번호" className="w-full rounded-2xl border px-3 py-3" />
                <input value={childForm.childName} onChange={(e) => setChildForm((p) => ({ ...p, childName: e.target.value }))} placeholder="이름" className="w-full rounded-2xl border px-3 py-3" />
                <input type="date" value={childForm.birthDate} onChange={(e) => setChildForm((p) => ({ ...p, birthDate: e.target.value }))} className="w-full rounded-2xl border px-3 py-3" />
                <input value={childForm.phone} onChange={(e) => setChildForm((p) => ({ ...p, phone: e.target.value }))} placeholder="핸드폰 번호" className="w-full rounded-2xl border px-3 py-3" />

                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">바우처(여러 개 선택)</div>
                  <div className="flex flex-wrap gap-2">
                    {VOUCHER_OPTIONS.map((voucher) => {
                      const active = childForm.voucherTypes.includes(voucher)
                      return (
                        <button
                          key={voucher}
                          type="button"
                          onClick={() => toggleChildVoucher(voucher)}
                          className={`rounded-full px-3 py-2 text-sm ${active ? 'bg-black text-white' : 'bg-slate-200 text-slate-700'}`}
                        >
                          {voucher}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border p-3">
                  <div className="font-medium">단가 입력</div>
                  <label className="block text-sm">일반</label>
                  <input value={childForm.basePrice} onChange={(e) => setChildForm((p) => ({ ...p, basePrice: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                  <label className="block text-sm">디딤</label>
                  <input value={childForm.didimPrice} onChange={(e) => setChildForm((p) => ({ ...p, didimPrice: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                  <label className="block text-sm">아청심</label>
                  <input value={childForm.achungsimPrice} onChange={(e) => setChildForm((p) => ({ ...p, achungsimPrice: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                  <label className="block text-sm">드림스타트</label>
                  <input value={childForm.dreamStartPrice} onChange={(e) => setChildForm((p) => ({ ...p, dreamStartPrice: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                  <label className="block text-sm">배움</label>
                  <input value={childForm.baeumPrice} onChange={(e) => setChildForm((p) => ({ ...p, baeumPrice: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                  <label className="block text-sm">메모</label>
                  <input value={childForm.notes} onChange={(e) => setChildForm((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-xl border px-3 py-2" />
                </div>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={childForm.isActive} onChange={(e) => setChildForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  사용중
                </label>

                <button onClick={handleSaveChild} className="w-full rounded-2xl bg-black py-3 text-white">
                  {childForm.id ? '아이 수정' : '아이 등록'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">아이 목록</h2>
                <input value={childSearch} onChange={(e) => setChildSearch(e.target.value)} placeholder="이름 검색" className="rounded-xl border px-3 py-2 text-sm" />
              </div>

              <div className="space-y-2">
                {filteredChildren.length === 0 ? (
                  <div className="rounded-xl border p-3 text-slate-500">등록된 아이가 없습니다.</div>
                ) : (
                  filteredChildren.map((child) => {
                    const voucherPrices = getVoucherPrices(child)
                    const childVouchers = child.vouchers ?? (child.voucher_yn ? ['디딤'] : ['일반'])

                    return (
                      <button
                        key={child.id}
                        onClick={() =>
                          setChildForm({
                            id: child.id,
                            childName: child.child_name,
                            birthDate: child.birth_date ?? '',
                            phone: child.phone ?? '',
                            chartNo: child.chart_no ?? '',
                            voucherTypes: childVouchers,
                            basePrice: String(child.base_price ?? child.monthly_limit ?? 60000),
                            didimPrice: String(voucherPrices['디딤'] ?? 10000),
                            achungsimPrice: String(voucherPrices['아청심'] ?? 54000),
                            dreamStartPrice: String(voucherPrices['드림스타트'] ?? 40000),
                            baeumPrice: String(voucherPrices['배움'] ?? 10000),
                            notes: child.notes ?? '',
                            isActive: child.is_active,
                          })
                        }
                        className="w-full rounded-2xl border p-3 text-left hover:bg-slate-50"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{getDisplayName(child)}</div>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${getVoucherClass(getVoucherLabel(childVouchers))}`}>
                            {getVoucherLabel(childVouchers)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {child.chart_no ? `차트번호 ${child.chart_no}` : '차트번호 없음'}
                          {child.phone ? ` / ${child.phone}` : ''}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'staff' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">선생님 등록 / 수정</h2>
              <div className="space-y-3">
                <input value={staffForm.loginId} onChange={(e) => setStaffForm((p) => ({ ...p, loginId: e.target.value }))} placeholder="로그인 ID" className="w-full rounded-2xl border px-3 py-3" />
                <input value={staffForm.name} onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))} placeholder="이름" className="w-full rounded-2xl border px-3 py-3" />
                <input type="password" value={staffForm.password} onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))} placeholder={staffForm.id ? '비밀번호 변경 시만 입력' : '비밀번호'} className="w-full rounded-2xl border px-3 py-3" />
                <select value={staffForm.role} onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value as StaffRole }))} className="w-full rounded-2xl border px-3 py-3">
                  <option value="employee">employee</option>
                  <option value="admin">admin</option>
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={staffForm.isActive} onChange={(e) => setStaffForm((p) => ({ ...p, isActive: e.target.checked }))} />
                  사용중
                </label>
                <button onClick={handleSaveStaff} className="w-full rounded-2xl bg-black py-3 text-white">
                  {staffForm.id ? '선생님 수정' : '선생님 등록'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">선생님 목록</h2>
              <div className="space-y-2">
                {staffs.map((staff) => (
                  <button
                    key={staff.id}
                    onClick={() =>
                      setStaffForm({
                        id: staff.id,
                        loginId: staff.login_id,
                        password: '',
                        name: staff.name,
                        role: staff.role,
                        isActive: staff.is_active,
                      })
                    }
                    className="w-full rounded-2xl border p-3 text-left hover:bg-slate-50"
                  >
                    <div className="font-medium">{staff.name} ({staff.login_id})</div>
                    <div className="text-sm text-slate-500">{staff.role} / {staff.is_active ? '사용중' : '중지'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'summary' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSummarySubTab('attendance')} className={`rounded-xl px-4 py-2 text-sm ${summarySubTab === 'attendance' ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>학생출결</button>
              <button onClick={() => setSummarySubTab('teacher')} className={`rounded-xl px-4 py-2 text-sm ${summarySubTab === 'teacher' ? 'bg-indigo-500 text-white' : 'bg-slate-200'}`}>선생님 수업</button>
              <button onClick={() => setSummarySubTab('settlement')} className={`rounded-xl px-4 py-2 text-sm ${summarySubTab === 'settlement' ? 'bg-orange-500 text-white' : 'bg-slate-200'}`}>월학생정산</button>
            </div>

            {summarySubTab === 'attendance' ? (
              <div className="space-y-3">
                <div className="hidden overflow-x-auto rounded-3xl border bg-white shadow-sm md:block">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-slate-100 px-3 py-2">학생</th>
                        <th className="border bg-slate-100 px-3 py-2">나이</th>
                        <th className="border bg-slate-100 px-3 py-2">선생님</th>
                        <th className="border bg-slate-100 px-3 py-2">출석</th>
                        <th className="border bg-slate-100 px-3 py-2">보강</th>
                        <th className="border bg-slate-100 px-3 py-2">결석</th>
                        <th className="border bg-slate-100 px-3 py-2">당일결석</th>
                        <th className="border bg-slate-100 px-3 py-2">출석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">보강날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">결석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">당일결석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹수업출석</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹수업결석및 당일결석</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceSummaryRows.map((row) => (
                        <tr key={row.key}>
                          <td className="border px-3 py-2">{row.child_name}</td>
                          <td className="border px-3 py-2">{row.age_text}</td>
                          <td className="border px-3 py-2">{row.teacher_name}</td>
                          <td className="border px-3 py-2 text-center">{row.attended_count}</td>
                          <td className="border px-3 py-2 text-center">{row.makeup_count}</td>
                          <td className="border px-3 py-2 text-center">{row.absent_count}</td>
                          <td className="border px-3 py-2 text-center">{row.same_day_absent_count}</td>
                          <td className="border px-3 py-2">{row.attended_dates}</td>
                          <td className="border px-3 py-2">{row.makeup_dates}</td>
                          <td className="border px-3 py-2">{row.absent_dates}</td>
                          <td className="border px-3 py-2">{row.same_day_absent_dates}</td>
                          <td className="border px-3 py-2">{row.group_attended_dates}</td>
                          <td className="border px-3 py-2">{row.group_absent_dates}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {attendanceSummaryRows.map((row) => (
                    <div key={row.key} className="rounded-3xl border bg-white p-4 shadow-sm">
                      <div className="mb-1 text-base font-bold text-slate-900">{row.child_name}</div>
                      <div className="mb-2 text-sm text-slate-500">{row.age_text}세 / {row.teacher_name}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-slate-50 p-2">출석 {row.attended_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">보강 {row.makeup_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">결석 {row.absent_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">당일결석 {row.same_day_absent_count}</div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <div>출석날짜: {row.attended_dates || '-'}</div>
                        <div>보강날짜: {row.makeup_dates || '-'}</div>
                        <div>결석날짜: {row.absent_dates || '-'}</div>
                        <div>당일결석날짜: {row.same_day_absent_dates || '-'}</div>
                        <div>그룹수업출석: {row.group_attended_dates || '-'}</div>
                        <div>그룹수업결석및 당일결석: {row.group_absent_dates || '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summarySubTab === 'teacher' ? (
              <div className="space-y-3">
                <div className="hidden overflow-x-auto rounded-3xl border bg-white shadow-sm md:block">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-slate-100 px-3 py-2">선생님</th>
                        <th className="border bg-slate-100 px-3 py-2">학생</th>
                        <th className="border bg-slate-100 px-3 py-2">출석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">보강날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">결석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">당일결석날짜</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹출석/보강</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹결석/당일결석</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherLessonRows.map((row) => (
                        <tr key={row.key}>
                          <td className="border px-3 py-2">{row.teacher_name}</td>
                          <td className="border px-3 py-2">{row.child_name}</td>
                          <td className="border px-3 py-2">{row.attended_dates}</td>
                          <td className="border px-3 py-2">{row.makeup_dates}</td>
                          <td className="border px-3 py-2">{row.absent_dates}</td>
                          <td className="border px-3 py-2">{row.same_day_absent_dates}</td>
                          <td className="border px-3 py-2">{row.group_attended_dates}</td>
                          <td className="border px-3 py-2">{row.group_absent_dates}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {teacherLessonRows.map((row) => (
                    <div key={row.key} className="rounded-3xl border bg-white p-4 shadow-sm">
                      <div className="font-bold text-slate-900">{row.teacher_name}</div>
                      <div className="mb-2 text-sm text-slate-500">{row.child_name}</div>
                      <div className="space-y-1 text-xs text-slate-600">
                        <div>출석날짜: {row.attended_dates || '-'}</div>
                        <div>보강날짜: {row.makeup_dates || '-'}</div>
                        <div>결석날짜: {row.absent_dates || '-'}</div>
                        <div>당일결석날짜: {row.same_day_absent_dates || '-'}</div>
                        <div>그룹출석/보강: {row.group_attended_dates || '-'}</div>
                        <div>그룹결석/당일결석: {row.group_absent_dates || '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summarySubTab === 'settlement' ? (
              <div className="space-y-3">
                <div className="hidden overflow-x-auto rounded-3xl border bg-white shadow-sm md:block">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-slate-100 px-3 py-2">학생</th>
                        <th className="border bg-slate-100 px-3 py-2">나이</th>
                        <th className="border bg-slate-100 px-3 py-2">바우처</th>
                        <th className="border bg-slate-100 px-3 py-2">출석+보강횟수</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹횟수</th>
                        <th className="border bg-slate-100 px-3 py-2">결석</th>
                        <th className="border bg-slate-100 px-3 py-2">당일결석</th>
                        <th className="border bg-slate-100 px-3 py-2">그룹단가</th>
                        <th className="border bg-slate-100 px-3 py-2">총금액</th>
                        <th className="border bg-slate-100 px-3 py-2">저장</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementRows.map((row) => (
                        <tr key={row.child_id}>
                          <td className="border px-3 py-2">{row.child_name}</td>
                          <td className="border px-3 py-2">{row.age_text}</td>
                          <td className="border px-3 py-2">{row.voucher_label}</td>
                          <td className="border px-3 py-2 text-center">{row.lesson_count}</td>
                          <td className="border px-3 py-2 text-center">{row.group_count}</td>
                          <td className="border px-3 py-2 text-center">{row.absent_count}</td>
                          <td className="border px-3 py-2 text-center">{row.same_day_absent_count}</td>
                          <td className="border px-3 py-2 text-center">
                            <input
                              value={monthlyGroupPrices[row.child_id] ?? ''}
                              onChange={(e) =>
                                setMonthlyGroupPrices((prev) => ({
                                  ...prev,
                                  [row.child_id]: e.target.value,
                                }))
                              }
                              className="w-20 rounded border px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="border px-3 py-2 text-center font-semibold">{row.total_amount}</td>
                          <td className="border px-3 py-2 text-center">
                            <button
                              onClick={() => saveGroupUnitPrice(row.child_id, monthlyGroupPrices[row.child_id] ?? '0')}
                              className="rounded bg-slate-700 px-3 py-1 text-xs text-white"
                            >
                              저장
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {settlementRows.map((row) => (
                    <div key={row.child_id} className="rounded-3xl border bg-white p-4 shadow-sm">
                      <div className="font-bold text-slate-900">{row.child_name}</div>
                      <div className="mb-2 text-sm text-slate-500">{row.age_text}세 / {row.voucher_label}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-slate-50 p-2">개별 {row.lesson_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">그룹 {row.group_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">결석 {row.absent_count}</div>
                        <div className="rounded-xl bg-slate-50 p-2">당일결석 {row.same_day_absent_count}</div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          value={monthlyGroupPrices[row.child_id] ?? ''}
                          onChange={(e) =>
                            setMonthlyGroupPrices((prev) => ({
                              ...prev,
                              [row.child_id]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-xl border px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => saveGroupUnitPrice(row.child_id, monthlyGroupPrices[row.child_id] ?? '0')}
                          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white"
                        >
                          저장
                        </button>
                      </div>
                      <div className="mt-3 text-base font-bold text-slate-900">총금액 {row.total_amount}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {recordModal.open && recordModal.entry ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
            onClick={() =>
              setRecordModal({
                open: false,
                entry: null,
                status: 'attended',
                teacherName: '',
              })
            }
          >
            <div
              className="w-full max-w-md rounded-[32px] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const entry = recordModal.entry!
                const child = children.find((c) => Number(c.id) === Number(entry.child_id))
                const minuteText = String(entry.minute_slot ?? 0).padStart(2, '0')
                const lessonTime = `${entry.time_slot.slice(0, 2)}:${minuteText}`
                const absentCount = entry.child_id ? getRunningAbsentCount(Number(entry.child_id)) : 0

                return (
                  <>
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xl font-bold text-slate-900 sm:text-2xl">수업 상태 선택</div>
                        <div className="mt-2 text-sm text-slate-500">
                          {entry.date} · {lessonTime}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setRecordModal({
                            open: false,
                            entry: null,
                            status: 'attended',
                            teacherName: '',
                          })
                        }
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-200"
                      >
                        닫기
                      </button>
                    </div>

                    <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-slate-400">학생</span>
                          <div className="mt-1 font-semibold text-slate-900">
                            {child?.child_name ?? `학생(${entry.child_id})`}
                            {child ? ` (${getAgeText(child.birth_date)}세)` : ''}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400">선생님</span>
                          <div className="mt-1 font-semibold text-slate-900">
                            {recordModal.teacherName || '-'}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400">수업유형</span>
                          <div className="mt-1">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getVoucherClass(entry.voucher_type)}`}>
                              {entry.voucher_type || '일반'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400">누적 결석횟수</span>
                          <div className="mt-1 font-semibold text-rose-600">{absentCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => setRecordModal((prev) => ({ ...prev, status: 'attended' }))}
                        className={`rounded-2xl border px-4 py-4 text-base font-bold transition ${
                          recordModal.status === 'attended'
                            ? 'border-blue-600 bg-blue-600 text-white shadow'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        출석
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecordModal((prev) => ({ ...prev, status: 'makeup' }))}
                        className={`rounded-2xl border px-4 py-4 text-base font-bold transition ${
                          recordModal.status === 'makeup'
                            ? 'border-sky-600 bg-sky-600 text-white shadow'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        보강
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecordModal((prev) => ({ ...prev, status: 'absent' }))}
                        className={`rounded-2xl border px-4 py-4 text-base font-bold transition ${
                          recordModal.status === 'absent'
                            ? 'border-rose-600 bg-rose-600 text-white shadow'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        결석
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecordModal((prev) => ({ ...prev, status: 'same_day_absent' }))}
                        className={`rounded-2xl border px-4 py-4 text-base font-bold transition ${
                          recordModal.status === 'same_day_absent'
                            ? 'border-red-600 bg-red-600 text-white shadow'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        당일결석
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSaveAttendanceFromModal}
                        className="rounded-2xl bg-indigo-600 px-4 py-3 text-lg font-bold text-white shadow hover:bg-indigo-700"
                      >
                        저장
                      </button>

                      <button
                        onClick={() =>
                          setRecordModal({
                            open: false,
                            entry: null,
                            status: 'attended',
                            teacherName: '',
                          })
                        }
                        className="rounded-2xl bg-slate-100 px-4 py-3 text-lg font-bold text-slate-700 hover:bg-slate-200"
                      >
                        취소
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        ) : null}

        {childInfoModal.open && childInfoModal.child ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-lg rounded-[32px] bg-white p-5 shadow-2xl">
              <h3 className="mb-4 text-xl font-bold sm:text-2xl">아이 정보</h3>

              <div className="grid gap-2 text-sm sm:text-base">
                <div>이름: {childInfoModal.child.child_name}</div>
                <div>나이: {getAgeText(childInfoModal.child.birth_date)}세</div>
                <div>차트번호: {childInfoModal.child.chart_no ?? '-'}</div>
                <div>생년월일: {childInfoModal.child.birth_date ?? '-'}</div>
                <div>핸드폰: {childInfoModal.child.phone ?? '-'}</div>
                <div>바우처: {getVoucherLabel(childInfoModal.child.vouchers)}</div>
                <div>메모: {childInfoModal.child.notes ?? '-'}</div>
              </div>

              <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-xs sm:text-sm">
                <div><span className="font-semibold">출석날짜:</span> {childInfoDates.attended || '-'}</div>
                <div><span className="font-semibold">보강날짜:</span> {childInfoDates.makeup || '-'}</div>
                <div><span className="font-semibold">결석날짜:</span> {childInfoDates.absent || '-'}</div>
                <div><span className="font-semibold">당일결석날짜:</span> {childInfoDates.sameDayAbsent || '-'}</div>
                <div><span className="font-semibold">그룹수업출석:</span> {childInfoDates.groupAttended || '-'}</div>
                <div><span className="font-semibold">그룹수업결석및 당일결석:</span> {childInfoDates.groupAbsent || '-'}</div>
              </div>

              <button
                onClick={() => setChildInfoModal({ open: false, child: null })}
                className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-lg font-bold text-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}