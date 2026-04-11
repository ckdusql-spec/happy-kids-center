'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type StaffRole = 'admin' | 'employee'

type StaffRow = {
  id: number
  login_id: string
  name: string
  role: StaffRole
  is_active: boolean
}

type ChildRow = {
  id: number
  child_name: string
  birth_date: string | null
  vouchers: string[] | null
  is_active: boolean
}

type RegularClassRow = {
  id: number
  child_id: number
  teacher_id: number
  weekday: number
  time_slot: string
  minute_slot: number
  start_date: string
  end_date: string | null
  voucher_type: string | null
  note?: string | null
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
  is_active: boolean | null
  note?: string | null
  is_group?: boolean | null
  group_id?: string | null
}

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
  is_group?: boolean | null
  group_id?: string | null
}

type RegularClassForm = {
  id: number | null
  childId: number | ''
  teacherId: number | ''
  weekday: number | ''
  timeSlot: string
  minuteSlot: string
  startDate: string
  endDate: string
  voucherType: string
  note: string
  isActive: boolean
}

function toDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addYearsDate(dateString: string, years: number) {
  const d = new Date(dateString)
  d.setFullYear(d.getFullYear() + years)
  return toDateString(d)
}

function getDisplayName(child: ChildRow) {
  if (!child.birth_date) return child.child_name
  const birth = new Date(child.birth_date)
  if (Number.isNaN(birth.getTime())) return child.child_name
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  const dayDiff = now.getDate() - birth.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
  return `${child.child_name} (${age})`
}

function getHourSlots() {
  return Array.from({ length: 12 }, (_, i) => `${String(i + 9).padStart(2, '0')}:00`)
}

function getMinutesOptions() {
  return ['00', '10', '20', '30', '40', '50']
}

function getWeekdayLabel(weekday: number) {
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? ''
}

function buildRegularNoteTag(ruleId: number) {
  return `[정기수업:${ruleId}]`
}

function getDateRangeMatchingWeekday(startDate: string, endDate: string, weekday: number) {
  const result: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === weekday) {
      result.push(toDateString(new Date(d)))
    }
  }
  return result
}

function toMinuteNumberFromTimestamp(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.getHours() * 60 + date.getMinutes()
}

function getEntryMinuteTotal(entry: { time_slot: string; minute_slot?: number | null }) {
  return Number(entry.time_slot.slice(0, 2)) * 60 + Number(entry.minute_slot ?? 0)
}

