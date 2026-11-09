'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { recordAttendance } from '@/lib/recordAttendance'
import { saveScheduleRows } from '@/lib/saveScheduleRows'
import { latestLog, isCompleted, makeupBalances, balanceText } from '@/lib/attendanceReport'
import { cancelOccurrences } from '@/lib/cancelOccurrences'
import { MAKEUP_REQUIRED_MINUTES, MAKEUP_MINUTE_OPTIONS } from '@/lib/makeupPolicy'

type MainTab = 'today' | 'schedule' | 'week_overview'
type AttendanceStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'
type ScheduleMakeupType = 'none' | 'day' | 'time'
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
  absent_class_log_id?: number | null
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
  schedule_entry_id?: string | null
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

type MakeupTimeLogRow = {
  id: string
  child_id: number
  absent_date: string
  makeup_date: string
  minutes: number
  note?: string | null
  created_at?: string | null
}

type MakeupAbsentProgressRow = {
  absent_log_id?: number
  used_count?: number
  reserved_minutes?: number
  ambiguous?: boolean
  absent_date: string
  teacher_name?: string
  required_minutes: number
  completed_minutes: number
  remaining_minutes: number
  completed: boolean
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

const STATUS_OPTIONS: AttendanceStatus[] = ['attended', 'absent', 'makeup']

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
  return '결석'
}

function getStatusClass(status: AttendanceStatus) {
  if (status === 'attended') return 'border border-blue-200 bg-blue-100 text-blue-700'
  if (status === 'makeup') return 'border border-orange-200 bg-orange-100 text-orange-700'
  if (status === 'absent') return 'border border-rose-200 bg-rose-50 text-rose-600'
  return 'border border-red-200 bg-red-100 text-red-700'
}

function getTodayCardBgClass(status: AttendanceStatus | null, note?: string | null) {
  if (status === 'attended') return 'border-blue-200 bg-blue-50 shadow-blue-100'
  if (status === 'makeup') return 'border-orange-300 bg-orange-50 shadow-orange-100'
  if (status === 'absent') return 'border-rose-200 bg-rose-50 shadow-rose-100'
  if (status === 'same_day_absent') return 'border-rose-200 bg-rose-50 shadow-rose-100'
  if (isMakeupScheduleNote(note) || isTimeMakeupScheduleNote(note)) return 'border-orange-200 bg-orange-50 shadow-orange-100'
  return 'border-slate-200 bg-white shadow-slate-100'
}


