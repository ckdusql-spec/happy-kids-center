'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminDailySchedule from '@/components/AdminDailySchedule'

type MainTab = 'schedule' | 'children' | 'staff' | 'summary'
type ViewMode = 'all' | 'staff' | 'daily'
type StaffRole = 'admin' | 'employee'

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
  chart_no: string | null
  child_name: string
  birth_date: string | null
  phone: string | null
  vouchers: string[] | null
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
  created_at?: string | null
  updated_at?: string | null
}

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
}

type SummaryRow = {
  child_id: number
  child_name: string
  age_text: string
  voucher_label: string
  attended_count: number
  absent_count: number
  same_day_absent_count: number
  makeup_count: number
  used_count: number
}

type ChildForm = {
  id: number | null
  chartNo: string
  childName: string
  birthDate: string
  phone: string
  voucherTypes: string[]
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

const VOUCHER_OPTIONS = ['디딤', '아청심', '드림스타트', '배움', '일반']

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

function getHourLabel(hourSlot: string) {
  return hourSlot
}

function getMinutesOptions() {
  return ['00', '10', '20', '30', '40', '50']
}

function getAgeText(birthDate: string | null) {
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

function getVoucherChipClass(voucher: string) {
  if (voucher.includes('디딤')) return 'bg-blue-50 text-blue-700'
  if (voucher.includes('아청심')) return 'bg-indigo-50 text-indigo-700'
  if (voucher.includes('드림스타트')) return 'bg-emerald-50 text-emerald-700'
  if (voucher.includes('배움')) return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-700'
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

export default function AdminPage() {
  const [tab, setTab] = useState<MainTab>('schedule')
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [csvMonth, setCsvMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [children, setChildren] = useState<ChildRow[]>([])
  const [allScheduleEntries, setAllScheduleEntries] = useState<ScheduleEntryRow[]>([])
  const [classLogs, setClassLogs] = useState<ClassLogRow[]>([])

  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  const [scheduleChildId, setScheduleChildId] = useState<number | ''>('')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [selectedVoucher, setSelectedVoucher] = useState('')

  const [childForm, setChildForm] = useState<ChildForm>({
    id: null,
    chartNo: '',
    childName: '',
    birthDate: '',
    phone: '',
    voucherTypes: [],
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
    const start = toDateString(weekDates[0])
    const end = toDateString(weekDates[weekDates.length - 1])

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

  async function loadAll() {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([loadStaffs(), loadChildren(), loadSchedules(), loadClassLogsForMonth()])
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
  }, [weekBaseDate])

  useEffect(() => {
    loadClassLogsForMonth().catch((err: any) => setMessage(err?.message ?? '월정산 불러오기 실패'))
  }, [csvMonth])

  function getScheduleEntries(dateStr: string, hourSlot: string, staffId: number) {
    return allScheduleEntries.filter(
      (entry) =>
        entry.date === dateStr &&
        entry.time_slot === hourSlot &&
        Number(entry.teacher_id) === Number(staffId) &&
        entry.is_active
    )
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

      const payload = {
        chart_no: childForm.chartNo || null,
        child_name: childForm.childName,
        birth_date: childForm.birthDate || null,
        phone: childForm.phone || null,
        vouchers: childForm.voucherTypes,
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
        chartNo: '',
        childName: '',
        birthDate: '',
        phone: '',
        voucherTypes: [],
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

      if (staffForm.password.trim()) {
        payload.password = staffForm.password
      }

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
      if (!scheduleChildId) {
        setMessage('학생을 선택하세요.')
        return
      }

      if (!selectedVoucher) {
        setMessage('바우처를 선택하세요.')
        return
      }

      const staff = employeeStaffs.find((s) => Number(s.id) === Number(staffId))

      const { error } = await supabase.from('schedule_entries').insert({
        date: dateStr,
        time_slot: hourSlot,
        minute_slot: Number(selectedMinute),
        teacher_id: Number(staffId),
        teacher_name: staff?.name ?? '',
        child_id: Number(scheduleChildId),
        voucher_type: selectedVoucher,
        is_active: true,
      })

      if (error) throw error

      setEditingCell(null)
      setEditingEntryId(null)
      setScheduleChildId('')
      setSelectedMinute('00')
      setSelectedVoucher('')
      await loadSchedules()
      setMessage('시간표가 저장되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '시간표 저장 실패')
    }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      const ok = window.confirm('이 시간표를 삭제할까요?')
      if (!ok) return

      const { error } = await supabase
        .from('schedule_entries')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      await loadSchedules()
      setMessage('시간표가 삭제되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  function handleEditSchedule(entry: ScheduleEntryRow) {
    setEditingCell({
      date: entry.date,
      hour: entry.time_slot,
      staffId: Number(entry.teacher_id),
    })
    setEditingEntryId(entry.id)
    setScheduleChildId(entry.child_id ? Number(entry.child_id) : '')
    setSelectedMinute(String(entry.minute_slot ?? 0).padStart(2, '0'))
    setSelectedVoucher(entry.voucher_type ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleUpdateEditingSchedule(entry: ScheduleEntryRow) {
    try {
      if (!scheduleChildId) {
        setMessage('학생을 선택하세요.')
        return
      }
      if (!selectedVoucher) {
        setMessage('바우처를 선택하세요.')
        return
      }

      const { error } = await supabase
        .from('schedule_entries')
        .update({
          child_id: Number(scheduleChildId),
          minute_slot: Number(selectedMinute),
          voucher_type: selectedVoucher,
        })
        .eq('id', entry.id)

      if (error) throw error

      setEditingCell(null)
      setEditingEntryId(null)
      setScheduleChildId('')
      setSelectedMinute('00')
      setSelectedVoucher('')
      await loadSchedules()
      setMessage('시간표가 수정되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '수정 실패')
    }
  }

  function renderScheduleCard(entry: ScheduleEntryRow, dateStr: string, staffId: number) {
    const child = children.find((c) => c.id === Number(entry.child_id))
    const isEditing =
      editingEntryId === entry.id &&
      editingCell?.date === dateStr &&
      editingCell?.hour === entry.time_slot &&
      Number(editingCell?.staffId) === Number(staffId)

    return (
      <div key={entry.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm">
        {isEditing ? (
          <div className="space-y-1">
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

            <div className="flex gap-1">
              <button
                onClick={() => handleUpdateEditingSchedule(entry)}
                className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditingCell(null)
                  setEditingEntryId(null)
                  setScheduleChildId('')
                  setSelectedMinute('00')
                  setSelectedVoucher('')
                }}
                className="flex-1 rounded bg-slate-300 px-2 py-1 text-xs"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-medium text-slate-800">
              [{String(entry.minute_slot ?? 0).padStart(2, '0')}] {child?.child_name ?? `학생(${entry.child_id})`}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{entry.voucher_type ?? '-'}</div>
            <div className="mt-1 flex gap-1">
              <button
                onClick={() => handleEditSchedule(entry)}
                className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
              >
                수정
              </button>
              <button
                onClick={() => handleDeleteSchedule(entry.id)}
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

  function renderMobileDayCard(date: Date, staffId: number) {
    const dateStr = toDateString(date)
    const staff = employeeStaffs.find((s) => Number(s.id) === Number(staffId))

    return (
      <div key={`${dateStr}-${staffId}`} className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{toShortMonthDay(date)}</div>
            <div className="text-sm text-slate-500">{staff?.name}</div>
          </div>
        </div>

        <div className="space-y-3">
          {hourSlots.map((hourSlot) => {
            const entries = getScheduleEntries(dateStr, hourSlot, staffId)
            const isEditing =
              editingCell?.date === dateStr &&
              editingCell?.hour === hourSlot &&
              Number(editingCell?.staffId) === Number(staffId)

            return (
              <div key={`${dateStr}-${staffId}-${hourSlot}`} className="rounded-xl border p-3">
                <div className="mb-2 font-medium">{getHourLabel(hourSlot)}</div>

                {isEditing ? (
                  <div className="space-y-2">
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

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveSchedule(dateStr, hourSlot, staffId)}
                        className="flex-1 rounded bg-indigo-600 px-3 py-2 text-sm text-white"
                      >
                        추가
                      </button>
                      <button
                        onClick={() => {
                          setEditingCell(null)
                          setEditingEntryId(null)
                          setScheduleChildId('')
                          setSelectedMinute('00')
                          setSelectedVoucher('')
                        }}
                        className="flex-1 rounded bg-slate-300 px-3 py-2 text-sm"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCell({ date: dateStr, hour: hourSlot, staffId })
                        setEditingEntryId(null)
                        setScheduleChildId('')
                        setSelectedMinute('00')
                        setSelectedVoucher('')
                      }}
                      className="w-full rounded border border-dashed border-slate-300 px-2 py-2 text-left text-sm text-slate-500"
                    >
                      + 추가
                    </button>
                    {entries.map((entry) => renderScheduleCard(entry, dateStr, staffId))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const summaryRows = useMemo<SummaryRow[]>(() => {
    return children
      .filter((child) => child.is_active)
      .map((child) => {
        const rows = classLogs.filter((log) => Number(log.child_id) === Number(child.id))
        const attended = rows.filter((r) => r.status === 'attended').length
        const absent = rows.filter((r) => r.status === 'absent').length
        const sameDayAbsent = rows.filter((r) => r.status === 'same_day_absent').length
        const makeup = rows.filter((r) => r.status === 'makeup').length
        const usedCount = attended + makeup + sameDayAbsent

        return {
          child_id: child.id,
          child_name: child.child_name,
          age_text: getAgeText(child.birth_date),
          voucher_label: getVoucherLabel(child.vouchers),
          attended_count: attended,
          absent_count: absent,
          same_day_absent_count: sameDayAbsent,
          makeup_count: makeup,
          used_count: usedCount,
        }
      })
      .sort((a, b) => a.child_name.localeCompare(b.child_name, 'ko'))
  }, [children, classLogs])

  function downloadStudentCsv() {
    const monthRows = classLogs
      .filter((row) => row.class_date.startsWith(csvMonth))
      .map((row) => {
        const child = children.find((c) => c.id === row.child_id)
        const staff = staffs.find((s) => Number(s.id) === Number(row.staff_id))
        return [
          row.class_date,
          child?.child_name ?? row.child_id,
          getAgeText(child?.birth_date ?? null),
          staff?.name ?? row.staff_id,
          row.status,
        ]
      })

    downloadCsvFile(
      `학생CSV_${csvMonth}.csv`,
      ['날짜', '학생', '나이', '선생님', '상태'],
      monthRows
    )
  }

  function downloadStaffCsv() {
    const monthRows = allScheduleEntries
      .filter((row) => row.date.startsWith(csvMonth) && row.is_active)
      .map((row) => {
        const child = children.find((c) => c.id === Number(row.child_id))
        return [
          row.date,
          row.teacher_name,
          row.time_slot,
          String(row.minute_slot ?? 0).padStart(2, '0'),
          child?.child_name ?? row.child_id,
          row.voucher_type,
        ]
      })

    downloadCsvFile(
      `선생님CSV_${csvMonth}.csv`,
      ['날짜', '선생님', '시간', '분', '학생', '바우처'],
      monthRows
    )
  }

  function handleLogout() {
    localStorage.removeItem('staff_id')
    localStorage.removeItem('staff_name')
    localStorage.removeItem('staff_role')
    window.location.href = '/'
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab('schedule')}
              className={`rounded-xl px-4 py-2 ${tab === 'schedule' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              관리자 시간표
            </button>
            <button
              onClick={() => setTab('children')}
              className={`rounded-xl px-4 py-2 ${tab === 'children' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              아이등록
            </button>
            <button
              onClick={() => setTab('staff')}
              className={`rounded-xl px-4 py-2 ${tab === 'staff' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              선생님등록
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`rounded-xl px-4 py-2 ${tab === 'summary' ? 'bg-black text-white' : 'bg-slate-200'}`}
            >
              월정산
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

                  <button
                    onClick={() => setViewMode('daily')}
                    className={`rounded-xl px-4 py-2 text-sm font-medium ${
                      viewMode === 'daily' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    일별 보기
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
            ) : viewMode === 'daily' ? (
              <AdminDailySchedule />
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
                                const entries = getScheduleEntries(dateStr, hourSlot, Number(selectedStaff.id))
                                const isEditing =
                                  editingCell?.date === dateStr &&
                                  editingCell?.hour === hourSlot &&
                                  Number(editingCell?.staffId) === Number(selectedStaff.id)

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
                                                {getDisplayName(c)}
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

                                        <div className="flex gap-1">
                                          <button
                                            onClick={() =>
                                              handleSaveSchedule(dateStr, hourSlot, Number(selectedStaff.id))
                                            }
                                            className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                                          >
                                            추가
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingCell(null)
                                              setEditingEntryId(null)
                                              setScheduleChildId('')
                                              setSelectedMinute('00')
                                              setSelectedVoucher('')
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
                                              staffId: Number(selectedStaff.id),
                                            })
                                            setEditingEntryId(null)
                                            setScheduleChildId('')
                                            setSelectedMinute('00')
                                            setSelectedVoucher('')
                                          }}
                                          className="min-h-[28px] w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
                                        >
                                          + 추가
                                        </button>

                                        {entries.map((entry) =>
                                          renderScheduleCard(entry, dateStr, Number(selectedStaff.id))
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )
                              })
                            : weekDates.flatMap((date) =>
                                employeeStaffs.map((staff) => {
                                  const dateStr = toDateString(date)
                                  const entries = getScheduleEntries(dateStr, hourSlot, Number(staff.id))
                                  const isEditing =
                                    editingCell?.date === dateStr &&
                                    editingCell?.hour === hourSlot &&
                                    Number(editingCell?.staffId) === Number(staff.id)

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
                                                  {getDisplayName(c)}
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

                                          <div className="flex gap-1">
                                            <button
                                              onClick={() =>
                                                handleSaveSchedule(dateStr, hourSlot, Number(staff.id))
                                              }
                                              className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                                            >
                                              추가
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingCell(null)
                                                setEditingEntryId(null)
                                                setScheduleChildId('')
                                                setSelectedMinute('00')
                                                setSelectedVoucher('')
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
                                                staffId: Number(staff.id),
                                              })
                                              setEditingEntryId(null)
                                              setScheduleChildId('')
                                              setSelectedMinute('00')
                                              setSelectedVoucher('')
                                            }}
                                            className="min-h-[28px] w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
                                          >
                                            + 추가
                                          </button>

                                          {entries.map((entry) =>
                                            renderScheduleCard(entry, dateStr, Number(staff.id))
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
                    ? weekDates.map((date) => renderMobileDayCard(date, Number(selectedStaff.id)))
                    : weekDates.flatMap((date) =>
                        employeeStaffs.map((staff) => renderMobileDayCard(date, Number(staff.id)))
                      )}
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
                          className={`rounded-full px-3 py-2 text-sm ${
                            active ? 'bg-black text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {voucher}
                        </button>
                      )
                    })}
                  </div>
                </div>

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
                          voucherTypes: child.vouchers ?? [],
                          notes: child.notes ?? '',
                          isActive: child.is_active,
                        })
                      }
                      className="w-full rounded-xl border p-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{getDisplayName(child)}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${getVoucherChipClass(
                            getVoucherLabel(child.vouchers)
                          )}`}
                        >
                          {getVoucherLabel(child.vouchers)}
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
                    setStaffForm((p) => ({ ...p, role: e.target.value as StaffRole }))
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
                          role: staff.role,
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

        {tab === 'summary' ? (
          <div>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h1 className="text-xl font-bold md:text-2xl">월별 학생 정산</h1>
              <button
                onClick={loadClassLogsForMonth}
                className="rounded-xl bg-slate-700 px-4 py-2 text-white"
              >
                새로고침
              </button>
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
                      {summaryRows.map((row) => (
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
                  {summaryRows.map((row) => (
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
      </div>
    </main>
  )
}