function getLogMinuteTotal(log: { class_time: string }) {
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

function getVoucherOptionsForChild(childId: number | '', children: ChildRow[]) {
  if (!childId) return ['일반']
  const child = children.find((c) => Number(c.id) === Number(childId))
  if (!child) return ['일반']
  if (Array.isArray(child.vouchers) && child.vouchers.length > 0) return child.vouchers
  return ['일반']
}

export default function AdminRegularPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [children, setChildren] = useState<ChildRow[]>([])
  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [regularClasses, setRegularClasses] = useState<RegularClassRow[]>([])

  const [regularSearch, setRegularSearch] = useState('')
  const [regularChildQuery, setRegularChildQuery] = useState('')
  const [regularTeacherQuery, setRegularTeacherQuery] = useState('')

  const [regularForm, setRegularForm] = useState<RegularClassForm>({
    id: null,
    childId: '',
    teacherId: '',
    weekday: '',
    timeSlot: '09:00',
    minuteSlot: '00',
    startDate: toDateString(new Date()),
    endDate: addYearsDate(toDateString(new Date()), 5),
    voucherType: '',
    note: '',
    isActive: true,
  })

  const employeeStaffs = useMemo(
    () => staffs.filter((s) => s.role === 'employee' && s.is_active),
    [staffs]
  )

  const regularChildCandidates = useMemo(() => {
    const q = regularChildQuery.trim()
    const base = children.filter((c) => c.is_active)
    if (!q) return base
    return base.filter((c) => c.child_name.includes(q) || getDisplayName(c).includes(q))
  }, [children, regularChildQuery])

  const regularTeacherCandidates = useMemo(() => {
    const q = regularTeacherQuery.trim()
    const base = employeeStaffs
    if (!q) return base
    return base.filter((s) => s.name.includes(q))
  }, [employeeStaffs, regularTeacherQuery])

  const filteredRegularClasses = useMemo(() => {
    return regularClasses
      .filter((row) => {
        if (!row.is_active) return false
        const child = children.find((c) => Number(c.id) === Number(row.child_id))
        const staff = staffs.find((s) => Number(s.id) === Number(row.teacher_id))
        const keyword = regularSearch.trim()
        if (!keyword) return true
        return Boolean(
          child?.child_name.includes(keyword) ||
          staff?.name.includes(keyword)
        )
      })
      .sort((a, b) => {
        const childA = children.find((c) => Number(c.id) === Number(a.child_id))?.child_name ?? ''
        const childB = children.find((c) => Number(c.id) === Number(b.child_id))?.child_name ?? ''
        const nameCompare = childA.localeCompare(childB, 'ko')
        if (nameCompare !== 0) return nameCompare
        if (a.weekday !== b.weekday) return a.weekday - b.weekday
        if (a.time_slot !== b.time_slot) return a.time_slot.localeCompare(b.time_slot)
        return Number(a.minute_slot ?? 0) - Number(b.minute_slot ?? 0)
      })
  }, [regularClasses, children, staffs, regularSearch])

  async function loadStaffs() {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('*')
      .eq('is_active', true)
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

  async function loadRegularClasses() {
    const { data, error } = await supabase
      .from('regular_classes')
      .select('*')
      .order('child_id', { ascending: true })
      .order('weekday', { ascending: true })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })
    if (error) throw error
    setRegularClasses((data ?? []) as RegularClassRow[])
  }

  async function loadAll() {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([loadStaffs(), loadChildren(), loadRegularClasses()])
    } catch (err: any) {
      setMessage(err?.message ?? '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  async function splitLoggedSchedules(scheduleRows: ScheduleEntryRow[]) {
    if (scheduleRows.length === 0) {
      return { loggedRows: [] as ScheduleEntryRow[], unloggedRows: [] as ScheduleEntryRow[] }
    }

    const minDate = scheduleRows.map((r) => r.date).sort()[0]
    const maxDate = scheduleRows.map((r) => r.date).sort().slice(-1)[0]
    const childIds = Array.from(new Set(scheduleRows.map((r) => Number(r.child_id)).filter(Boolean)))
    const staffIds = Array.from(new Set(scheduleRows.map((r) => Number(r.teacher_id)).filter(Boolean)))

    let query = supabase
      .from('class_logs')
      .select('id, staff_id, child_id, class_date, class_time, status, is_group, group_id')
      .gte('class_date', minDate)
      .lte('class_date', maxDate)

    if (childIds.length > 0) query = query.in('child_id', childIds)
    if (staffIds.length > 0) query = query.in('staff_id', staffIds)

    const { data, error } = await query
    if (error) throw error
    const logs = (data ?? []) as ClassLogRow[]

    const loggedKeySet = new Set(
      logs
        .map((log) => {
          const minuteTotal = getLogMinuteTotal(log)
          if (minuteTotal == null) return ''
          return buildLogicalAttendanceKey({
            classDate: log.class_date,
            minuteTotal,
            staffId: Number(log.staff_id),
            childId: Number(log.child_id),
            isGroup: Boolean(log.is_group),
            groupId: log.group_id ?? null,
          })
        })
        .filter(Boolean)
    )

    const loggedRows: ScheduleEntryRow[] = []
    const unloggedRows: ScheduleEntryRow[] = []

    scheduleRows.forEach((row) => {
      const key = buildLogicalAttendanceKey({
        classDate: row.date,
        minuteTotal: getEntryMinuteTotal(row),
        staffId: Number(row.teacher_id),
        childId: Number(row.child_id),
        isGroup: Boolean(row.is_group),
        groupId: row.group_id ?? null,
      })

      if (loggedKeySet.has(key)) loggedRows.push(row)
      else unloggedRows.push(row)
    })

    return { loggedRows, unloggedRows }
  }

  async function handleSaveRegularClass() {
    try {
      if (!regularForm.childId || !regularForm.teacherId || regularForm.weekday === '' || !regularForm.startDate || !regularForm.voucherType) {
        setMessage('학생, 선생님, 요일, 시작일, 바우처를 확인하세요.')
        return
      }

      const endDate = regularForm.endDate || addYearsDate(regularForm.startDate, 5)

      const payload = {
        child_id: Number(regularForm.childId),
        teacher_id: Number(regularForm.teacherId),
        weekday: Number(regularForm.weekday),
        time_slot: regularForm.timeSlot,
        minute_slot: Number(regularForm.minuteSlot),
        start_date: regularForm.startDate,
        end_date: endDate,
        voucher_type: regularForm.voucherType,
        note: regularForm.note || null,
        is_active: regularForm.isActive,
      }

      let ruleId = regularForm.id

      if (regularForm.id) {
        const { error } = await supabase
          .from('regular_classes')
          .update(payload)
          .eq('id', regularForm.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('regular_classes')
          .insert(payload)
          .select('id')
          .single()

        if (error) throw error
        ruleId = data?.id ?? null
      }

      if (!ruleId) {
        setMessage('정기수업 rule id를 찾지 못했습니다.')
        return
      }

      const teacher = staffs.find((s) => Number(s.id) === Number(regularForm.teacherId))
      const teacherName = teacher?.name ?? ''
      const tag = buildRegularNoteTag(ruleId)

      const { data: existingRows, error: existingError } = await supabase
        .from('schedule_entries')
        .select('*')
        .like('note', `${tag}%`)
        .gte('date', regularForm.startDate)
        .lte('date', endDate)
        .eq('is_active', true)

      if (existingError) throw existingError

      const { loggedRows, unloggedRows } = await splitLoggedSchedules((existingRows ?? []) as ScheduleEntryRow[])

      if (unloggedRows.length > 0) {
        const { error: deactivateError } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .in('id', unloggedRows.map((r) => r.id))

        if (deactivateError) throw deactivateError
      }

      const keepKeys = new Set(
        loggedRows.map((row) =>
          buildLogicalAttendanceKey({
            classDate: row.date,
            minuteTotal: getEntryMinuteTotal(row),
            staffId: Number(row.teacher_id),
            childId: Number(row.child_id),
            isGroup: false,
            groupId: null,
          })
        )
      )

      const generatedDates = getDateRangeMatchingWeekday(
        regularForm.startDate,
        endDate,
        Number(regularForm.weekday)
      )

      const rowsToInsert = generatedDates
        .map((date) => ({
          date,
          time_slot: regularForm.timeSlot,
          minute_slot: Number(regularForm.minuteSlot),
          room_number: 1,
          teacher_id: Number(regularForm.teacherId),
          teacher_name: teacherName,
          class_type: 'individual',
          child_id: Number(regularForm.childId),
          voucher_type: regularForm.voucherType,
          status: 'scheduled',
          note: `${tag}${regularForm.note ? ` ${regularForm.note}` : ''}`,
          is_active: true,
          is_group: false,
          group_id: null,
          group_name: null,
        }))
        .filter((row) => {
          const key = buildLogicalAttendanceKey({
            classDate: row.date,
            minuteTotal: Number(row.time_slot.slice(0, 2)) * 60 + Number(row.minute_slot ?? 0),
            staffId: Number(row.teacher_id),
            childId: Number(row.child_id),
            isGroup: false,
            groupId: null,
          })
          return !keepKeys.has(key)
        })

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('schedule_entries')
          .insert(rowsToInsert)

        if (insertError) throw insertError
      }

      await loadRegularClasses()
      setRegularForm({
        id: null,
        childId: '',
        teacherId: '',
        weekday: '',
        timeSlot: '09:00',
        minuteSlot: '00',
        startDate: toDateString(new Date()),
        endDate: addYearsDate(toDateString(new Date()), 5),
        voucherType: '',
        note: '',
        isActive: true,
      })
      setRegularChildQuery('')
      setRegularTeacherQuery('')

      setMessage(
        regularForm.id
          ? `정기수업이 수정되었습니다. 출결체크 ${loggedRows.length}건은 유지되고 미체크 일정이 실시간 반영되었습니다.`
          : '정기수업이 등록되었습니다.'
      )
    } catch (err: any) {
      setMessage(err?.message ?? '정기수업 저장 실패')
    }
  }

  async function handleDeleteRegularClass(id: number) {
    try {
      const ok = window.confirm('이 정기수업을 삭제할까요? 출결체크된 일정은 유지되고 미체크 일정만 삭제됩니다.')
      if (!ok) return

      const rule = regularClasses.find((row) => Number(row.id) === Number(id))
      if (!rule) {
        setMessage('정기수업 정보를 찾을 수 없습니다.')
        return
      }

      const endForDelete = rule.end_date || addYearsDate(rule.start_date, 5)

      const { data: scheduleRows, error: scheduleReadError } = await supabase
        .from('schedule_entries')
        .select('*')
        .like('note', `${buildRegularNoteTag(id)}%`)
        .gte('date', rule.start_date)
        .lte('date', endForDelete)
        .eq('is_active', true)

      if (scheduleReadError) throw scheduleReadError

      const { loggedRows, unloggedRows } = await splitLoggedSchedules((scheduleRows ?? []) as ScheduleEntryRow[])

      if (unloggedRows.length > 0) {
        const { error: scheduleError } = await supabase
          .from('schedule_entries')
          .update({ is_active: false })
          .in('id', unloggedRows.map((r) => r.id))

        if (scheduleError) throw scheduleError
      }

      const { error } = await supabase
        .from('regular_classes')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      await loadRegularClasses()

      setMessage(
        loggedRows.length > 0
          ? `정기수업 규칙은 중지되었고 출결체크 ${loggedRows.length}건은 유지, 미체크 ${unloggedRows.length}건만 삭제되었습니다.`
          : '정기수업이 삭제되었습니다.'
      )
    } catch (err: any) {
      setMessage(err?.message ?? '정기수업 삭제 실패')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => { window.location.href = '/admin' }}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
          >
            관리자 메인
          </button>
          <div className="text-lg font-bold">정기수업관리</div>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {loading ? (
          <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">불러오는 중...</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">정기수업 등록 / 수정</h2>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">학생:</label>
                  <input
                    list="regular-child-list"
                    value={regularChildQuery}
                    onChange={(e) => {
                      const value = e.target.value
                      setRegularChildQuery(value)
                      const matchedChild = children.find((c) => c.is_active && getDisplayName(c) === value)
                      if (matchedChild) {
                        const nextOptions = getVoucherOptionsForChild(matchedChild.id, children)
                        setRegularForm((p) => ({
                          ...p,
                          childId: matchedChild.id,
                          voucherType: nextOptions.includes(p.voucherType) ? p.voucherType : '',
                        }))
                      } else {
                        setRegularForm((p) => ({ ...p, childId: '' }))
                      }
                    }}
                    placeholder="학생 이름 입력 또는 선택"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                  <datalist id="regular-child-list">
                    {regularChildCandidates.map((child) => (
                      <option key={child.id} value={getDisplayName(child)} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">선생님:</label>
                  <input
                    list="regular-teacher-list"
                    value={regularTeacherQuery}
                    onChange={(e) => {
                      const value = e.target.value
                      setRegularTeacherQuery(value)
                      const matchedStaff = employeeStaffs.find((staff) => staff.name === value)
                      setRegularForm((p) => ({ ...p, teacherId: matchedStaff ? matchedStaff.id : '' }))
                    }}
                    placeholder="선생님 이름 입력 또는 선택"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                  <datalist id="regular-teacher-list">
                    {regularTeacherCandidates.map((staff) => (
                      <option key={staff.id} value={staff.name} />
                    ))}
                  </datalist>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={regularForm.weekday}
                    onChange={(e) => setRegularForm((p) => ({ ...p, weekday: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  >
                    <option value="">요일 선택</option>
                    {[1, 2, 3, 4, 5, 6].map((weekday) => (
                      <option key={weekday} value={weekday}>
                        {getWeekdayLabel(weekday)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={regularForm.timeSlot}
                    onChange={(e) => setRegularForm((p) => ({ ...p, timeSlot: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  >
                    {getHourSlots().map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={regularForm.minuteSlot}
                    onChange={(e) => setRegularForm((p) => ({ ...p, minuteSlot: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  >
                    {getMinutesOptions().map((m) => (
                      <option key={m} value={m}>{m}분</option>
                    ))}
                  </select>

                  <select
                    value={regularForm.voucherType}
                    onChange={(e) => setRegularForm((p) => ({ ...p, voucherType: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  >
                    <option value="">바우처 선택</option>
                    {getVoucherOptionsForChild(regularForm.childId, children).map((voucher) => (
                      <option key={voucher} value={voucher}>{voucher}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="date"
                    value={regularForm.startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value
                      setRegularForm((p) => ({
                        ...p,
                        startDate: nextStart,
                        endDate: p.endDate || addYearsDate(nextStart, 5),
                      }))
                    }}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                  <input
                    type="date"
                    value={regularForm.endDate}
                    onChange={(e) => setRegularForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                </div>

                <input
                  value={regularForm.note}
                  onChange={(e) => setRegularForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="메모"
                  className="w-full rounded-xl border px-3 py-3 md:py-2"
                />

                <button
                  onClick={handleSaveRegularClass}
                  className="w-full rounded-xl bg-black py-3 text-white md:py-2"
                >
                  {regularForm.id ? '정기수업 수정' : '정기수업 등록'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <h2 className="mb-3 text-xl font-bold">정기수업 목록</h2>
              <input
                value={regularSearch}
                onChange={(e) => setRegularSearch(e.target.value)}
                placeholder="학생 / 선생님 검색"
                className="mb-3 w-full rounded-xl border px-3 py-3 md:py-2"
              />
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <div className="space-y-2">
                  {filteredRegularClasses.length === 0 ? (
                    <div className="rounded-xl border p-3 text-slate-500">등록된 정기수업이 없습니다.</div>
                  ) : (
                    filteredRegularClasses.map((row) => {
                      const child = children.find((c) => Number(c.id) === Number(row.child_id))
                      const staff = staffs.find((s) => Number(s.id) === Number(row.teacher_id))
                      return (
                        <div key={row.id} className="w-full rounded-xl border p-3 text-left hover:bg-slate-50">
                          <button
                            type="button"
                            onClick={() => {
                              setRegularForm({
                                id: row.id,
                                childId: row.child_id,
                                teacherId: row.teacher_id,
                                weekday: row.weekday,
                                timeSlot: row.time_slot,
                                minuteSlot: String(row.minute_slot ?? 0).padStart(2, '0'),
                                startDate: row.start_date,
                                endDate: row.end_date ?? '',
                                voucherType: row.voucher_type ?? '일반',
                                note: row.note ?? '',
                                isActive: row.is_active,
                              })
                              setRegularChildQuery(child ? getDisplayName(child) : '')
                              setRegularTeacherQuery(staff?.name ?? '')
                            }}
                            className="w-full text-left"
                          >
                            <div className="font-medium">
                              {child?.child_name ?? `학생(${row.child_id})`} / {staff?.name ?? `선생님(${row.teacher_id})`}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {getWeekdayLabel(row.weekday)} {row.time_slot}:{String(row.minute_slot ?? 0).padStart(2, '0')} / {row.start_date} ~ {row.end_date || '종료없음'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">바우처: {row.voucher_type ?? '일반'}</div>
                          </button>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void handleDeleteRegularClass(row.id)}
                              className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
