
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { saveRegularChange, askEffectiveDate } from '@/lib/regularClient'

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

type RegularGroupClassRow = {
  id: number
  teacher_id: number
  weekday: number
  time_slot: string
  minute_slot: number
  start_date: string
  end_date: string | null
  group_name: string
  note?: string | null
  is_active: boolean
}

type RegularGroupClassMemberRow = {
  id: number
  regular_group_class_id: number
  child_id: number
  is_active: boolean
}

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  minute_slot: number | null
  room_number?: number | null
  teacher_id: number
  teacher_name: string | null
  class_type?: string | null
  child_id: number | null
  voucher_type: string | null
  status?: string | null
  is_active: boolean | null
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
  status: 'attended' | 'absent' | 'makeup' | 'same_day_absent'
  is_group?: boolean | null
  group_id?: string | null
}

type RegularClassForm = {
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

type RegularGroupClassForm = {
  teacherId: number | ''
  teacherId2: number | ''
  weekday: number | ''
  timeSlot: string
  minuteSlot: string
  startDate: string
  endDate: string
  groupName: string
  note: string
  isActive: boolean
  childIds: number[]
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

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--
  }

  return `${child.child_name} (${age})`
}

function getHourSlots() {
  return Array.from({ length: 12 }, (_, i) =>
    `${String(i + 9).padStart(2, '0')}:00`
  )
}

function getMinutesOptions() {
  return ['00', '10', '20', '30', '40', '50']
}

function getWeekdayLabel(weekday: number) {
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? ''
}







function parseAssistantTeacherId(note?: string | null) {
  if (!note) return null
  const matched = note.match(/\[보조교사:(\d+):.*?\]/)
  if (!matched) return null
  return Number(matched[1])
}

function stripAssistantTeacherTag(note?: string | null) {
  if (!note) return ''
  return note.replace(/\s*\[보조교사:\d+:.*?\]\s*/g, ' ').trim()
}

















function getVoucherOptionsForChild(childId: number | '', children: ChildRow[]) {
  if (!childId) return ['일반']

  const child = children.find((c) => Number(c.id) === Number(childId))
  if (!child) return ['일반']

  if (Array.isArray(child.vouchers) && child.vouchers.length > 0) {
    return child.vouchers
  }

  return ['일반']
}