function compactScheduleName(value: string, maxLength = 10) {
  const clean = (value || '').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength)}…`
}

function getScheduleItemCompactTitle(item: DisplayScheduleItem, children: ChildRow[]) {
  const minute = String(item.minuteSlot).padStart(2, '0')
  if (item.isGroup) {
    const groupName = compactScheduleName(item.groupName || '그룹수업', 12)
    const childCount = item.rows.length
    return childCount > 1 ? `${minute} ${groupName}(${childCount})` : `${minute} ${groupName}`
  }

  const child = children.find((c) => Number(c.id) === Number(item.rows[0]?.child_id))
  return `${minute} ${compactScheduleName(child?.child_name ?? '이름없음', 10)}`
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

function toMonthDayText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return value
  return `${match[2]}-${match[3]}`
}

function uniqueDateList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort()
    .map(toMonthDayText)
    .join(', ')
}



function getCurrentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthStartEndFromKey(monthKey: string) {
  const [yearText, monthText] = monthKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (!year || !month) return getMonthStartEnd(new Date())
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return { start: toDateString(start), end: toDateString(end) }
}

function uniqueAbsentDateListWithMakeupDate(values: string[], makeupDateMap: Map<string, string[]>) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort()
    .map((date) => {
      const makeupDates = Array.from(new Set(makeupDateMap.get(date) ?? []))
        .filter(Boolean)
        .sort()
        .map(toMonthDayText)

      return makeupDates.length > 0
        ? `${toMonthDayText(date)}(보 ${makeupDates.join('/')})`
        : toMonthDayText(date)
    })
    .join(', ')
}

const MAKEUP_NOTE_TAG = '[보강]'
const MAKEUP_ABSENT_DATE_PREFIX = '[결석일:'

function isMakeupScheduleNote(note: string | null | undefined) {
  return Boolean(note?.includes(MAKEUP_NOTE_TAG))
}

function parseMakeupAbsentDate(note: string | null | undefined) {
  if (!note) return ''
  const matched = note.match(/\[결석일:([^\]]+)\]/)
  if (!matched) return ''
  return matched[1] === '없음' ? '' : matched[1]
}

function isTimeMakeupScheduleNote(note: string | null | undefined) {
  return Boolean(note?.includes('[시간보강:'))
}

function parseTimeMakeupMinutes(note: string | null | undefined) {
  if (!note) return ''
  const matched = note.match(/\[시간보강:(\d+)분\]/)
  return matched?.[1] ?? ''
}

function parseMakeupTeacherName(note: string | null | undefined) {
  if (!note) return ''
  const matched = note.match(/\[담당:([^\]]+)\]/)
  if (!matched) return ''
  return matched[1].trim()
}

function stripMakeupTags(note: string | null | undefined) {
  if (!note) return ''
  return note
    .replace(/\[보강\]/g, '')
    .replace(/\[결석기록:\d+\]/g, '')
    .replace(/\[시간보강:\d+분\]/g, '')
    .replace(/\s*\[결석일:[^\]]+\]\s*/g, ' ')
    .replace(/\s*\[담당:[^\]]+\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripSystemScheduleTags(note: string | null | undefined) {
  if (!note) return ''
  return stripMakeupTags(note)
    .replace(/\s*\[정기수업:\d+\]\s*/g, ' ')
    .replace(/\s*\[정기그룹:\d+\]\s*/g, ' ')
    .replace(/\s*\[보조교사:\d+:.*?\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildScheduleNote(baseNote: string, isMakeup: boolean, absentDate: string, teacherName = '', absentLogId?: number) {
  const cleanNote = stripMakeupTags(baseNote)
  if (!isMakeup) return cleanNote || null

  const tags = [MAKEUP_NOTE_TAG, `${MAKEUP_ABSENT_DATE_PREFIX}${absentDate || '없음'}]`, ...(absentLogId ? [`[결석기록:${absentLogId}]`] : [])]
  if (teacherName) tags.push(`[담당:${teacherName}]`)
  return [tags.join(' '), cleanNote].filter(Boolean).join(' ').trim()
}

function isTimeMakeupScheduleRow(row: ScheduleEntryRow) {
  return row.voucher_type === '시간보강' || isTimeMakeupScheduleNote(row.note)
}

function isCompletedTimeMakeupAttendanceStatus(status?: AttendanceStatus | null) {
  return status === 'attended' || status === 'makeup'
}



function findClassLogForScheduleRow(row: ScheduleEntryRow, logs: ClassLogRow[]) { return (latestLog(row,logs) as ClassLogRow | undefined) ?? null }

function buildCompletedTimeMakeupMinuteMap(rows: ScheduleEntryRow[], logs: ClassLogRow[]) {
  const minuteMap = new Map<string, number>()

  rows
    .filter((row) => row.is_active && !row.is_group && isTimeMakeupScheduleRow(row))
    .forEach((row) => {
      const absentDate = parseMakeupAbsentDate(row.note)
      if (!absentDate) return

      const log = findClassLogForScheduleRow(row, logs)
      if (!isCompletedTimeMakeupAttendanceStatus(log?.status)) return

      const minutes = Number(parseTimeMakeupMinutes(row.note) || 0)
      if (!Number.isFinite(minutes) || minutes <= 0) return

      minuteMap.set(absentDate, (minuteMap.get(absentDate) ?? 0) + minutes)
    })

  return minuteMap
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
  const [makeupScheduleRows, setMakeupScheduleRows] = useState<ScheduleEntryRow[]>([])
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
  const [isMakeupSchedule, setIsMakeupSchedule] = useState(false)
  const [scheduleMakeupType, setScheduleMakeupType] = useState<ScheduleMakeupType>('none')
  const [scheduleTimeMakeupMinutes, setScheduleTimeMakeupMinutes] = useState('10')
  const [makeupAbsentSelection, setMakeupAbsentDate] = useState('')
  const makeupAbsentDate = makeupAbsentSelection.split('|')[0]
  const makeupAbsentLogId = Number(makeupAbsentSelection.split('|')[1] || 0)
  const [isGroupLesson, setIsGroupLesson] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [selectedGroupChildIds, setSelectedGroupChildIds] = useState<number[]>([])
  const [studentInfoSearch, setStudentInfoSearch] = useState('')

  const [recordModal, setRecordModal] = useState<{
    open: boolean
    entry: ScheduleEntryRow | null
    status: AttendanceStatus
  }>({
    open: false,
    entry: null,
    status: 'attended',
  })
  const [recordMakeupDate, setRecordMakeupDate] = useState('')
  const [recordMakeupHour, setRecordMakeupHour] = useState('09:00')
  const [recordMakeupMinute, setRecordMakeupMinute] = useState('00')

  const [childInfoModal, setChildInfoModal] = useState<{
    open: boolean
    child: ChildRow | null
  }>({
    open: false,
    child: null,
  })
  const [childInfoMonth, setChildInfoMonth] = useState(() => getCurrentMonthKey())
  const [childMonthlyLogRows, setChildMonthlyLogRows] = useState<ClassLogRow[]>([])
  const [childAllAbsentLogRows, setChildAllAbsentLogRows] = useState<ClassLogRow[]>([])
  const [childAllMakeupScheduleRows, setChildAllMakeupScheduleRows] = useState<ScheduleEntryRow[]>([])
  const [childInfoMakeupTimeLogs, setChildInfoMakeupTimeLogs] = useState<MakeupTimeLogRow[]>([])
  const [makeupAbsentCandidateLogs, setMakeupAbsentCandidateLogs] = useState<ClassLogRow[]>([])
  const [makeupAbsentCandidateSchedules, setMakeupAbsentCandidateSchedules] = useState<ScheduleEntryRow[]>([])
  const [scheduleChildMakeupTimeLogs, setScheduleChildMakeupTimeLogs] = useState<MakeupTimeLogRow[]>([])

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

  const filteredStudentInfoChildren = useMemo(() => {
    const keyword = studentInfoSearch.trim().toLowerCase()
    if (!keyword) return []
    return children
      .filter((c) => c.is_active)
      .filter((c) => c.child_name.toLowerCase().includes(keyword) || getDisplayName(c).toLowerCase().includes(keyword))
      .slice(0, 8)
  }, [children, studentInfoSearch])

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
    return childMonthlyLogRows
  }, [childMonthlyLogRows])

  const childInfoRecoveredAbsentDateSet = useMemo(() => {
    return new Set(
      childAllMakeupScheduleRows
        .filter((row) => row.is_active && isCompleted(row, childAllAbsentLogRows) && !row.is_group && isMakeupScheduleNote(row.note))
        .map((row) => parseMakeupAbsentDate(row.note))
        .filter(Boolean)
    )
  }, [childAllMakeupScheduleRows])

  const childInfoDates = useMemo(() => {
    const individualRows = selectedChildMonthlyLogs.filter((r) => !r.is_group)
    const groupRows = selectedChildMonthlyLogs.filter((r) => Boolean(r.is_group))

    const makeupDateMap = new Map<string, string[]>()

    childAllMakeupScheduleRows
      .filter((row) => row.is_active && isCompleted(row, childAllAbsentLogRows) && !row.is_group && !isTimeMakeupScheduleRow(row) && isMakeupScheduleNote(row.note))
      .forEach((row) => {
        const absentDate = parseMakeupAbsentDate(row.note)
        if (!absentDate) return
        const current = makeupDateMap.get(absentDate) ?? []
        current.push(row.date)
        makeupDateMap.set(absentDate, current)
      })

    const fullMakeupAbsentDateSet = new Set<string>(Array.from(makeupDateMap.keys()).filter(Boolean))
    const timeMakeupMinuteMap = buildCompletedTimeMakeupMinuteMap(childAllMakeupScheduleRows, childAllAbsentLogRows)
    const staffNameMap = new Map(staffs.map((staff) => [Number(staff.id), staff.name]))
    const absentDates = Array.from(
      new Set<string>(
        childAllAbsentLogRows
          .filter((log) => !log.is_group && (log.status === 'absent' || log.status === 'same_day_absent'))
          .map((log) => log.class_date)
          .filter(Boolean)
      )
    ).sort()

    const unrecoveredAbsent = makeupBalances(childAllMakeupScheduleRows, childAllAbsentLogRows).map(balanceText).join(' / ')

    return {
      attended: uniqueDateList(individualRows.filter((r) => r.status === 'attended').map((r) => r.class_date)),
      makeup: uniqueDateList(individualRows.filter((r) => r.status === 'makeup').map((r) => r.class_date)),
      absent: uniqueAbsentDateListWithMakeupDate(
        individualRows.filter((r) => r.status === 'absent').map((r) => r.class_date),
        makeupDateMap
      ),
      groupAttended: uniqueDateList(
        groupRows.filter((r) => r.status === 'attended' || r.status === 'makeup').map((r) => r.class_date)
      ),
      groupAbsent: uniqueDateList(
        groupRows.filter((r) => r.status === 'absent' || r.status === 'same_day_absent').map((r) => r.class_date)
      ),
      unrecoveredAbsent,
    }
  }, [selectedChildMonthlyLogs, childAllAbsentLogRows, childAllMakeupScheduleRows, staffs])

  const usedMakeupAbsentDateSet = useMemo(() => {
    if (!scheduleChildId) return new Set<string>()

    return new Set(
      makeupAbsentCandidateSchedules
        .filter(
          (row) =>
            Number(row.child_id) === Number(scheduleChildId) &&
            row.id !== editingEntryId &&
            row.is_active && isCompleted(row, makeupAbsentCandidateLogs) &&
            !isTimeMakeupScheduleRow(row) &&
            isMakeupScheduleNote(row.note)
        )
        .map((row) => parseMakeupAbsentDate(row.note))
        .filter(Boolean)
    )
  }, [makeupAbsentCandidateSchedules, scheduleChildId, editingEntryId])

  const scheduleTimeMakeupMinuteMap = useMemo(() => {
    return buildCompletedTimeMakeupMinuteMap(makeupAbsentCandidateSchedules, makeupAbsentCandidateLogs)
  }, [makeupAbsentCandidateSchedules, makeupAbsentCandidateLogs])

  const scheduleMakeupAbsentProgressItems = useMemo<MakeupAbsentProgressRow[]>(() => makeupBalances(makeupAbsentCandidateSchedules.filter(row=>row.id!==editingEntryId),makeupAbsentCandidateLogs).filter(b=>b.remainingMinutes>0).map(b=>({
 absent_log_id:b.absence.id,absent_date:b.absence.class_date,teacher_name:(staffs.find(s=>Number(s.id)===b.absence.staff_id)?.name??'')+' '+(b.absence.class_time ? new Date(b.absence.class_time).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}):''),
 required_minutes:MAKEUP_REQUIRED_MINUTES,completed_minutes:b.usedMinutes,remaining_minutes:b.remainingMinutes,completed:false,used_count:b.usedCount,reserved_minutes:b.reservedMinutes,ambiguous:b.ambiguous
 })),[makeupAbsentCandidateSchedules,makeupAbsentCandidateLogs,editingEntryId,staffs])

  const makeupAbsentDateOptions = useMemo(() => {
    return scheduleMakeupAbsentProgressItems.map((row) => row.absent_date)
  }, [scheduleMakeupAbsentProgressItems])

  const selectedScheduleMakeupProgress = useMemo(() => scheduleMakeupAbsentProgressItems.find(row=>row.absent_log_id===makeupAbsentLogId)??null,[scheduleMakeupAbsentProgressItems,makeupAbsentLogId])

  const scheduleAvailableTimeMakeupMinutes = useMemo(() => MAKEUP_MINUTE_OPTIONS.filter(minutes=>minutes <= ((selectedScheduleMakeupProgress?.remaining_minutes??0)-(selectedScheduleMakeupProgress?.reserved_minutes??0))),[selectedScheduleMakeupProgress])

  useEffect(() => {
    if (scheduleMakeupType !== 'time') return
    if (!makeupAbsentDate) {
      setScheduleTimeMakeupMinutes('10')
      return
    }

    if (scheduleAvailableTimeMakeupMinutes.length === 0) {
      setScheduleTimeMakeupMinutes('')
      return
    }

    if (!scheduleAvailableTimeMakeupMinutes.includes(Number(scheduleTimeMakeupMinutes))) {
      setScheduleTimeMakeupMinutes(String(scheduleAvailableTimeMakeupMinutes[0]))
    }
  }, [scheduleMakeupType, makeupAbsentDate, scheduleAvailableTimeMakeupMinutes, scheduleTimeMakeupMinutes])

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
    setIsMakeupSchedule(false)
    setScheduleMakeupType('none')
    setScheduleTimeMakeupMinutes('10')
    setMakeupAbsentDate('')
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

      const label = (
        item.isGroup
          ? names.length > 1
            ? `${String(item.minuteSlot).padStart(2, '0')} ${names[0] ?? ''}외${names.length - 1}`
            : `${String(item.minuteSlot).padStart(2, '0')} ${names[0] ?? ''}`
          : `${String(item.minuteSlot).padStart(2, '0')} ${names[0] ?? '-'}`
      );

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
    if (item.rows.some(row => /^\[정기(수업|그룹):/.test(row.note ?? ''))) {
      setMessage('정기수업의 시간·요일 변경은 관리자 정기수업 화면에서 적용일을 지정해 주세요. 특정 회차만 취소하려면 취소 버튼을 이용하세요.')
      return
    }
    setEditingCell({
      date: item.date,
      hour: item.hourSlot,
    })

    const isTimeMakeup = isTimeMakeupScheduleNote(item.note) || item.voucherType === '시간보강'
    const isDayMakeup = !isTimeMakeup && isMakeupScheduleNote(item.note)
    setScheduleMemo(stripMakeupTags(item.note))
    setIsMakeupSchedule(isTimeMakeup || isDayMakeup)
    setScheduleMakeupType(isTimeMakeup ? 'time' : isDayMakeup ? 'day' : 'none')
    setScheduleTimeMakeupMinutes(parseTimeMakeupMinutes(item.note) || '10')
    setMakeupAbsentDate(parseMakeupAbsentDate(item.note))

    if (item.isGroup) {
      setIsGroupLesson(true)
      setEditingGroupId(item.groupId)
      setEditingEntryId(null)
      setSelectedGroupChildIds(item.rows.map((row) => Number(row.child_id)))
      setGroupName(item.groupName || '')
      setSelectedMinute(String(item.minuteSlot).padStart(2, '0'))
      setScheduleChildId('')
      setSelectedVoucher('')
      setIsMakeupSchedule(false)
      setScheduleMakeupType('none')
      setScheduleTimeMakeupMinutes('10')
      setMakeupAbsentDate('')
      setGroupSearch('')
    } else {
      const row = item.rows[0]
      if (!row) return
      setIsGroupLesson(false)
      setEditingGroupId(null)
      setEditingEntryId(row.id)
      setScheduleChildId(row.child_id ? Number(row.child_id) : '')
      setSelectedMinute(String(row.minute_slot ?? 0).padStart(2, '0'))
      setSelectedVoucher(row.voucher_type === '시간보강' ? '' : row.voucher_type ?? '')
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

  async function loadMakeupSchedules(staffId: number) {
    const { data, error } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('teacher_id', staffId)
      .eq('is_active', true)
      .eq('is_group', false)
      .order('date', { ascending: false })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })

    if (error) throw error
    setMakeupScheduleRows(((data ?? []) as ScheduleEntryRow[]).filter((row) => isMakeupScheduleNote(row.note) || isTimeMakeupScheduleRow(row)))
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


  async function loadChildInfoLogs(childId: number, monthKey: string) {
    const { start, end } = getMonthStartEndFromKey(monthKey)

    const [monthlyResult, allLogResult, scheduleResult, timeMakeupResult] = await Promise.all([
      supabase
        .from('class_logs')
        .select('*')
        .eq('child_id', childId)
        .gte('class_date', start)
        .lte('class_date', end)
        .order('class_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('class_logs')
        .select('*')
        .eq('child_id', childId)
        .order('class_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('schedule_entries')
        .select('*')
        .eq('child_id', childId)
        .eq('is_active', true)
        .eq('is_group', false)
        .order('date', { ascending: true })
        .order('time_slot', { ascending: true })
        .order('minute_slot', { ascending: true }),
      supabase
        .from('makeup_time_logs')
        .select('*')
        .eq('child_id', childId)
        .order('makeup_date', { ascending: true }),
    ])

    if (monthlyResult.error) throw monthlyResult.error
    if (allLogResult.error) throw allLogResult.error
    if (scheduleResult.error) throw scheduleResult.error
    if (timeMakeupResult.error) {
      setChildInfoMakeupTimeLogs([])
    } else {
      setChildInfoMakeupTimeLogs((timeMakeupResult.data ?? []) as MakeupTimeLogRow[])
    }

    setChildMonthlyLogRows((monthlyResult.data ?? []) as ClassLogRow[])
    setChildAllAbsentLogRows((allLogResult.data ?? []) as ClassLogRow[])
    setChildAllMakeupScheduleRows((scheduleResult.data ?? []) as ScheduleEntryRow[])
  }

  async function loadMakeupAbsentCandidates(childId: number) {
    const [allLogResult, scheduleResult, timeMakeupResult] = await Promise.all([
      supabase
        .from('class_logs')
        .select('*')
        .eq('child_id', childId)
        .order('class_date', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('schedule_entries')
        .select('*')
        .eq('child_id', childId)
        .eq('is_active', true)
        .eq('is_group', false),
      supabase
        .from('makeup_time_logs')
        .select('*')
        .eq('child_id', childId)
        .order('makeup_date', { ascending: true }),
    ])

    if (allLogResult.error) throw allLogResult.error
    if (scheduleResult.error) throw scheduleResult.error
    if (timeMakeupResult.error) {
      setScheduleChildMakeupTimeLogs([])
    } else {
      setScheduleChildMakeupTimeLogs((timeMakeupResult.data ?? []) as MakeupTimeLogRow[])
    }

    setMakeupAbsentCandidateLogs((allLogResult.data ?? []) as ClassLogRow[])
    setMakeupAbsentCandidateSchedules((scheduleResult.data ?? []) as ScheduleEntryRow[])
  }

  async function loadAll(staffId: number) {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([loadStaffs(staffId), loadChildren(), loadSchedules(staffId), loadMakeupSchedules(staffId), loadClassLogs(staffId)])
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
    Promise.all([loadSchedules(user.id), loadMakeupSchedules(user.id), loadClassLogs(user.id)]).catch((err: any) =>
      setMessage(err?.message ?? '주간 데이터 불러오기 실패')
    )
  }, [weekRange.start, weekRange.end, selectedTodayDate, user?.id])

  useEffect(() => {
    const childId = childInfoModal.child?.id
    if (!childInfoModal.open || !childId) return
    loadChildInfoLogs(Number(childId), childInfoMonth).catch((err: any) =>
      setMessage(err?.message ?? '아이 출결 불러오기 실패')
    )
  }, [childInfoModal.open, childInfoModal.child?.id, childInfoMonth])

  useEffect(() => {
    if (!scheduleChildId) {
      setMakeupAbsentCandidateLogs([])
      setMakeupAbsentCandidateSchedules([])
      setScheduleChildMakeupTimeLogs([])
      return
    }

    loadMakeupAbsentCandidates(Number(scheduleChildId)).catch((err: any) =>
      setMessage(err?.message ?? '미보강 결석일 불러오기 실패')
    )
  }, [scheduleChildId])

  function openChildInfoModal(child: ChildRow) {
    setChildInfoMonth(getCurrentMonthKey())
    setChildInfoModal({ open: true, child })
  }

  function renderMakeupScheduleFields(inputClassName: string) {
    return (
      <div className="space-y-1 rounded border border-orange-200 bg-orange-50 px-2 py-2 text-xs">
        <div className="text-[11px] font-semibold text-orange-700">보강유형</div>
        <select
          value={scheduleMakeupType}
          onChange={(e) => {
            const nextType = e.target.value as ScheduleMakeupType
            setScheduleMakeupType(nextType)
            setIsMakeupSchedule(nextType !== 'none')
            setMakeupAbsentDate('')
            setScheduleTimeMakeupMinutes('10')
            if (nextType === 'time') {
              setSelectedVoucher((prev) => prev || '일반')
            }
          }}
          className={inputClassName}
        >
          <option value="none">일반</option>
          <option value="day">일보강</option>
          <option value="time">시간보강</option>
        </select>

        {scheduleMakeupType !== 'none' && scheduleChildId ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-orange-700">결석날짜 선택</div>
            <select
              value={makeupAbsentSelection}
              onChange={(e) => setMakeupAbsentDate(e.target.value)}
              className={inputClassName}
            >
              <option value="">결석날짜 선택</option>
              {scheduleMakeupAbsentProgressItems.map(row=>(<option key={row.absent_log_id} value={row.absent_date+'|'+row.absent_log_id}>{row.absent_date} {row.teacher_name} · 사용 {row.used_count}번 / 남음 {row.remaining_minutes}분{row.ambiguous?' (기존 연결 확인 필요)':''}</option>))}
            </select>
            {makeupAbsentDateOptions.length === 0 ? (
              <div className="text-[11px] text-orange-600">
                선택 가능한 미보강 결석일이 없습니다.
              </div>
            ) : null}
          </div>
        ) : null}

        {scheduleMakeupType === 'time' && scheduleChildId ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-orange-700">보강시간 (보강 1회 = {MAKEUP_REQUIRED_MINUTES}분)</div>
            <select
              value={scheduleTimeMakeupMinutes}
              onChange={(e) => setScheduleTimeMakeupMinutes(e.target.value)}
              className={inputClassName}
              disabled={scheduleAvailableTimeMakeupMinutes.length === 0}
            >
              {scheduleAvailableTimeMakeupMinutes.length === 0 ? (
                <option value="">남은 보강시간 없음</option>
              ) : (
                scheduleAvailableTimeMakeupMinutes.map((minute) => (
                  <option key={minute} value={String(minute)}>
                    {minute}분
                  </option>
                ))
              )}
            </select>
            {selectedScheduleMakeupProgress ? (
              <div className="text-[11px] text-orange-700">
                {selectedScheduleMakeupProgress.teacher_name ? `담당 ${selectedScheduleMakeupProgress.teacher_name} / ` : ''}진행 {selectedScheduleMakeupProgress.completed_minutes}/{selectedScheduleMakeupProgress.required_minutes}분 / 남음 {selectedScheduleMakeupProgress.remaining_minutes}분
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  function resetNewScheduleState() {
    setEditingEntryId(null)
    setEditingGroupId(null)
    setScheduleChildId('')
    setSelectedMinute('00')
    setSelectedVoucher('')
    setScheduleMemo('')
    setIsMakeupSchedule(false)
    setScheduleMakeupType('none')
    setScheduleTimeMakeupMinutes('10')
    setMakeupAbsentDate('')
    setIsGroupLesson(false)
    setGroupName('')
    setSelectedGroupChildIds([])
    setGroupSearch('')
  }

  async function handleLogout() {
    localStorage.removeItem('staff_id')
    localStorage.removeItem('staff_name')
    localStorage.removeItem('staff_role')
    window.location.href = '/'
  }

  async function handleSaveSchedule(dateStr:string,hourSlot:string) {
 try {
  if(!user)return; const staffId=Number(user.id)
  const replaceRows=editingGroupId ? scheduleRows.filter(row=>row.is_active && row.group_id===editingGroupId && row.date===dateStr && row.time_slot===hourSlot && Number(row.teacher_id)===staffId) : scheduleRows.filter(row=>row.id===editingEntryId)
  if(replaceRows.some(row=>/^\[정기(수업|그룹):/.test(row.note??''))){throw new Error('정기수업 변경은 정기수업 관리에서 적용일을 지정하세요.')}
  
  const minute=Number(selectedMinute)
  if(!Number.isInteger(minute)||minute<0||minute>50||minute%10!==0)throw new Error('시작 분을 확인하세요.')
  let note=buildScheduleNote(scheduleMemo,scheduleMakeupType==='day',makeupAbsentDate,'',makeupAbsentLogId)
  let absentLogId:number|null=null
  if(scheduleMakeupType!=='none'){
   if(isGroupLesson)throw new Error('보강은 원래 결석한 개인 수업을 선택해 등록하세요.')
   const progress=scheduleMakeupAbsentProgressItems.find(row=>row.absent_log_id===makeupAbsentLogId)
   if(!progress)throw new Error('보강할 결석 수업을 다시 선택하세요.')
   if(progress.ambiguous)throw new Error('기존 보강의 결석 연결을 먼저 확인하세요.')
   const minutes=scheduleMakeupType==='day'?MAKEUP_REQUIRED_MINUTES:Number(scheduleTimeMakeupMinutes)
   if(!Number.isInteger(minutes)||minutes<=0||minutes>MAKEUP_REQUIRED_MINUTES||minutes>progress.remaining_minutes-(progress.reserved_minutes??0))throw new Error('예약 가능한 보강 시간을 초과했습니다.')
   absentLogId=makeupAbsentLogId
   if(scheduleMakeupType==='time')note=['[시간보강:'+minutes+'분]','[결석일:'+makeupAbsentDate+']','[결석기록:'+makeupAbsentLogId+']',stripMakeupTags(scheduleMemo)].filter(Boolean).join(' ')
  }
  const childIds=isGroupLesson?Array.from(new Set(selectedGroupChildIds.map(Number))):[Number(scheduleChildId)]
  if(!childIds.length||childIds.length>8||childIds.some(id=>!id))throw new Error('학생을 선택하세요. 그룹은 최대 8명입니다.')
  if(!isGroupLesson&&!selectedVoucher&&scheduleMakeupType!=='time')throw new Error('바우처를 선택하세요.')
  const groupId=isGroupLesson?(editingGroupId||crypto.randomUUID()):null
  const rows=childIds.map(childId=>({date:dateStr,time_slot:hourSlot,minute_slot:minute,room_number:1,teacher_id:staffId,child_id:childId,
   voucher_type:isGroupLesson?'그룹수업':scheduleMakeupType==='time'?'시간보강':selectedVoucher,
   status:scheduleMakeupType==='day'?'makeup':'scheduled',note,is_active:true,is_group:isGroupLesson,group_id:groupId,group_name:isGroupLesson?(groupName||'그룹수업'):null,absent_class_log_id:absentLogId}))
  await saveScheduleRows(rows,replaceRows.map(row=>row.id))
  await Promise.all([loadSchedules(user.id),loadMakeupSchedules(user.id),loadClassLogs(user.id)]); if(scheduleChildId) await loadMakeupAbsentCandidates(Number(scheduleChildId))
  resetScheduleEditor()
  setMessage('일정이 저장되었습니다. 보강은 출결 완료 시 차감됩니다.')
 }catch(err:any){setMessage(err.message||'일정 저장 실패')}
}

  

  async function deleteScheduleRowOnly(row: ScheduleEntryRow) { await cancelOccurrences([row.id]) }

  async function handleDeleteSchedule(item: DisplayScheduleItem) {
    try {
      if (!user) return
      const targetRow = item.rows[0]
      if (!targetRow) return

      const ok = window.confirm(
        item.isGroup
          ? '이 그룹수업의 선택된 학생 일정 1건만 취소할까요? 출결 기록이 있으면 취소되지 않습니다.'
          : '이 일정 1건만 취소할까요? 출결 기록이 있으면 취소되지 않습니다.'
      )
      if (!ok) return

      await deleteScheduleRowOnly(targetRow)

      await Promise.all([loadSchedules(user.id), loadMakeupSchedules(user.id), loadClassLogs(user.id)])
      setMessage('선택한 일정 1건을 취소했습니다. 출결 이력은 보존됩니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  async function handleDeleteScheduleRow(row: ScheduleEntryRow) {
    try {
      if (!user) return
      const child = children.find((c) => Number(c.id) === Number(row.child_id))
      const ok = window.confirm(
        `${row.date} ${row.time_slot.slice(0, 2)}:${String(row.minute_slot ?? 0).padStart(2, '0')} ${child?.child_name ?? '학생'} 일정 1건만 취소할까요? 출결 기록이 있으면 취소되지 않습니다.`
      )
      if (!ok) return

      await deleteScheduleRowOnly(row)

      await Promise.all([loadSchedules(user.id), loadMakeupSchedules(user.id), loadClassLogs(user.id)])
      setMessage('선택한 일정 1건을 취소했습니다. 출결 이력은 보존됩니다.')
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
    setRecordMakeupDate('')
    setRecordMakeupHour(entry.time_slot || '09:00')
    setRecordMakeupMinute(String(entry.minute_slot ?? 0).padStart(2, '0'))
  }

  async function handleSaveRecordStatus(){
 try{
  const entry=recordModal.entry;if(!entry||!user)return
  const makeup=recordMakeupDate?{date:recordMakeupDate,timeSlot:recordMakeupHour,minuteSlot:Number(recordMakeupMinute)}:null
  await recordAttendance([entry.id],recordModal.status,makeup)
  await Promise.all([loadSchedules(user.id),loadClassLogs(user.id),loadMakeupSchedules(user.id)])
  if(entry.child_id)await loadMakeupAbsentCandidates(Number(entry.child_id))
  if(childInfoModal.open&&childInfoModal.child)await loadChildInfoLogs(Number(childInfoModal.child.id),childInfoMonth)
  setRecordModal({open:false,entry:null,status:'attended'});setRecordMakeupDate('');setMessage('출결과 보강 예약이 저장되었습니다.')
 }catch(err:any){setMessage(err.message||'출결 저장 실패')}
}


  function getScheduleCardBgClass(item: DisplayScheduleItem, classLogs: ClassLogRow[]) {
    const relatedLogs = classLogs.filter((log) => {
      const minuteTotal = getLogMinuteTotal(log)
      if (minuteTotal == null) return false

      if (item.isGroup) {
        return item.rows.some((row) => {
          const rowMinute = getEntryMinuteTotal(row)
          return (
            log.class_date === row.date &&
            Number(log.staff_id) === Number(row.teacher_id) &&
            Number(log.child_id) === Number(row.child_id) &&
            minuteTotal === rowMinute &&
            Boolean(log.is_group) &&
            (log.group_id ?? '') === (row.group_id ?? '')
          )
        })
      }

      const row = item.rows[0]
      if (!row) return false

      return (
        log.class_date === row.date &&
        Number(log.staff_id) === Number(row.teacher_id) &&
        Number(log.child_id) === Number(row.child_id) &&
        minuteTotal === getEntryMinuteTotal(row) &&
        !log.is_group
      )
    })

    if (relatedLogs.some((log) => log.status === 'attended' || log.status === 'makeup')) {
      return 'bg-blue-50'
    }

    if (relatedLogs.some((log) => log.status === 'same_day_absent' || log.status === 'absent')) {
      return 'bg-red-50'
    }

    if (isMakeupScheduleNote(item.note) || isTimeMakeupScheduleNote(item.note)) {
      return 'bg-orange-50'
    }

    return 'bg-white'
  }

  function renderScheduleCard(item: DisplayScheduleItem, dateStr: string) {
    const firstChild = children.find((c) => c.id === Number(item.rows[0]?.child_id))
    const title = getScheduleItemCompactTitle(item, children)

    const isEditing =
      editingCell?.date === dateStr &&
      editingCell?.hour === item.hourSlot &&
      (editingEntryId === item.rows[0]?.id || editingGroupId === item.groupId)

    return (
      <div
        key={item.key}
        className={`rounded-lg border px-1.5 py-1.5 text-[10px] shadow-sm transition ${isMakeupScheduleNote(item.note) || isTimeMakeupScheduleNote(item.note) ? 'border-orange-300 ring-1 ring-orange-100' : 'border-slate-200'} ${getScheduleCardBgClass(item, classLogRows)}`}
      >
        {isEditing ? (
          <div className="space-y-2">
            <label className="flex items-center gap-0 text-xs">
              <input
                type="checkbox"
                checked={isGroupLesson}
                onChange={(e) => {
                  setIsGroupLesson(e.target.checked)
                  setSelectedVoucher('')
                  setScheduleChildId('')
                  setSelectedGroupChildIds([])
                  setIsMakeupSchedule(false)
                  setScheduleMakeupType('none')
                  setScheduleTimeMakeupMinutes('10')
                  setMakeupAbsentDate('')
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
                  className="w-full rounded border bg-white px-[2px] py-1 text-xs"
                />
                <input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="학생 이름 검색"
                  className="w-full rounded border bg-white px-[2px] py-1 text-xs"
                />
                <div className="rounded border bg-white p-2">
                  <div className="mb-2 text-[11px] text-slate-500">
                    학생 선택 ({selectedGroupChildIds.length}/8)
                  </div>
                  <div className="grid max-h-40 grid-cols-1 gap-0 overflow-y-auto">
                    {filteredGroupChildren.map((c) => {
                      const active = selectedGroupChildIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleGroupChild(c.id)}
                          className={`rounded px-[2px] py-1 text-left text-[11px] ${
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
                {renderMakeupScheduleFields('w-full rounded border bg-white px-[2px] py-1 text-xs')}

                <select
                  value={scheduleChildId}
                  onChange={(e) => {
                    setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                    setMakeupAbsentDate('')
                  }}
                  className="w-full rounded border bg-white px-[2px] py-1 text-xs"
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
                  className="w-full rounded border bg-white px-[2px] py-1 text-xs"
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
              className="w-full rounded border bg-white px-[2px] py-1 text-xs"
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
              className="w-full rounded border bg-white px-[2px] py-1 text-xs"
            />

            <div className="flex gap-0">
              <button
                onClick={() => handleSaveSchedule(dateStr, item.hourSlot)}
                className="flex-1 rounded bg-indigo-600 px-[2px] py-1 text-xs text-white"
              >
                저장
              </button>
              <button
                onClick={resetScheduleEditor}
                className="flex-1 rounded bg-slate-300 px-[2px] py-1 text-xs"
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
              <div className="truncate font-semibold leading-tight text-slate-800" title={title}>{title}</div>
            </button>

            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${getVoucherClass(item.voucherType)}`}>
                {item.voucherType || '일반'}
              </span>
              {item.isGroup ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-[2px] py-0.5 text-[11px] text-rose-700">
                  그룹
                </span>
              ) : null}
              {isTimeMakeupScheduleNote(item.note) ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-[2px] py-0.5 text-[11px] font-semibold text-amber-700">
                  시간보강
                </span>
              ) : isMakeupScheduleNote(item.note) ? (
                <span className="rounded-full border border-orange-200 bg-orange-50 px-[2px] py-0.5 text-[11px] font-semibold text-orange-700">
                  일보강
                </span>
              ) : null}
            </div>

            {stripSystemScheduleTags(item.note) ? (
              <div className="mt-1 truncate rounded-md border border-slate-200 bg-white/70 px-1.5 py-0.5 text-[10px] leading-snug text-slate-600">
                <span title={stripSystemScheduleTags(item.note)}>메모: {compactScheduleName(stripSystemScheduleTags(item.note), 14)}</span>
              </div>
            ) : null}
            {(isMakeupScheduleNote(item.note) || isTimeMakeupScheduleNote(item.note)) && parseMakeupAbsentDate(item.note) ? (
              <div className="mt-0 text-[11px] font-semibold text-orange-700">
                결석일: {parseMakeupAbsentDate(item.note)}
                {parseMakeupTeacherName(item.note) ? ` / ${parseMakeupTeacherName(item.note)}` : ''}
                {parseTimeMakeupMinutes(item.note) ? ` / ${parseTimeMakeupMinutes(item.note)}분` : ''}
              </div>
            ) : null}

            {item.isGroup ? (
              <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                {item.rows.map((r) => {
                  const child = children.find((c) => c.id === Number(r.child_id))
                  const log = attendanceMap.get(getAttendanceKey(r))

                  return (
                    <div key={r.id} className="flex items-center gap-1 rounded bg-white/70 px-[2px] py-1">
                      <button
                        type="button"
                        onClick={() => openRecordModal(r)}
                        className="flex-1 text-left hover:bg-white"
                      >
                        {compactScheduleName(child?.child_name ?? `학생(${r.child_id})`, 8)}
                        {log?.status ? `(${getStatusLabel(log.status)})` : '(미입력)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteScheduleRow(r)}
                        className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700"
                      >
                        삭제
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1">
              {!item.isGroup && firstChild ? (
                <button
                  onClick={() => openChildInfoModal(firstChild)}
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                >
                  아이정보
                </button>
              ) : null}

              <button
                onClick={() => handleEditSchedule(item)}
                className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700"
              >
                수정
              </button>

              {!item.isGroup ? (
                <button
                  onClick={() => handleDeleteSchedule(item)}
                  className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700"
                >
                  삭제
                </button>
              ) : null}
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
                    <label className="flex items-center gap-0 text-xs">
                      <input
                        type="checkbox"
                        checked={isGroupLesson}
                        onChange={(e) => {
                          setIsGroupLesson(e.target.checked)
                          setSelectedVoucher('')
                          setScheduleChildId('')
                          setSelectedGroupChildIds([])
                          setIsMakeupSchedule(false)
                          setScheduleMakeupType('none')
                          setScheduleTimeMakeupMinutes('10')
                          setMakeupAbsentDate('')
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
                          className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                        />
                        <input
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder="학생 이름 검색"
                          className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                        />
                        <div className="grid max-h-40 grid-cols-1 gap-0 overflow-y-auto rounded border p-2">
                          {filteredGroupChildren.map((c) => {
                            const active = selectedGroupChildIds.includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleGroupChild(c.id)}
                                className={`rounded px-[2px] py-2 text-left text-sm ${
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
                        {renderMakeupScheduleFields('w-full rounded border bg-white px-[2px] py-2 text-sm')}

                        <select
                          value={scheduleChildId}
                          onChange={(e) => {
                            setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                            setMakeupAbsentDate('')
                          }}
                          className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                          className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                    />

                    <div className="flex gap-0">
                      <button
                        onClick={() => handleSaveSchedule(dateStr, hourSlot)}
                        className="flex-1 rounded bg-indigo-600 px-[2px] py-2 text-sm text-white"
                      >
                        저장
                      </button>
                      <button
                        onClick={resetScheduleEditor}
                        className="flex-1 rounded bg-slate-300 px-[2px] py-2 text-sm"
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
                        resetNewScheduleState()
                      }}
                      className="mb-2 w-full rounded-xl border border-dashed border-slate-300 px-[2px] py-3 text-left text-sm text-slate-500"
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

    const displayMemo = stripSystemScheduleTags(row.note)

    return (
      <div key={row.id} className={`rounded-2xl border p-4 shadow-sm transition ${getTodayCardBgClass(status, row.note)}`}>
        <div className="flex items-start justify-between gap-0">
          <div>
            <div className="font-semibold">{timeText}</div>
            <div className="text-sm text-slate-700">
              {row.is_group ? row.group_name || '그룹수업' : child?.child_name ?? '이름없음'}
            </div>
            {row.is_group ? (
              <div className="mt-0 text-xs text-slate-500">
                학생: {groupChildren.length > 0 ? groupChildren.join(', ') : '이름없음'}
              </div>
            ) : child ? (
              <div className="mt-0 text-xs text-slate-500">
                나이: {ageText || '-'}
              </div>
            ) : null}
          </div>
          {status ? (
            <span className={`rounded-full px-[2px] py-1 text-xs ${getStatusClass(status)}`}>
              {getStatusLabel(status)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-[2px] py-1 text-xs text-slate-600">
              미입력
            </span>
          )}
        </div>

        {displayMemo ? (
          <div className="mt-3 rounded-xl border border-white/70 bg-white/75 px-3 py-2 text-xs leading-relaxed text-slate-600">
            메모: {displayMemo}
          </div>
        ) : null}
        {isMakeupScheduleNote(row.note) || isTimeMakeupScheduleNote(row.note) ? (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
              {isTimeMakeupScheduleNote(row.note) ? '시간보강' : '일보강'}
            </span>
            {parseMakeupAbsentDate(row.note) ? (
              <span className="rounded-full border border-orange-200 bg-white px-2 py-1 text-xs text-orange-700">
                결석일: {parseMakeupAbsentDate(row.note)}
                {parseMakeupTeacherName(row.note) ? ` / ${parseMakeupTeacherName(row.note)}` : ''}
                {parseTimeMakeupMinutes(row.note) ? ` / ${parseTimeMakeupMinutes(row.note)}분` : ''}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => openRecordModal(row)}
            className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
          >
            상태입력
          </button>
          {!row.is_group && child ? (
            <button
              type="button"
              onClick={() => openChildInfoModal(child)}
              className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
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
        <div className="mb-4 flex items-start justify-between gap-0">
          <div>
            <h1 className="text-xl font-bold">직원 화면</h1>
            <p className="mt-0 text-sm text-slate-500">
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
            className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition ${tab === 'today' ? 'bg-black text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            오늘보기
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition ${tab === 'schedule' ? 'bg-black text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            일정추가
          </button>
          <button
            onClick={() => setTab('week_overview')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition ${tab === 'week_overview' ? 'bg-black text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            주간보기
          </button>

          <div className="relative">
            <input
              value={studentInfoSearch}
              onChange={(e) => setStudentInfoSearch(e.target.value)}
              placeholder="학생정보 확인"
              className="w-[180px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm"
            />
            {studentInfoSearch.trim() ? (
              <div className="absolute left-0 top-12 z-50 w-[220px] rounded-xl border bg-white p-2 shadow-xl">
                {filteredStudentInfoChildren.length === 0 ? (
                  <div className="p-2 text-sm text-slate-500">검색 결과 없음</div>
                ) : (
                  filteredStudentInfoChildren.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        openChildInfoModal(child)
                        setStudentInfoSearch('')
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      {getDisplayName(child)}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {tab === 'today' ? (
          <div>
            <div className="mb-4 flex flex-col gap-0 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-bold">오늘보기 / 날짜선택</h2>
              <input
                type="date"
                value={selectedTodayDate}
                onChange={(e) => setSelectedTodayDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-[2px] py-2 text-sm"
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
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-bold">일간</h2>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={toDateString(weekBaseDate)}
                  onChange={(e) => {
                    if (!e.target.value) return
                    setWeekBaseDate(new Date(`${e.target.value}T00:00:00`))
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />

                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() - 1)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2"
                >
                  ◀
                </button>

                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() + 1)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="hidden max-w-3xl md:block">
              <table className="w-full table-fixed overflow-hidden rounded-2xl border text-[11px] shadow-sm">
                <thead>
                  <tr>
                    <th className="w-[52px] border bg-slate-100 px-1 py-2">시간</th>
                    <th className="border bg-slate-100 px-[2px] py-2">
                      <div className="text-sm font-semibold">
                        {['일', '월', '화', '수', '목', '금', '토'][weekBaseDate.getDay()]} {toShortMonthDay(weekBaseDate)}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hourSlot) => (
                    <tr key={hourSlot}>
                      <td className="whitespace-nowrap border bg-slate-50 px-1 py-1.5 text-center font-medium">
                        {getHourLabel(hourSlot)}
                      </td>

                      {(() => {
                        const dateStr = toDateString(weekBaseDate)
                        const items = buildDisplayItems(dateStr, hourSlot)
                        const isEditing =
                          editingCell?.date === dateStr && editingCell?.hour === hourSlot

                        return (
                          <td
                            key={`${dateStr}-${hourSlot}`}
                            className="border bg-white/80 px-1 py-1.5 align-top"
                          >
                            {isEditing ? (
                              <div className="min-h-[88px] space-y-2">
                                <label className="flex items-center gap-0 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={isGroupLesson}
                                    onChange={(e) => {
                                      setIsGroupLesson(e.target.checked)
                                      setSelectedVoucher('')
                                      setScheduleChildId('')
                                      setSelectedGroupChildIds([])
                                      setIsMakeupSchedule(false)
                                      setScheduleMakeupType('none')
                                      setScheduleTimeMakeupMinutes('10')
                                      setMakeupAbsentDate('')
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
                                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                                    />
                                    <input
                                      value={groupSearch}
                                      onChange={(e) => setGroupSearch(e.target.value)}
                                      placeholder="학생 이름 검색"
                                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                                    />
                                    <div className="grid max-h-40 grid-cols-1 gap-0 overflow-y-auto rounded border p-2">
                                      {filteredGroupChildren.map((c) => {
                                        const active = selectedGroupChildIds.includes(c.id)
                                        return (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleGroupChild(c.id)}
                                            className={`rounded px-[2px] py-2 text-left text-sm ${
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
                                    {renderMakeupScheduleFields('w-full rounded border bg-white px-[2px] py-2 text-sm')}

                                    <select
                                      value={scheduleChildId}
                                      onChange={(e) => {
                                        setScheduleChildId(e.target.value ? Number(e.target.value) : '')
                                        setMakeupAbsentDate('')
                                      }}
                                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                                      className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                                  className="w-full rounded border bg-white px-[2px] py-2 text-sm"
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
                                  className="w-full rounded border bg-white px-[2px] py-2 text-sm"
                                />

                                <div className="flex gap-0">
                                  <button
                                    onClick={() => handleSaveSchedule(dateStr, hourSlot)}
                                    className="flex-1 rounded bg-indigo-600 px-[2px] py-2 text-white"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={resetScheduleEditor}
                                    className="flex-1 rounded bg-slate-300 px-[2px] py-2"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCell({ date: dateStr, hour: hourSlot })
                        resetNewScheduleState()
                                  }}
                                  className="min-h-[28px] w-full rounded border border-dashed border-slate-300 p-1 text-center text-[10px] text-slate-500 hover:bg-slate-100"
                                >
                                  + 추가
                                </button>

                                {items.length === 0 ? null : items.map((item) => renderScheduleCard(item, dateStr))}
                              </div>
                            )}
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 md:hidden">
              {renderMobileDayCard(weekBaseDate)}
            </div>
          </div>
        ) : null}

        {tab === 'week_overview' ? (
          <div className="mt-0 border-t-0 pt-0">
            <div className="mb-3 flex flex-col gap-0 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-0">
                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() - 7)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-[2px] py-2"
                >
                  ◀
                </button>

                <button
                  onClick={() => {
                    const d = new Date(weekBaseDate)
                    d.setDate(d.getDate() + 7)
                    setWeekBaseDate(d)
                  }}
                  className="rounded-lg bg-slate-200 px-[2px] py-2"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="min-w-[420px] table-fixed border-collapse text-[9px] md:min-w-full md:text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-[30px] border-b border-r bg-slate-100 px-[2px] py-2 text-center font-semibold">
                      시간
                    </th>
                    {weekDates.map((date, idx) => (
                      <th
                        key={idx}
                        className="w-[44px] border-b border-r bg-slate-100 px-[2px] py-2 text-center font-semibold"
                      >
                        <div>{['월', '화', '수', '목', '금', '토'][idx]}</div>
                        <div className="text-[9px] text-slate-500 md:text-xs">{toShortMonthDay(date)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hourSlot) => (
                    <tr key={`overview-${hourSlot}`}>
                      <td className="sticky left-0 z-10 border-b border-r bg-slate-50 px-[2px] py-2 text-center font-medium">
                        {getHourLabel(hourSlot)}
                      </td>

                      {weekDates.map((date) => {
                        const dateStr = toDateString(date)
                        const compactItems = buildCompactWeekItems(dateStr, hourSlot)

                        return (
                          <td
                            key={`overview-${dateStr}-${hourSlot}`}
                            className="align-top border-b border-r px-[2px] py-1"
                          >
                            {compactItems.length === 0 ? (
                              <div className="min-h-[42px] text-[9px] text-slate-300">-</div>
                            ) : (
                              <div className="space-y-1.5">
                                {compactItems.map((item) => (
                                  <div
                                    key={item.key}
                                    className={`rounded-md bg-slate-50 px-1.5 py-1 leading-tight ${item.colorClass}`}
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
          </div>
        ) : null}

        {recordModal.open && recordModal.entry ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-bold">수업 상태 선택</h3>

              {(() => {
                const recordChild = children.find(
                  (child) => Number(child.id) === Number(recordModal.entry?.child_id)
                )
                const recordName = recordChild
                  ? getDisplayName(recordChild)
                  : recordModal.entry?.child_id
                    ? `학생(${recordModal.entry.child_id})`
                    : '이름없음'

                return (
                  <div className="mb-3 rounded-xl border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">{recordName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {recordModal.entry.date} / {recordModal.entry.time_slot.slice(0, 2)}:
                      {String(recordModal.entry.minute_slot ?? 0).padStart(2, '0')}
                    </div>
                  </div>
                )
              })()}

              <select
                value={recordModal.status}
                onChange={(e) =>
                  setRecordModal((prev) => ({
                    ...prev,
                    status: e.target.value as AttendanceStatus,
                  }))
                }
                className="mb-4 w-full rounded-xl border px-[2px] py-3 md:py-2"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>

              {recordModal.status === 'absent' ? (
                <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <div className="mb-2 text-sm font-bold text-orange-700">보강 일정 입력</div>
                  <div className="mb-2 text-xs text-orange-700">선택하지 않으면 없음으로 저장됩니다.</div>
                  <input
                    type="date"
                    value={recordMakeupDate}
                    onChange={(e) => setRecordMakeupDate(e.target.value)}
                    className="mb-2 w-full rounded-xl border bg-white px-[2px] py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={recordMakeupHour}
                      onChange={(e) => setRecordMakeupHour(e.target.value)}
                      className="rounded-xl border bg-white px-[2px] py-2 text-sm"
                    >
                      {hourSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                    <select
                      value={recordMakeupMinute}
                      onChange={(e) => setRecordMakeupMinute(e.target.value)}
                      className="rounded-xl border bg-white px-[2px] py-2 text-sm"
                    >
                      {getMinutesOptions().map((m) => (
                        <option key={m} value={m}>
                          {m}분
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-0">
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
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">월별 출결</div>
                    <input
                      type="month"
                      value={childInfoMonth}
                      onChange={(e) => setChildInfoMonth(e.target.value || getCurrentMonthKey())}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <div><span className="font-medium">출석:</span> {childInfoDates.attended || '-'}</div>
                  <div><span className="font-medium">보강:</span> {childInfoDates.makeup || '-'}</div>
                  <div><span className="font-medium">결석/보강:</span> {childInfoDates.absent || '-'}</div>
                  <div><span className="font-medium">그룹출석/보강:</span> {childInfoDates.groupAttended || '-'}</div>
                  <div><span className="font-medium">그룹결석:</span> {childInfoDates.groupAbsent || '-'}</div>
                  <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                    <span className="font-semibold text-rose-700">미보강결석:</span>{' '}
                    <span className="text-rose-700">{childInfoDates.unrecoveredAbsent || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-0">
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
