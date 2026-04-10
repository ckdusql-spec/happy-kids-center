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
  is_active: boolean
  birth_date?: string | null
  vouchers?: string[] | null
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
  voucher_type: string | null
  status: string | null
  minute_slot?: number | null
  is_active?: boolean | null
  note?: string | null
  is_group?: boolean | null
  group_id?: string | null
  group_name?: string | null
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
  staffId: number
} | null

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

function getVoucherClass(voucher?: string | null) {
  const value = voucher ?? ''
  if (value.includes('디딤')) return 'border-yellow-200 bg-yellow-50 text-yellow-700'
  if (value.includes('아청심1') || value.includes('아청심2') || value.includes('아청심')) return 'border-violet-200 bg-violet-50 text-violet-700'
  if (value.includes('배움')) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (value.includes('드림스타트')) return 'border-orange-200 bg-orange-50 text-orange-700'
  if (value.includes('그룹수업')) return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export default function AdminStaffWeekPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [weekBaseDate, setWeekBaseDate] = useState(new Date())
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [children, setChildren] = useState<ChildRow[]>([])
  const [allScheduleEntries, setAllScheduleEntries] = useState<ScheduleEntryRow[]>([])

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

  const filteredGroupChildren = useMemo(() => {
    const keyword = groupSearch.trim()
    return children.filter((c) => {
      if (!c.is_active) return false
      if (!keyword) return true
      return c.child_name.includes(keyword) || getDisplayName(c).includes(keyword)
    })
  }, [children, groupSearch])

  async function loadStaffs() {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('id, login_id, name, role, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) throw error
    setStaffs((data ?? []) as StaffRow[])
  }

  async function loadChildren() {
    const { data, error } = await supabase
      .from('children')
      .select('id, child_name, is_active, birth_date, vouchers')
      .eq('is_active', true)
      .order('child_name', { ascending: true })

    if (error) throw error
    setChildren((data ?? []) as ChildRow[])
  }

  async function loadSchedules() {
    if (!selectedStaffId) {
      setAllScheduleEntries([])
      return
    }

    const start = toDateString(weekDates[0])
    const end = toDateString(weekDates[weekDates.length - 1])

    const { data, error } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('teacher_id', Number(selectedStaffId))
      .gte('date', start)
      .lte('date', end)
      .eq('is_active', true)
      .order('date', { ascending: true })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })

    if (error) throw error
    setAllScheduleEntries((data ?? []) as ScheduleEntryRow[])
  }

  async function loadAll() {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([loadStaffs(), loadChildren()])
    } catch (err: any) {
      setMessage(err?.message ?? '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    void loadSchedules()
  }, [selectedStaffId, weekDates[0]?.toISOString(), weekDates[5]?.toISOString()])

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

  function toggleGroupChild(childId: number) {
    setSelectedGroupChildIds((prev) => {
      const exists = prev.includes(childId)
      if (exists) return prev.filter((id) => id !== childId)
      if (prev.length >= 8) return prev
      return [...prev, childId]
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
    setSelectedGroupChildIds([])
    setGroupSearch('')
  }

  function handleEditSchedule(item: DisplayScheduleItem) {
    setEditingCell({
      date: item.date,
      hour: item.hourSlot,
      staffId: Number(item.staffId),
    })

    setScheduleMemo(item.note ?? '')

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
      if (!row) return
      setIsGroupLesson(false)
      setEditingGroupId(null)
      setEditingEntryId(row.id)
      setScheduleChildId(row.child_id ? Number(row.child_id) : '')
      setSelectedMinute(String(row.minute_slot ?? 0).padStart(2, '0'))
      setSelectedVoucher(row.voucher_type ?? '')
      setSelectedGroupChildIds([])
      setGroupName('')
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
          const { error: clearError } = await supabase
            .from('schedule_entries')
            .update({ is_active: false })
            .eq('group_id', editingGroupId)
          if (clearError) throw clearError
        }

        const rows = selectedGroupChildIds.map((childId) => ({
          date: dateStr,
          time_slot: hourSlot,
          room_number: 1,
          teacher_id: Number(staffId),
          teacher_name: staff?.name ?? '',
          class_type: 'group',
          child_id: Number(childId),
          voucher_type: '그룹수업',
          status: 'scheduled',
          minute_slot: minute,
          is_active: true,
          note: scheduleMemo || null,
          is_group: true,
          group_id: groupId,
          group_name: groupName || '그룹수업',
        }))

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

        const payload = {
          child_id: Number(scheduleChildId),
          minute_slot: minute,
          voucher_type: selectedVoucher,
          note: scheduleMemo || null,
          is_group: false,
          group_id: null,
          group_name: null,
          class_type: 'individual',
          room_number: 1,
          status: 'scheduled',
        }

        if (editingEntryId) {
          const { error } = await supabase
            .from('schedule_entries')
            .update(payload)
            .eq('id', editingEntryId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('schedule_entries').insert({
            date: dateStr,
            time_slot: hourSlot,
            teacher_id: Number(staffId),
            teacher_name: staff?.name ?? '',
            is_active: true,
            ...payload,
          })
          if (error) throw error
        }
      }

      resetScheduleEditor()
      await loadSchedules()
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

      await loadSchedules()
      setMessage('시간표가 삭제되었습니다.')
    } catch (err: any) {
      setMessage(err?.message ?? '삭제 실패')
    }
  }

  function renderScheduleCard(item: DisplayScheduleItem, dateStr: string, staffId: number) {
    const firstChild = children.find((c) => c.id === Number(item.rows[0]?.child_id))
    const title = item.isGroup
      ? `${item.hourSlot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${item.groupName || '그룹수업'}`
      : `${item.hourSlot.slice(0, 2)}:${String(item.minuteSlot).padStart(2, '0')}, ${firstChild?.child_name ?? ''} (${getAgeText(firstChild?.birth_date ?? null)})`

    const isEditing =
      editingCell?.date === dateStr &&
      editingCell?.hour === item.hourSlot &&
      Number(editingCell?.staffId) === Number(staffId) &&
      (editingEntryId === item.rows[0]?.id || editingGroupId === item.groupId)

    return (
      <div
        key={item.key}
        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs shadow-sm"
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
                <div className="rounded border p-2">
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
                onClick={() => handleSaveSchedule(dateStr, item.hourSlot, staffId)}
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
            <div className="font-medium text-slate-800">{title}</div>

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
              <div className="mt-1 text-[11px] text-slate-500">{item.note}</div>
            ) : null}

            {item.isGroup ? (
              <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                {item.rows.map((r) => {
                  const child = children.find((c) => c.id === Number(r.child_id))
                  return (
                    <div key={r.id} className="rounded bg-slate-50 px-2 py-1">
                      {child?.child_name ?? `학생(${r.child_id})`}
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1">
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
            const items = selectedStaff ? buildDisplayItems(dateStr, hourSlot, Number(selectedStaff.id)) : []
            const isEditing =
              editingCell?.date === dateStr &&
              editingCell?.hour === hourSlot &&
              Number(editingCell?.staffId) === Number(selectedStaffId)

            return (
              <div key={`${dateStr}-${hourSlot}`} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">{hourSlot}</div>

                {isEditing && selectedStaff ? (
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
                        onClick={() => handleSaveSchedule(dateStr, hourSlot, Number(selectedStaff.id))}
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
                    {selectedStaff ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCell({ date: dateStr, hour: hourSlot, staffId: Number(selectedStaff.id) })
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
                    ) : null}

                    {items.length === 0 ? (
                      <div className="text-xs text-slate-400">등록 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item) => renderScheduleCard(item, dateStr, Number(selectedStaff.id)))}
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

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold md:text-2xl">선생님 주간보기</h1>
            <div className="mt-1 text-sm text-slate-500">선생님별 주간 시간표 전용 페이지</div>
          </div>

          <button
            onClick={() => {
              window.location.href = '/admin'
            }}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
          >
            관리자 메인
          </button>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
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

            <input
              type="date"
              value={toDateString(weekBaseDate)}
              onChange={(e) => setWeekBaseDate(new Date(e.target.value))}
              className="rounded-xl border px-3 py-2"
            />
          </div>

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

        {!selectedStaff ? (
          <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
            선생님을 선택하세요.
          </div>
        ) : loading ? (
          <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
            시간표 불러오는 중...
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border text-sm">
                <thead>
                  <tr>
                    <th className="border bg-slate-100 px-1 py-2">시간</th>
                    {weekDates.map((date, idx) => (
                      <th key={`staff-${idx}`} className="min-w-[150px] border bg-slate-100 px-1 py-2">
                        <div className="text-sm font-semibold leading-tight">
                          {['월', '화', '수', '목', '금', '토'][idx]} {toShortMonthDay(date)}
                        </div>
                        <div className="mt-1 text-xs font-normal leading-tight text-slate-500">
                          {selectedStaff.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hourSlot) => (
                    <tr key={hourSlot}>
                      <td className="whitespace-nowrap border bg-slate-50 px-1 py-1 font-medium">
                        {hourSlot}
                      </td>

                      {weekDates.map((date) => {
                        const dateStr = toDateString(date)
                        const items = buildDisplayItems(dateStr, hourSlot, Number(selectedStaff.id))
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
                              <div className="min-h-[72px] space-y-2">
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
                                    <div className="rounded border p-2">
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
                                    onClick={() =>
                                      handleSaveSchedule(dateStr, hourSlot, Number(selectedStaff.id))
                                    }
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
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCell({
                                      date: dateStr,
                                      hour: hourSlot,
                                      staffId: Number(selectedStaff.id),
                                    })
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
                                  className="min-h-[28px] w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
                                >
                                  + 추가
                                </button>

                                {items.map((item) =>
                                  renderScheduleCard(item, dateStr, Number(selectedStaff.id))
                                )}
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
          </>
        )}
      </div>
    </main>
  )
}