export default function Page() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [children, setChildren] = useState<ChildRow[]>([])
  const [staffs, setStaffs] = useState<StaffRow[]>([])
  const [regularClasses, setRegularClasses] = useState<RegularClassRow[]>([])
  const [regularGroupClasses, setRegularGroupClasses] = useState<RegularGroupClassRow[]>([])
  const [regularGroupMembers, setRegularGroupMembers] = useState<RegularGroupClassMemberRow[]>([])

  const [regularSearch, setRegularSearch] = useState('')
  const [regularGroupSearch, setRegularGroupSearch] = useState('')
  const [regularChildQuery, setRegularChildQuery] = useState('')
  const [regularTeacherQuery, setRegularTeacherQuery] = useState('')
  const [regularGroupTeacherQuery, setRegularGroupTeacherQuery] = useState('')
  const [regularGroupTeacherQuery2, setRegularGroupTeacherQuery2] = useState('')
  const [regularGroupDebugSteps, setRegularGroupDebugSteps] = useState<string[]>([])
  const [regularGroupChildInputs, setRegularGroupChildInputs] = useState<string[]>(
    Array(6).fill('')
  )

  const [editingRegularClassId, setEditingRegularClassId] = useState<number | null>(null)
  const [regularChangeStartDate, setRegularChangeStartDate] = useState(toDateString(new Date()))
  const [editingRegularGroupClassId, setEditingRegularGroupClassId] = useState<number | null>(null)
  const [regularGroupChangeStartDate, setRegularGroupChangeStartDate] = useState(toDateString(new Date()))

  const [regularForm, setRegularForm] = useState<RegularClassForm>({
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

  const [regularGroupForm, setRegularGroupForm] = useState<RegularGroupClassForm>({
    teacherId: '',
    teacherId2: '',
    weekday: '',
    timeSlot: '09:00',
    minuteSlot: '00',
    startDate: toDateString(new Date()),
    endDate: addYearsDate(toDateString(new Date()), 5),
    groupName: '',
    note: '',
    isActive: true,
    childIds: [],
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

  const regularGroupTeacherCandidates = useMemo(() => {
    const q = regularGroupTeacherQuery.trim()
    const base = employeeStaffs
    if (!q) return base
    return base.filter((s) => s.name.includes(q))
  }, [employeeStaffs, regularGroupTeacherQuery])

  const regularGroupTeacherCandidates2 = useMemo(() => {
    const q = regularGroupTeacherQuery2.trim()
    const base = employeeStaffs
    if (!q) return base
    return base.filter((s) => s.name.includes(q))
  }, [employeeStaffs, regularGroupTeacherQuery2])

  const regularGroupChildCandidates = useMemo(
    () => children.filter((c) => c.is_active),
    [children]
  )

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
        const childA =
          children.find((c) => Number(c.id) === Number(a.child_id))?.child_name ?? ''
        const childB =
          children.find((c) => Number(c.id) === Number(b.child_id))?.child_name ?? ''

        const nameCompare = childA.localeCompare(childB, 'ko')
        if (nameCompare !== 0) return nameCompare
        if (a.weekday !== b.weekday) return a.weekday - b.weekday
        if (a.time_slot !== b.time_slot) return a.time_slot.localeCompare(b.time_slot)
        return Number(a.minute_slot ?? 0) - Number(b.minute_slot ?? 0)
      })
  }, [regularClasses, children, staffs, regularSearch])

  const filteredRegularGroupClasses = useMemo(() => {
    return regularGroupClasses
      .filter((row) => {
        if (!row.is_active) return false

        const staff1 = staffs.find((s) => Number(s.id) === Number(row.teacher_id))
        const staff2Id = parseAssistantTeacherId(row.note)
        const staff2 = staffs.find((s) => Number(s.id) === Number(staff2Id))
        const memberNames = regularGroupMembers
          .filter(
            (m) =>
              Number(m.regular_group_class_id) === Number(row.id) && m.is_active
          )
          .map(
            (m) =>
              children.find((c) => Number(c.id) === Number(m.child_id))
                ?.child_name ?? ''
          )
          .join(', ')

        const keyword = regularGroupSearch.trim()
        if (!keyword) return true

        return Boolean(
          row.group_name.includes(keyword) ||
            staff1?.name.includes(keyword) ||
            staff2?.name.includes(keyword) ||
            memberNames.includes(keyword)
        )
      })
      .sort((a, b) => a.group_name.localeCompare(b.group_name, 'ko'))
  }, [regularGroupClasses, regularGroupMembers, children, staffs, regularGroupSearch])

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

  async function loadRegularGroupClasses() {
    const { data, error } = await supabase
      .from('regular_group_classes')
      .select('*')
      .order('group_name', { ascending: true })
      .order('weekday', { ascending: true })
      .order('time_slot', { ascending: true })
      .order('minute_slot', { ascending: true })

    if (error) throw error
    setRegularGroupClasses((data ?? []) as RegularGroupClassRow[])
  }

  async function loadRegularGroupMembers() {
    const { data, error } = await supabase
      .from('regular_group_class_members')
      .select('*')
      .order('regular_group_class_id', { ascending: true })
      .order('child_id', { ascending: true })

    if (error) throw error
    setRegularGroupMembers((data ?? []) as RegularGroupClassMemberRow[])
  }

  

  async function loadAll() {
    try {
      setLoading(true)
      setMessage('')
      await Promise.all([
        loadStaffs(),
        loadChildren(),
        loadRegularClasses(),
        loadRegularGroupClasses(),
        loadRegularGroupMembers(),
      ])
    } catch (err: any) {
      setMessage(err?.message ?? '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  

  

  

  

  function syncRegularGroupChildInput(index: number, value: string) {
    const nextInputs = [...regularGroupChildInputs]
    nextInputs[index] = value
    setRegularGroupChildInputs(nextInputs)

    const matchedIds = nextInputs
      .map((name) => {
        const matched = children.find(
          (c) => c.is_active && getDisplayName(c) === name
        )
        return matched ? matched.id : null
      })
      .filter((id): id is number => id != null)

    setRegularGroupForm((prev) => ({
      ...prev,
      childIds: Array.from(new Set(matchedIds)),
    }))
  }

  function resetRegularClassForm() {
    setEditingRegularClassId(null)
    setRegularChangeStartDate(toDateString(new Date()))
    setRegularForm({
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
  }

  function resetRegularGroupClassForm() {
    setEditingRegularGroupClassId(null)
    setRegularGroupChangeStartDate(toDateString(new Date()))
    setRegularGroupForm({
      teacherId: '',
      teacherId2: '',
      weekday: '',
      timeSlot: '09:00',
      minuteSlot: '00',
      startDate: toDateString(new Date()),
      endDate: addYearsDate(toDateString(new Date()), 5),
      groupName: '',
      note: '',
      isActive: true,
      childIds: [],
    })
    setRegularGroupTeacherQuery('')
    setRegularGroupTeacherQuery2('')
    setRegularGroupChildInputs(Array(6).fill(''))
  }

  function startEditRegularClass(row: RegularClassRow) {
    const child = children.find((c) => Number(c.id) === Number(row.child_id))
    const staff = staffs.find((s) => Number(s.id) === Number(row.teacher_id))

    setEditingRegularClassId(row.id)
    setRegularChangeStartDate(toDateString(new Date()))
    setRegularForm({
      childId: Number(row.child_id),
      teacherId: Number(row.teacher_id),
      weekday: Number(row.weekday),
      timeSlot: row.time_slot,
      minuteSlot: String(row.minute_slot ?? 0).padStart(2, '0'),
      startDate: row.start_date,
      endDate: row.end_date ?? addYearsDate(row.start_date, 5),
      voucherType: row.voucher_type ?? '일반',
      note: row.note ?? '',
      isActive: row.is_active,
    })
    setRegularChildQuery(child ? getDisplayName(child) : '')
    setRegularTeacherQuery(staff?.name ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEditRegularGroupClass(row: RegularGroupClassRow) {
    const teacher1 = staffs.find((s) => Number(s.id) === Number(row.teacher_id))
    const teacher2Id = parseAssistantTeacherId(row.note)
    const teacher2 = staffs.find((s) => Number(s.id) === Number(teacher2Id))
    const members = regularGroupMembers
      .filter((m) => Number(m.regular_group_class_id) === Number(row.id) && m.is_active)
      .map((m) => Number(m.child_id))
      .slice(0, 6)

    const nextInputs = Array(6).fill('')
    members.forEach((childId, index) => {
      const child = children.find((c) => Number(c.id) === Number(childId))
      nextInputs[index] = child ? getDisplayName(child) : ''
    })

    setEditingRegularGroupClassId(row.id)
    setRegularGroupChangeStartDate(toDateString(new Date()))
    setRegularGroupForm({
      teacherId: Number(row.teacher_id),
      teacherId2: teacher2Id ?? '',
      weekday: Number(row.weekday),
      timeSlot: row.time_slot,
      minuteSlot: String(row.minute_slot ?? 0).padStart(2, '0'),
      startDate: row.start_date,
      endDate: row.end_date ?? addYearsDate(row.start_date, 5),
      groupName: row.group_name,
      note: stripAssistantTeacherTag(row.note),
      isActive: row.is_active,
      childIds: members,
    })
    setRegularGroupTeacherQuery(teacher1?.name ?? '')
    setRegularGroupTeacherQuery2(teacher2?.name ?? '')
    setRegularGroupChildInputs(nextInputs)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSaveRegularClass() {
  try {
    const effectiveDate = editingRegularClassId ? regularChangeStartDate : regularForm.startDate
    if (!effectiveDate) return
    const result = await saveRegularChange({kind:'individual', id:editingRegularClassId || null, effectiveDate,
      childId: regularForm.childId, teacherId:regularForm.teacherId, weekday:regularForm.weekday,
      timeSlot:regularForm.timeSlot, minuteSlot:regularForm.minuteSlot,
      endDate:regularForm.endDate || addYearsDate(effectiveDate,5), voucherType:regularForm.voucherType,
      note:regularForm.note, isActive:regularForm.isActive})
    await loadAll()
    resetRegularClassForm()
    setMessage('정기수업 저장 완료: 적용일 '+effectiveDate+', 기존 '+result.cancelled+'건 취소, 새 일정 '+result.inserted+'건 생성. 이전 기록은 보존됩니다.')
  } catch(err:any) { setMessage(err.message || '정기수업 저장 실패') }
 }

  async function handleSaveRegularGroupClass() {
  try {
    const effectiveDate = editingRegularGroupClassId ? regularGroupChangeStartDate : regularGroupForm.startDate
    if (!effectiveDate) return
    const result = await saveRegularChange({kind:'group', id:editingRegularGroupClassId || null, effectiveDate,
      teacherId:regularGroupForm.teacherId, teacherId2:regularGroupForm.teacherId2 || null, weekday:regularGroupForm.weekday,
      timeSlot:regularGroupForm.timeSlot, minuteSlot:regularGroupForm.minuteSlot,
      endDate:regularGroupForm.endDate || addYearsDate(effectiveDate,5), groupName:regularGroupForm.groupName,
      childIds:regularGroupForm.childIds, note:stripAssistantTeacherTag(regularGroupForm.note || ''), isActive:regularGroupForm.isActive})
    await loadAll()
    resetRegularGroupClassForm()
    setMessage('정기 그룹수업 저장 완료: '+result.cancelled+'건 취소, '+result.inserted+'건 생성. 이전 기록은 보존됩니다.')
  } catch(err:any) { setMessage(err.message || '정기 그룹수업 저장 실패') }
 }


  

  

  async function handleDeleteRegularClass(id:number) {
  try {
    const effectiveDate=askEffectiveDate('정기수업 종료')
    if (!effectiveDate) return
    if (!window.confirm(effectiveDate+'부터 미진행 일정을 취소합니다. 이전 기록은 보존합니다.')) return
    const result=await saveRegularChange({kind:'individual',action:'stop',id,effectiveDate})
    await loadAll()
    setMessage('정기수업 종료: '+result.cancelled+'건 취소. 이전 기록은 보존됩니다.')
  } catch(err:any) { setMessage(err.message || '정기수업 종료 실패') }
 }

  async function handleDeleteRegularGroupClass(id:number) {
  try {
    const effectiveDate=askEffectiveDate('정기 그룹수업 종료')
    if (!effectiveDate) return
    if (!window.confirm(effectiveDate+'부터 미진행 그룹 일정을 취소합니다. 이전 기록은 보존합니다.')) return
    const result=await saveRegularChange({kind:'group',action:'stop',id,effectiveDate})
    await loadAll()
    setMessage('정기 그룹수업 종료: '+result.cancelled+'건 취소. 이전 기록은 보존됩니다.')
  } catch(err:any) { setMessage(err.message || '정기수업 종료 실패') }
 }

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              window.location.href = '/admin'
            }}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white shadow"
          >
            관리자 메인
          </button>

          <div className="text-lg font-bold">정기수업관리</div>
        </div>

        {message ? <p className="mb-4 text-sm text-red-500">{message}</p> : null}

        {loading ? (
          <div className="rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
            불러오는 중...
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <h2 className="mb-3 text-xl font-bold">{editingRegularClassId ? '정기수업 수정' : '정기수업 등록'}</h2>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">학생:</label>
                    <input
                      list="regular-child-list"
                      value={regularChildQuery}
                      onChange={(e) => {
                        const value = e.target.value
                        setRegularChildQuery(value)

                        const matchedChild = children.find(
                          (c) => c.is_active && getDisplayName(c) === value
                        )

                        if (matchedChild) {
                          const nextOptions = getVoucherOptionsForChild(
                            matchedChild.id,
                            children
                          )

                          setRegularForm((p) => ({
                            ...p,
                            childId: matchedChild.id,
                            voucherType: nextOptions.includes(p.voucherType)
                              ? p.voucherType
                              : '',
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

                        const matchedStaff = employeeStaffs.find(
                          (staff) => staff.name === value
                        )

                        setRegularForm((p) => ({
                          ...p,
                          teacherId: matchedStaff ? matchedStaff.id : '',
                        }))
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
                      onChange={(e) =>
                        setRegularForm((p) => ({
                          ...p,
                          weekday:
                            e.target.value === '' ? '' : Number(e.target.value),
                        }))
                      }
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
                      onChange={(e) =>
                        setRegularForm((p) => ({ ...p, timeSlot: e.target.value }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    >
                      {getHourSlots().map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={regularForm.minuteSlot}
                      onChange={(e) =>
                        setRegularForm((p) => ({
                          ...p,
                          minuteSlot: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    >
                      {getMinutesOptions().map((m) => (
                        <option key={m} value={m}>
                          {m}분
                        </option>
                      ))}
                    </select>

                    <select
                      value={regularForm.voucherType}
                      onChange={(e) =>
                        setRegularForm((p) => ({
                          ...p,
                          voucherType: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    >
                      <option value="">바우처 선택</option>
                      {getVoucherOptionsForChild(
                        regularForm.childId,
                        children
                      ).map((voucher) => (
                        <option key={voucher} value={voucher}>
                          {voucher}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">기존 시작일</div>
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
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">종료일</div>
                      <input
                        type="date"
                        value={regularForm.endDate}
                        onChange={(e) =>
                          setRegularForm((p) => ({ ...p, endDate: e.target.value }))
                        }
                        className="w-full rounded-xl border px-3 py-3 md:py-2"
                      />
                    </div>
                  </div>

                  {editingRegularClassId ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-amber-800">
                        수업변경 시작 날짜
                      </div>
                      <input
                        type="date"
                        value={regularChangeStartDate}
                        onChange={(e) => setRegularChangeStartDate(e.target.value)}
                        className="w-full rounded-xl border px-3 py-3 md:py-2"
                      />
                      <div className="mt-2 text-xs text-amber-700">
                        이 날짜 이전 수업은 그대로 두고, 이 날짜 이후 미출결 수업만 새 요일/시간으로 바뀝니다. 출결된 수업은 유지됩니다.
                      </div>
                    </div>
                  ) : null}

                  <input
                    value={regularForm.note}
                    onChange={(e) =>
                      setRegularForm((p) => ({ ...p, note: e.target.value }))
                    }
                    placeholder="메모"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveRegularClass}
                      className="flex-1 rounded-xl bg-black py-3 text-white md:py-2"
                    >
                      {editingRegularClassId ? '정기수업 수정 적용' : '정기수업 등록'}
                    </button>
                    {editingRegularClassId ? (
                      <button
                        onClick={resetRegularClassForm}
                        className="rounded-xl bg-slate-200 px-4 py-3 text-slate-700 md:py-2"
                      >
                        취소
                      </button>
                    ) : null}
                  </div>
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
                      <div className="rounded-xl border p-3 text-slate-500">
                        등록된 정기수업이 없습니다.
                      </div>
                    ) : (
                      filteredRegularClasses.map((row) => {
                        const child = children.find(
                          (c) => Number(c.id) === Number(row.child_id)
                        )
                        const staff = staffs.find(
                          (s) => Number(s.id) === Number(row.teacher_id)
                        )

                        return (
                          <div
                            key={row.id}
                            className="w-full rounded-xl border p-3 text-left hover:bg-slate-50"
                          >
                            <div className="font-medium">
                              {child?.child_name ?? `학생(${row.child_id})`} /{' '}
                              {staff?.name ?? `선생님(${row.teacher_id})`}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {getWeekdayLabel(row.weekday)} {row.time_slot}:
                              {String(row.minute_slot ?? 0).padStart(2, '0')} /{' '}
                              {row.start_date} ~ {row.end_date || '종료없음'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              바우처: {row.voucher_type ?? '일반'}
                            </div>

                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => startEditRegularClass(row)}
                                className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
                              >
                                수정
                              </button>
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

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <h2 className="mb-3 text-xl font-bold">{editingRegularGroupClassId ? '정기 그룹수업 수정' : '정기 그룹수업 등록'}</h2>

                {regularGroupDebugSteps.length > 0 && (
                  <div
                    className="rounded-xl border px-3 py-3"
                    style={{
                      marginTop: 12,
                      marginBottom: 12,
                      borderColor: '#f59e0b',
                      background: '#fff7ed',
                      color: '#9a3412',
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>정기그룹수업 디버그 로그</div>
                    {regularGroupDebugSteps.map((step, index) => (
                      <div key={`${index}-${step}`}>{step}</div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <input
                    value={regularGroupForm.groupName}
                    onChange={(e) =>
                      setRegularGroupForm((p) => ({
                        ...p,
                        groupName: e.target.value,
                      }))
                    }
                    placeholder="그룹명"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />

                  <input
                    list="regular-group-teacher-list"
                    value={regularGroupTeacherQuery}
                    onChange={(e) => {
                      const value = e.target.value
                      setRegularGroupTeacherQuery(value)

                      const matchedStaff = employeeStaffs.find(
                        (staff) => staff.name === value
                      )

                      setRegularGroupForm((p) => ({
                        ...p,
                        teacherId: matchedStaff ? matchedStaff.id : '',
                      }))
                    }}
                    placeholder="선생님1 이름 입력 또는 선택"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                  <datalist id="regular-group-teacher-list">
                    {regularGroupTeacherCandidates.map((staff) => (
                      <option key={staff.id} value={staff.name} />
                    ))}
                  </datalist>

                  <input
                    list="regular-group-teacher-list-2"
                    value={regularGroupTeacherQuery2}
                    onChange={(e) => {
                      const value = e.target.value
                      setRegularGroupTeacherQuery2(value)

                      const matchedStaff = employeeStaffs.find(
                        (staff) => staff.name === value
                      )

                      setRegularGroupForm((p) => ({
                        ...p,
                        teacherId2: matchedStaff ? matchedStaff.id : '',
                      }))
                    }}
                    placeholder="선생님2 이름 입력 또는 선택 (선택)"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />
                  <datalist id="regular-group-teacher-list-2">
                    {regularGroupTeacherCandidates2.map((staff) => (
                      <option key={staff.id} value={staff.name} />
                    ))}
                  </datalist>

                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={regularGroupForm.weekday}
                      onChange={(e) =>
                        setRegularGroupForm((p) => ({
                          ...p,
                          weekday:
                            e.target.value === '' ? '' : Number(e.target.value),
                        }))
                      }
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
                      value={regularGroupForm.timeSlot}
                      onChange={(e) =>
                        setRegularGroupForm((p) => ({
                          ...p,
                          timeSlot: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    >
                      {getHourSlots().map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={regularGroupForm.minuteSlot}
                      onChange={(e) =>
                        setRegularGroupForm((p) => ({
                          ...p,
                          minuteSlot: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    >
                      {getMinutesOptions().map((m) => (
                        <option key={m} value={m}>
                          {m}분
                        </option>
                      ))}
                    </select>

                    <input
                      type="date"
                      value={regularGroupForm.startDate}
                      onChange={(e) => {
                        const nextStart = e.target.value
                        setRegularGroupForm((p) => ({
                          ...p,
                          startDate: nextStart,
                          endDate: p.endDate || addYearsDate(nextStart, 5),
                        }))
                      }}
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">종료일</div>
                    <input
                      type="date"
                      value={regularGroupForm.endDate}
                      onChange={(e) =>
                        setRegularGroupForm((p) => ({
                          ...p,
                          endDate: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-3 md:py-2"
                    />
                  </div>

                  {editingRegularGroupClassId ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-amber-800">
                        수업변경 시작 날짜
                      </div>
                      <input
                        type="date"
                        value={regularGroupChangeStartDate}
                        onChange={(e) => setRegularGroupChangeStartDate(e.target.value)}
                        className="w-full rounded-xl border px-3 py-3 md:py-2"
                      />
                      <div className="mt-2 text-xs text-amber-700">
                        이 날짜 이전 수업은 그대로 두고, 이 날짜 이후 미출결 그룹수업만 새 요일/시간/선생님/학생으로 바뀝니다. 출결된 수업은 유지됩니다.
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 md:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className="space-y-1">
                        <div className="text-xs text-slate-500">
                          {index + 1}번학생
                        </div>
                        <input
                          list={`regular-group-child-list-${index}`}
                          value={regularGroupChildInputs[index] ?? ''}
                          onChange={(e) =>
                            syncRegularGroupChildInput(index, e.target.value)
                          }
                          placeholder={`학생${index + 1}`}
                          className="w-full rounded-xl border px-3 py-2"
                        />
                        <datalist id={`regular-group-child-list-${index}`}>
                          {regularGroupChildCandidates.map((child) => (
                            <option key={child.id} value={getDisplayName(child)} />
                          ))}
                        </datalist>
                      </div>
                    ))}
                  </div>

                  <input
                    value={regularGroupForm.note}
                    onChange={(e) =>
                      setRegularGroupForm((p) => ({
                        ...p,
                        note: e.target.value,
                      }))
                    }
                    placeholder="메모"
                    className="w-full rounded-xl border px-3 py-3 md:py-2"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveRegularGroupClass}
                      className="flex-1 rounded-xl bg-black py-3 text-white md:py-2"
                    >
                      {editingRegularGroupClassId ? '정기 그룹수업 수정 적용' : '정기 그룹수업 등록'}
                    </button>
                    {editingRegularGroupClassId ? (
                      <button
                        onClick={resetRegularGroupClassForm}
                        className="rounded-xl bg-slate-200 px-4 py-3 text-slate-700 md:py-2"
                      >
                        취소
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <h2 className="mb-3 text-xl font-bold">정기 그룹수업 목록</h2>
                <input
                  value={regularGroupSearch}
                  onChange={(e) => setRegularGroupSearch(e.target.value)}
                  placeholder="그룹명 / 선생님 / 학생 검색"
                  className="mb-3 w-full rounded-xl border px-3 py-3 md:py-2"
                />

                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {filteredRegularGroupClasses.length === 0 ? (
                      <div className="rounded-xl border p-3 text-slate-500">
                        등록된 정기 그룹수업이 없습니다.
                      </div>
                    ) : (
                      filteredRegularGroupClasses.map((row) => {
                        const staff1 = staffs.find(
                          (s) => Number(s.id) === Number(row.teacher_id)
                        )
                        const staff2Id = parseAssistantTeacherId(row.note)
                        const staff2 = staffs.find(
                          (s) => Number(s.id) === Number(staff2Id)
                        )

                        const members = regularGroupMembers.filter(
                          (m) =>
                            Number(m.regular_group_class_id) === Number(row.id) &&
                            m.is_active
                        )

                        const memberNames = members
                          .map(
                            (m) =>
                              children.find(
                                (c) => Number(c.id) === Number(m.child_id)
                              )?.child_name ?? ''
                          )
                          .filter(Boolean)
                          .join(', ')

                        return (
                          <div key={row.id} className="rounded-xl border p-3">
                            <div className="font-medium">
                              {row.group_name} / {staff1?.name ?? `선생님(${row.teacher_id})`}
                              {staff2 ? `, ${staff2.name}` : ''}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {getWeekdayLabel(row.weekday)} {row.time_slot}:
                              {String(row.minute_slot ?? 0).padStart(2, '0')} /{' '}
                              {row.start_date} ~ {row.end_date || '종료없음'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              학생: {memberNames || '-'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              메모: {stripAssistantTeacherTag(row.note) || '-'}
                            </div>

                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => startEditRegularGroupClass(row)}
                                className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
                              >
                                수정
                              </button>
                              <button
                                onClick={() =>
                                  void handleDeleteRegularGroupClass(row.id)
                                }
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
          </>
        )}
      </div>
    </main>
  )
}
