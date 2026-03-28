'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULT_VOUCHERS = ['디딤', '아청심', '드림스타트', '배움', '일반']
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i + 9).padStart(2, '0') + ':00'
)
const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50]

type StaffRow = {
  id: string
  name: string
  role?: string | null
  is_active?: boolean | null
}

type ChildRow = {
  id: number
  child_name?: string | null
  name?: string | null
  age?: number | null
  child_age?: number | null
  birthdate?: string | null
  birthday?: string | null
  vouchers?: string[] | null
  voucher_types?: string[] | null
  voucher_type?: string | null
  voucher_yn?: boolean | null
  is_active?: boolean | null
  [key: string]: any
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

type FormState = {
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

function getChildName(child: ChildRow) {
  return child.child_name || child.name || `학생(${child.id})`
}

function getAgeFromBirthdate(value?: string | null) {
  if (!value) return null
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function getChildAge(child: ChildRow) {
  if (typeof child.age === 'number') return child.age
  if (typeof child.child_age === 'number') return child.child_age
  return getAgeFromBirthdate(child.birthdate || child.birthday)
}

function getChildVoucherOptions(child: ChildRow | undefined) {
  if (!child) return DEFAULT_VOUCHERS
  if (Array.isArray(child.vouchers) && child.vouchers.length > 0) return child.vouchers
  if (Array.isArray(child.voucher_types) && child.voucher_types.length > 0) return child.voucher_types
  if (typeof child.voucher_type === 'string' && child.voucher_type.trim()) return [child.voucher_type.trim()]
  if (child.voucher_yn === true) return DEFAULT_VOUCHERS.filter((v) => v !== '일반')
  return DEFAULT_VOUCHERS
}

function buildDisplayTime(hourSlot: string, minuteSlot: number) {
  const hour = hourSlot.slice(0, 2)
  const minute = String(minuteSlot).padStart(2, '0')
  return `${hour}:${minute}`
}

function buildTeacherGrid(entries: ScheduleEntryRow[], children: ChildRow[]) {
  const childMap = new Map<number, ChildRow>()
  children.forEach((child) => childMap.set(Number(child.id), child))

  const teacherMap = new Map<string, string>()
  const hourSet = new Set<string>()
  const cellMap: Record<string, ScheduleEntryRow[]> = {}

  entries.forEach((row) => {
    if (!row.is_active) return
    teacherMap.set(row.teacher_id, row.teacher_name || '선생님')
    hourSet.add(row.time_slot)

    const key = `${row.time_slot}__${row.teacher_id}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(row)
  })

  Object.keys(cellMap).forEach((key) => {
    cellMap[key].sort((a, b) => {
      const am = Number(a.minute_slot ?? 0)
      const bm = Number(b.minute_slot ?? 0)
      if (am !== bm) return am - bm
      const ac = childMap.get(Number(a.child_id ?? 0))
      const bc = childMap.get(Number(b.child_id ?? 0))
      return getChildName(ac || ({ id: 0 } as ChildRow)).localeCompare(
        getChildName(bc || ({ id: 0 } as ChildRow)),
        'ko'
      )
    })
  })

  const teachers = Array.from(teacherMap.entries())
    .map(([teacherId, teacherName]) => ({ teacherId, teacherName }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko'))

  const hours = Array.from(hourSet).sort((a, b) => a.localeCompare(b))

  return { teachers, hours, cellMap, childMap }
}

export default function AdminPage() {
  const today = formatDateInput(new Date())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [children, setChildren] = useState<ChildRow[]>([])
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([])

  const [selectedDate, setSelectedDate] = useState(today)

  const [form, setForm] = useState<FormState>({
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
    if (form.child_id === '') return undefined
    return childMap.get(Number(form.child_id))
  }, [form.child_id, childMap])

  const voucherOptions = useMemo(() => {
    return getChildVoucherOptions(selectedChild)
  }, [selectedChild])

  async function loadBaseData() {
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { data: staffData, error: staffError } = await supabase
        .from('staff_accounts')
        .select('id, name, role, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (staffError) throw staffError

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
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
    setError('')
    setMessage('')

    try {
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
    setForm((prev) => ({ ...prev, date: selectedDate }))
  }, [selectedDate])

  useEffect(() => {
    if (!form.child_id) return
    const options = getChildVoucherOptions(selectedChild)
    if (!options.includes(form.voucher_type)) {
      setForm((prev) => ({
        ...prev,
        voucher_type: options[0] ?? '',
      }))
    }
  }, [form.child_id])

  function resetForm() {
    setForm({
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

  function handleTeacherChange(teacherId: string) {
    const selectedTeacher = staffs.find((staff) => staff.id === teacherId)
    setForm((prev) => ({
      ...prev,
      teacher_id: teacherId,
      teacher_name: selectedTeacher?.name ?? '',
    }))
  }

  function handleChildChange(value: string) {
    const childId = value ? Number(value) : ''
    const child = value ? childMap.get(Number(value)) : undefined
    const options = getChildVoucherOptions(child)

    setForm((prev) => ({
      ...prev,
      child_id: childId,
      voucher_type: options[0] ?? '',
    }))
  }

  async function saveEntry() {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      if (!form.date) throw new Error('날짜를 선택하세요.')
      if (!form.teacher_id) throw new Error('선생님을 선택하세요.')
      if (!form.teacher_name) throw new Error('선생님명이 없습니다.')
      if (form.child_id === '') throw new Error('학생을 선택하세요.')
      if (!form.voucher_type) throw new Error('바우처를 선택하세요.')

      const duplicateQuery = supabase
        .from('schedule_entries')
        .select('id')
        .eq('date', form.date)
        .eq('time_slot', form.time_slot)
        .eq('minute_slot', form.minute_slot)
        .eq('teacher_id', form.teacher_id)
        .eq('child_id', Number(form.child_id))
        .eq('is_active', true)

      const { data: duplicateData, error: duplicateError } = form.id
        ? await duplicateQuery.neq('id', form.id)
        : await duplicateQuery

      if (duplicateError) throw duplicateError
      if ((duplicateData ?? []).length > 0) {
        throw new Error('같은 시간에 같은 선생님-학생 배정이 이미 있습니다.')
      }

      const payload = {
        date: form.date,
        time_slot: form.time_slot,
        minute_slot: form.minute_slot,
        teacher_id: form.teacher_id,
        teacher_name: form.teacher_name,
        child_id: Number(form.child_id),
        voucher_type: form.voucher_type,
        is_active: true,
      }

      if (form.id) {
        const { error } = await supabase
          .from('schedule_entries')
          .update(payload)
          .eq('id', form.id)

        if (error) throw error
        setMessage('수정되었습니다.')
      } else {
        const { error } = await supabase
          .from('schedule_entries')
          .insert(payload)

        if (error) throw error
        setMessage('저장되었습니다.')
      }

      await loadEntries(selectedDate)
      resetForm()
    } catch (err: any) {
      setError(err?.message ?? '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function editEntry(entry: ScheduleEntryRow) {
    setForm({
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

  async function deleteEntry(entryId: string) {
    const ok = window.confirm('이 시간표를 삭제할까요?')
    if (!ok) return

    setError('')
    setMessage('')

    try {
      const { error } = await supabase
        .from('schedule_entries')
        .update({ is_active: false })
        .eq('id', entryId)

      if (error) throw error

      setMessage('삭제되었습니다.')
      await loadEntries(selectedDate)

      if (form.id === entryId) {
        resetForm()
      }
    } catch (err: any) {
      setError(err?.message ?? '삭제 중 오류가 발생했습니다.')
    }
  }

  const { teachers, hours, cellMap } = useMemo(() => {
    return buildTeacherGrid(entries, children)
  }, [entries, children])

  return (
    <div className="min-h-screen bg-[#f6f8fb] p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h1 className="text-xl font-bold text-gray-900">
                {form.id ? '시간표 수정' : '시간표 입력'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                저장/수정/삭제는 모두 시간표 원본 기준입니다.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">날짜</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    setSelectedDate(e.target.value)
                    setForm((prev) => ({ ...prev, date: e.target.value }))
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">시간(정시)</label>
                  <select
                    value={form.time_slot}
                    onChange={(e) => setForm((prev) => ({ ...prev, time_slot: e.target.value }))}
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
                    value={form.minute_slot}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, minute_slot: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, '0')}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">선생님</label>
                <select
                  value={form.teacher_id}
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
                <label className="mb-1 block text-sm font-medium text-gray-700">학생</label>
                <select
                  value={form.child_id === '' ? '' : String(form.child_id)}
                  onChange={(e) => handleChildChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">선택하세요</option>
                  {children.map((child) => {
                    const age = getChildAge(child)
                    return (
                      <option key={child.id} value={child.id}>
                        {getChildName(child)}{typeof age === 'number' ? ` (${age})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">바우처</label>
                <select
                  value={form.voucher_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, voucher_type: e.target.value }))}
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
                  입력시간: <span className="font-semibold">{buildDisplayTime(form.time_slot, form.minute_slot)}</span>
                </div>
                {selectedChild ? (
                  <div className="mt-1">
                    학생: <span className="font-semibold">{getChildName(selectedChild)}</span>
                    {typeof getChildAge(selectedChild) === 'number'
                      ? ` (${getChildAge(selectedChild)})`
                      : ''}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              ) : null}

              {message ? (
                <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-600">{message}</div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEntry}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? '저장 중...' : form.id ? '수정 저장' : '새로 저장'}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">선생님 전체시간표</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    시간은 정시 기준, 10분 단위는 학생명 앞에 표시됩니다.
                  </p>
                </div>

                <div className="text-sm text-gray-600">
                  선택 날짜: <span className="font-semibold">{selectedDate}</span>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
                불러오는 중...
              </div>
            ) : teachers.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
                선택한 날짜에 시간표가 없습니다.
              </div>
            ) : (
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
                          className="top-0 z-10 min-w-[240px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-900"
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
                                    const age = child ? getChildAge(child) : null

                                    return (
                                      <div
                                        key={item.id}
                                        className="rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm"
                                      >
                                        <div className="text-sm font-semibold text-gray-900">
                                          [{String(Number(item.minute_slot ?? 0)).padStart(2, '0')}]
                                          {' '}
                                          {child ? getChildName(child) : `학생(${item.child_id})`}
                                          {typeof age === 'number' ? ` (${age})` : ''}
                                        </div>

                                        <div className="mt-1 text-xs text-gray-600">
                                          {item.voucher_type || '-'}
                                        </div>

                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => editEntry(item)}
                                            className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                                          >
                                            수정
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => deleteEntry(item.id)}
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

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold text-gray-900">해당 날짜 입력 목록</h3>

              {entries.length === 0 ? (
                <div className="text-sm text-gray-500">입력된 시간표가 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const child = childMap.get(Number(entry.child_id ?? 0))
                    const age = child ? getChildAge(child) : null
                    return (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {entry.time_slot} [{String(Number(entry.minute_slot ?? 0)).padStart(2, '0')}]
                            {' / '}
                            {entry.teacher_name}
                            {' / '}
                            {child ? getChildName(child) : `학생(${entry.child_id})`}
                            {typeof age === 'number' ? ` (${age})` : ''}
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            바우처: {entry.voucher_type || '-'}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editEntry(entry)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
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
          </div>
        </div>
      </div>
    </div>
  )
}