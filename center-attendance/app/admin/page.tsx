'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULT_VOUCHERS = ['디딤', '아청심', '드림스타트', '배움', '일반']
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  `${String(i + 9).padStart(2, '0')}:00`
)
const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50]

type ViewMode = 'grid' | 'teacher' | 'daily'

type StaffRow = {
  id: string
  name: string
  role?: string | null
  is_active?: boolean | null
}

type ChildRow = {
  id: number
  child_name: string
  age: number | null
  vouchers: string[] | null
  voucher_yn?: boolean | null
  monthly_limit?: number | null
  is_active?: boolean | null
  notes?: string | null
}

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  minute_slot: number | null
  teacher_id: string
  teacher_name: string | null
  child_id: number | null
  voucher_type: string | null
  is_active: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

type ChildForm = {
  id: number | null
  child_name: string
  age: string
  vouchers: string[]
  monthly_limit: string
  notes: string
  is_active: boolean
}

type ScheduleForm = {
  id: string | null
  date: string
  time_slot: string
  minute_slot: number
  teacher_id: string
  teacher_name: string
  child_id: number | ''
  voucher_type: string
}

function formatDateInput(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function displayMinute(minute: number | null | undefined) {
  return String(Number(minute ?? 0)).padStart(2, '0')
}

function buildDisplayTime(timeSlot: string, minuteSlot: number) {
  const hour = timeSlot.slice(0, 2)
  return `${hour}:${String(minuteSlot).padStart(2, '0')}`
}

function getChildName(child?: ChildRow | null, childId?: number | null) {
  if (!child) return childId ? `학생(${childId})` : '학생'
  return child.child_name
}

function getChildAge(child?: ChildRow | null) {
  if (!child) return null
  return typeof child.age === 'number' ? child.age : null
}

function getChildVoucherOptions(child?: ChildRow | null) {
  if (!child) return DEFAULT_VOUCHERS
  if (Array.isArray(child.vouchers) && child.vouchers.length > 0) return child.vouchers
  if (child.voucher_yn) return DEFAULT_VOUCHERS.filter((v) => v !== '일반')
  return DEFAULT_VOUCHERS
}

function groupByTeacher(entries: ScheduleEntryRow[]) {
  const map = new Map<string, ScheduleEntryRow[]>()

  entries.forEach((entry) => {
    if (!entry.is_active) return
    const key = entry.teacher_id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  })

  return Array.from(map.entries())
    .map(([teacherId, items]) => ({
      teacherId,
      teacherName: items[0]?.teacher_name || '선생님',
      items: items.sort((a, b) => {
        const t = a.time_slot.localeCompare(b.time_slot)
        if (t !== 0) return t
        return Number(a.minute_slot ?? 0) - Number(b.minute_slot ?? 0)
      }),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko'))
}

function buildTeacherGrid(entries: ScheduleEntryRow[]) {
  const teacherMap = new Map<string, string>()
  const timeSet = new Set<string>()
  const cellMap: Record<string, ScheduleEntryRow[]> = {}

  entries.forEach((row) => {
    if (!row.is_active) return
    teacherMap.set(row.teacher_id, row.teacher_name || '선생님')
    timeSet.add(row.time_slot)

    const key = `${row.time_slot}__${row.teacher_id}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(row)
  })

  Object.keys(cellMap).forEach((key) => {
    cellMap[key].sort((a, b) => {
      return Number(a.minute_slot ?? 0) - Number(b.minute_slot ?? 0)
    })
  })

  const teachers = Array.from(teacherMap.entries())
    .map(([teacherId, teacherName]) => ({ teacherId, teacherName }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko'))

  const hours = Array.from(timeSet).sort((a, b) => a.localeCompare(b))

  return { teachers, hours, cellMap }
}

export default function AdminPage() {
  const today = formatDateInput(new Date())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [children, setChildren] = useState<ChildRow[]>([])
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([])

  const [selectedDate, setSelectedDate] = useState(today)

  const [childForm, setChildForm] = useState<ChildForm>({
    id: null,
    child_name: '',
    age: '',
    vouchers: [],
    monthly_limit: '',
    notes: '',
    is_active: true,
  })

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    id: null,
    date: today,
    time_slot: '09:00',
    minute_slot: 0,
    teacher_id: '',
    teacher_name: '',
    child_id: '',
    voucher_type: '',
  })

  const childMap = useMemo(() => {
    const map = new Map<number, ChildRow>()
    children.forEach((child) => map.set(Number(child.id), child))
    return map
  }, [children])

  const selectedChild = useMemo(() => {
    if (scheduleForm.child_id === '') return null
    return childMap.get(Number(scheduleForm.child_id)) ?? null
  }, [scheduleForm.child_id, childMap])

  const voucherOptions = useMemo(() => {
    return getChildVoucherOptions(selectedChild)
  }, [selectedChild])

  async function loadBaseData() {
    try {
      setLoading(true)
      setError('')

      const { data: staffData, error: staffError } = await supabase
        .from('staff_accounts')
        .select('id, name, role, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (staffError) throw staffError

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('id, child_name, age, vouchers, voucher_yn, monthly_limit, is_active, notes')
        .eq('is_active', true)
        .order('child_name', { ascending: true })

      if (childError) throw childError

      setStaffs((staffData ?? []) as StaffRow[])
      setChildren((childData ?? []) as ChildRow[])
    } catch (err: any) {
      setError(err?.message ?? '기초 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function loadEntries(date: string) {
    try {
      setError('')
      const { data, error } = await supabase
        .from('schedule_entries')
        .select(`
          id,
          date,
          time_slot,
          minute_slot,
          teacher_id,
          teacher_name,
          child_id,
          voucher_type,
          is_active,
          created_at,
          updated_at
        `)
        .eq('date', date)
        .eq('is_active', true)
        .order('time_slot', { ascending: true })
        .order('minute_slot', { ascending: true })

      if (error) throw error
      setEntries((data ?? []) as ScheduleEntryRow[])
    } catch (err: any) {
      setError(err?.message ?? '시간표를 불러오지 못했습니다.')
      setEntries([])
    }
  }

  useEffect(() => {
    loadBaseData()
  }, [])

  useEffect(() => {
    loadEntries(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    setScheduleForm((prev) => ({ ...prev, date: selectedDate }))
  }, [selectedDate])

  useEffect(() => {
    const nextOptions = getChildVoucherOptions(selectedChild)
    if (!nextOptions.includes(scheduleForm.voucher_type)) {
      setScheduleForm((prev) => ({
        ...prev,
        voucher_type: nextOptions[0] ?? '',
      }))
    }
  }, [scheduleForm.child_id])

  function resetChildForm() {
    setChildForm({
      id: null,
      child_name: '',
      age: '',
      vouchers: [],
      monthly_limit: '',
      notes: '',
      is_active: true,
    })
  }

  function resetScheduleForm() {
    setScheduleForm({
      id: null,
      date: selectedDate,
      time_slot: '09:00',
      minute_slot: 0,
      teacher_id: '',
      teacher_name: '',
      child_id: '',
      voucher_type: '',
    })
  }

  function toggleVoucher(voucher: string) {
    setChildForm((prev) => {
      const exists = prev.vouchers.includes(voucher)
      return {
        ...prev,
        vouchers: exists
          ? prev.vouchers.filter((v) => v !== voucher)
          : [...prev.vouchers, voucher],
      }
    })
  }

  function handleTeacherChange(teacherId: string) {
    const teacher = staffs.find((v) => v.id === teacherId)
    setScheduleForm((prev) => ({
      ...prev,
      teacher_id: teacherId,
      teacher_name: teacher?.name ?? '',
    }))
  }

  function handleChildChange(value: string) {
    const childId = value ? Number(value) : ''
    const child = value ? childMap.get(Number(value)) ?? null : null
    const options = getChildVoucherOptions(child)

    setScheduleForm((prev) => ({
      ...prev,
      child_id: childId,
      voucher_type: options[0] ?? '',
    }))
  }

  async function saveChild() {
    try {
      setSaving(true)
      setError('')
      setMessage('')

      if (!childForm.child_name.trim()) throw new Error('아이 이름을 입력하세요.')
      if (childForm.vouchers.length === 0) throw new Error('바우처를 1개 이상 선택하세요.')

      const payload = {
        child_name: childForm.child_name.trim(),
        age: childForm.age ? Number(childForm.age) : null,
        vouchers: childForm.vouchers,
        monthly_limit: childForm.monthly_limit ? Number(childForm.monthly_limit) : null,
        notes: childForm.notes.trim() || null,
        is_active: true,
      }

      if (childForm.id) {
        const { error } = await supabase
          .from('children')
          .update(payload)
          .eq('id', childForm.id)

        if (error) throw error
        setMessage('아이 정보가 수정되었습니다.')
      } else {
        const { error } = await supabase
          .from('children')
          .insert(payload)

        if (error) throw error
        setMessage('아이 정보가 등록되었습니다.')
      }

      await loadBaseData()
      resetChildForm()
    } catch (err: any) {
      setError(err?.message ?? '아이 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSchedule() {
    try {
      setSaving(true)
      setError('')
      setMessage('')

      if (!scheduleForm.date) throw new Error('날짜를 선택하세요.')
      if (!scheduleForm.teacher_id) throw new Error('선생님을 선택하세요.')
      if (scheduleForm.child_id === '') throw new Error('학생을 선택하세요.')
      if (!scheduleForm.voucher_type) throw new Error('바우처를 선택하세요.')

      const duplicateBase = supabase
        .from('schedule_entries')
        .select('id')
        .eq('date', scheduleForm.date)
        .eq('time_slot', scheduleForm.time_slot)
        .eq('minute_slot', scheduleForm.minute_slot)
        .eq('teacher_id', scheduleForm.teacher_id)
        .eq('child_id', Number(scheduleForm.child_id))
        .eq('is_active', true)

      const { data: dupData, error: dupError } = scheduleForm.id
        ? await duplicateBase.neq('id', scheduleForm.id)
        : await duplicateBase

      if (dupError) throw dupError
      if ((dupData ?? []).length > 0) {
        throw new Error('같은 시간에 같은 선생님/학생 배정이 이미 있습니다.')
      }

      const payload = {
        date: scheduleForm.date,
        time_slot: scheduleForm.time_slot,
        minute_slot: scheduleForm.minute_slot,
        teacher_id: scheduleForm.teacher_id,
        teacher_name: scheduleForm.teacher_name,
        child_id: Number(scheduleForm.child_id),
        voucher_type: scheduleForm.voucher_type,
        is_active: true,
      }

      if (scheduleForm.id) {
        const { error } = await supabase
          .from('schedule_entries')
          .update(payload)
          .eq('id', scheduleForm.id)

        if (error) throw error
        setMessage('시간표가 수정되었습니다.')
      } else {
        const { error } = await supabase
          .from('schedule_entries')
          .insert(payload)

        if (error) throw error
        setMessage('시간표가 저장되었습니다.')
      }

      await loadEntries(selectedDate)
      resetScheduleForm()
    } catch (err: any) {
      setError(err?.message ?? '시간표 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function editSchedule(entry: ScheduleEntryRow) {
    setScheduleForm({
      id: entry.id,
      date: entry.date,
      time_slot: entry.time_slot,
      minute_slot: Number(entry.minute_slot ?? 0),
      teacher_id: entry.teacher_id,
      teacher_name: entry.teacher_name ?? '',
      child_id: Number(entry.child_id ?? 0),
      voucher_type: entry.voucher_type ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
async function deleteSchedule(id: string) {
    const ok = window.confirm('이 시간표를 삭제할까요?')
    if (!ok) return

    try {
      setError('')
      setMessage('')

      const { error } = await supabase
        .from('schedule_entries')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      setMessage('시간표가 삭제되었습니다.')
      await loadEntries(selectedDate)

      if (scheduleForm.id === id) resetScheduleForm()
    } catch (err: any) {
      setError(err?.message ?? '삭제 중 오류가 발생했습니다.')
    }
  }

  const teacherGroups = useMemo(() => groupByTeacher(entries), [entries])
  const { teachers, hours, cellMap } = useMemo(() => buildTeacherGrid(entries), [entries])

  return (
    <div className="min-h-screen bg-[#f6f8fb] p-4 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">관리자 시간표</h1>
              <p className="mt-1 text-sm text-gray-500">
                아이 등록, 바우처 선택, 시간표 저장/수정/삭제, 전체/선생님별/일별 보기까지 한 화면에서 처리합니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">날짜</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700'
              }`}
            >
              전체보기
            </button>

            <button
              type="button"
              onClick={() => setViewMode('teacher')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                viewMode === 'teacher'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700'
              }`}
            >
              선생님별보기
            </button>

            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                viewMode === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700'
              }`}
            >
              일별 보기
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-600">
              {message}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[420px_420px_1fr]">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-gray-900">아이 등록 / 수정</h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">아이 이름</label>
                <input
                  value={childForm.child_name}
                  onChange={(e) =>
                    setChildForm((prev) => ({ ...prev, child_name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">나이</label>
                <input
                  type="number"
                  value={childForm.age}
                  onChange={(e) =>
                    setChildForm((prev) => ({ ...prev, age: e.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  바우처(여러 개 선택)
                </label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_VOUCHERS.map((voucher) => {
                    const active = childForm.vouchers.includes(voucher)
                    return (
                      <button
                        key={voucher}
                        type="button"
                        onClick={() => toggleVoucher(voucher)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {voucher}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">월 제한</label>
                <input
                  type="number"
                  value={childForm.monthly_limit}
                  onChange={(e) =>
                    setChildForm((prev) => ({ ...prev, monthly_limit: e.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">메모</label>
                <textarea
                  value={childForm.notes}
                  onChange={(e) =>
                    setChildForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveChild}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  아이 저장
                </button>
                <button
                  type="button"
                  onClick={resetChildForm}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-gray-900">
              {scheduleForm.id ? '시간표 수정' : '시간표 작성'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">날짜</label>
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => {
                    setSelectedDate(e.target.value)
                    setScheduleForm((prev) => ({ ...prev, date: e.target.value }))
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">시간</label>
                  <select
                    value={scheduleForm.time_slot}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, time_slot: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">10분 단위</label>
                  <select
                    value={scheduleForm.minute_slot}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        minute_slot: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {displayMinute(minute)}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">학생</label>
                <select
                  value={scheduleForm.child_id === '' ? '' : String(scheduleForm.child_id)}
                  onChange={(e) => handleChildChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">선택하세요</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.child_name}
                      {typeof child.age === 'number' ? ` (${child.age})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">선생님</label>
                <select
                  value={scheduleForm.teacher_id}
                  onChange={(e) => handleTeacherChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">선택하세요</option>
                  {staffs
                    .filter((staff) => staff.role !== 'admin')
                    .map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">바우처</label>
                <select
                  value={scheduleForm.voucher_type}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      voucher_type: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">선택하세요</option>
                  {voucherOptions.map((voucher) => (
                    <option key={voucher} value={voucher}>
                      {voucher}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                <div>
                  수업시간:{' '}
                  <span className="font-semibold">
                    {buildDisplayTime(scheduleForm.time_slot, scheduleForm.minute_slot)}
                  </span>
                </div>
                <div className="mt-1">
                  학생:{' '}
                  <span className="font-semibold">
                    {getChildName(selectedChild, Number(scheduleForm.child_id || 0))}
                    {typeof getChildAge(selectedChild) === 'number'
                      ? ` (${getChildAge(selectedChild)})`
                      : ''}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveSchedule}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {scheduleForm.id ? '수정 저장' : '시간표 저장'}
                </button>
                <button
                  type="button"
                  onClick={resetScheduleForm}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
                불러오는 중...
              </div>
            ) : null}

            {!loading && viewMode === 'grid' && (
              <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
                <table className="min-w-[1100px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 min-w-[90px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-700">
                        시간
                      </th>
                      {teachers.map((teacher) => (
                        <th
                          key={teacher.teacherId}
                          className="top-0 z-10 min-w-[230px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-900"
                        >
                          {teacher.teacherName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((hour) => (
                      <tr key={hour}>
                        <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-3 text-center text-sm font-semibold text-gray-700">
                          {hour}
                        </td>

                        {teachers.map((teacher) => {
                          const key = `${hour}__${teacher.teacherId}`
                          const items = cellMap[key] ?? []

                          return (
                            <td key={key} className="align-top border-b border-r px-2 py-2">
                              {items.length === 0 ? (
                                <div className="min-h-[56px]" />
                              ) : (
                                <div className="flex min-h-[56px] flex-col gap-2">
                                  {items.map((item) => {
                                    const child = childMap.get(Number(item.child_id ?? 0))
                                    return (
                                      <div
                                        key={item.id}
                                        className="rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm"
                                      >
                                        <div className="text-sm font-semibold text-gray-900">
                                          [{displayMinute(item.minute_slot)}] {getChildName(child, item.child_id)}
                                          {typeof getChildAge(child) === 'number'
                                            ? ` (${getChildAge(child)})`
                                            : ''}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-600">
                                          {item.voucher_type || '-'}
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => editSchedule(item)}
                                            className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                                          >
                                            수정
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => deleteSchedule(item.id)}
                                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                                          >
                                            삭제
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
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
            )}

            {!loading && viewMode === 'teacher' && (
              <div className="space-y-4">
                {teacherGroups.length === 0 ? (
                  <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
                    선택한 날짜에 시간표가 없습니다.
                  </div>
                ) : (
                  teacherGroups.map((group) => (
                    <div key={group.teacherId} className="rounded-2xl bg-white shadow-sm">
                      <div className="border-b bg-gray-50 px-4 py-3">
                        <div className="text-lg font-bold text-gray-900">{group.teacherName}</div>
                      </div>
                      <div className="divide-y">
                        {group.items.map((item) => {
                          const child = childMap.get(Number(item.child_id ?? 0))
                          return (
                            <div
                              key={item.id}
                              className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="text-sm font-semibold text-gray-900">
                                {item.time_slot} [{displayMinute(item.minute_slot)}]
                                {' / '}
                                {getChildName(child, item.child_id)}
                                {typeof getChildAge(child) === 'number'
                                  ? ` (${getChildAge(child)})`
                                  : ''}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                                  {item.voucher_type || '-'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => editSchedule(item)}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSchedule(item.id)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {!loading && viewMode === 'daily' && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-bold text-gray-900">일별 보기</h3>

                {entries.length === 0 ? (
                  <div className="text-sm text-gray-500">선택한 날짜에 시간표가 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const child = childMap.get(Number(entry.child_id ?? 0))
                      return (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {entry.time_slot} [{displayMinute(entry.minute_slot)}]
                              {' / '}
                              {entry.teacher_name}
                              {' / '}
                              {getChildName(child, entry.child_id)}
                              {typeof getChildAge(child) === 'number'
                                ? ` (${getChildAge(child)})`
                                : ''}
                            </div>
                            <div className="mt-1 text-xs text-gray-600">
                              바우처: {entry.voucher_type || '-'}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editSchedule(entry)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSchedule(entry.id)}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}