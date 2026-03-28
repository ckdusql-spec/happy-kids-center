'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ScheduleEntryRow = {
  id: string
  date: string
  time_slot: string
  minute_slot: number | null
  teacher_id: string
  teacher_name: string | null
  child_id: number | null
  voucher_type: string | null
  note: string | null
  is_active: boolean | null
}

type StaffRow = {
  id: string
  name: string
}

type ChildRow = {
  id: number
  child_name: string
  birth_date?: string | null
}

type CellItem = {
  entryId: string
  childId: number
  childName: string
  ageText: string
  voucherType: string
  note: string
  minuteSlot: number
}

type TeacherColumn = {
  teacherId: string
  teacherName: string
}

function formatDateInput(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getAgeText(birthDate?: string | null) {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return ''

  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  const dayDiff = now.getDate() - birth.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--
  }

  return String(age)
}

function hourKeyFromTimeSlot(timeSlot: string) {
  if (!timeSlot) return ''
  const match = timeSlot.match(/^(\d{2}):/)
  if (!match) return timeSlot
  return `${match[1]}:00`
}

function minuteLabel(minute: number | null | undefined) {
  return String(Number(minute ?? 0)).padStart(2, '0')
}

export default function AdminDailySchedule() {
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [teachers, setTeachers] = useState<TeacherColumn[]>([])
  const [timeSlots, setTimeSlots] = useState<string[]>([])
  const [cellMap, setCellMap] = useState<Record<string, CellItem[]>>({})

  async function loadData(date: string) {
    try {
      setLoading(true)
      setError('')

      const { data: scheduleData, error: scheduleError } = await supabase
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
          note,
          is_active
        `)
        .eq('date', date)
        .eq('is_active', true)
        .order('time_slot', { ascending: true })
        .order('minute_slot', { ascending: true })

      if (scheduleError) throw scheduleError

      const rows = (scheduleData ?? []) as ScheduleEntryRow[]

      if (rows.length === 0) {
        setTeachers([])
        setTimeSlots([])
        setCellMap({})
        return
      }

      const teacherIds = [...new Set(rows.map((v) => String(v.teacher_id)).filter(Boolean))]
      const childIds = [
        ...new Set(
          rows.map((v) => Number(v.child_id)).filter((v) => Number.isFinite(v) && v > 0)
        ),
      ]

      const { data: staffData, error: staffError } = await supabase
        .from('staff_accounts')
        .select('id, name')
        .in('id', teacherIds)

      if (staffError) throw staffError

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('id, child_name, birth_date')
        .in('id', childIds)

      if (childError) throw childError

      const staffMap = new Map<string, StaffRow>()
      ;((staffData ?? []) as StaffRow[]).forEach((row) => {
        staffMap.set(String(row.id), row)
      })

      const childMap = new Map<number, ChildRow>()
      ;((childData ?? []) as ChildRow[]).forEach((row) => {
        childMap.set(Number(row.id), row)
      })

      const teacherList: TeacherColumn[] = teacherIds
        .map((id) => ({
          teacherId: String(id),
          teacherName: staffMap.get(String(id))?.name ?? rows.find((r) => String(r.teacher_id) === String(id))?.teacher_name ?? `선생님(${id})`,
        }))
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko'))

      const slotSet = new Set<string>()
      const nextCellMap: Record<string, CellItem[]> = {}

      rows.forEach((row) => {
        const timeKey = hourKeyFromTimeSlot(row.time_slot)
        const teacherId = String(row.teacher_id)
        const childId = Number(row.child_id ?? 0)
        const child = childMap.get(childId)
        const mapKey = `${timeKey}__${teacherId}`

        slotSet.add(timeKey)

        if (!nextCellMap[mapKey]) {
          nextCellMap[mapKey] = []
        }

        nextCellMap[mapKey].push({
          entryId: row.id,
          childId,
          childName: child?.child_name ?? `학생(${childId})`,
          ageText: getAgeText(child?.birth_date),
          voucherType: row.voucher_type ?? '',
          note: row.note ?? '',
          minuteSlot: Number(row.minute_slot ?? 0),
        })
      })

      Object.keys(nextCellMap).forEach((key) => {
        nextCellMap[key].sort((a, b) => {
          if (a.minuteSlot !== b.minuteSlot) return a.minuteSlot - b.minuteSlot
          return a.childName.localeCompare(b.childName, 'ko')
        })
      })

      const sortedSlots = Array.from(slotSet).sort((a, b) => a.localeCompare(b))

      setTeachers(teacherList)
      setTimeSlots(sortedSlots)
      setCellMap(nextCellMap)
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? '데이터를 불러오지 못했습니다.')
      setTeachers([])
      setTimeSlots([])
      setCellMap({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(selectedDate)
  }, [selectedDate])

  const totalCount = useMemo(() => {
    return Object.values(cellMap).reduce((sum, arr) => sum + arr.length, 0)
  }, [cellMap])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">일별 보기</h1>
            <p className="mt-1 text-sm text-gray-500">
              가로는 선생님, 세로는 시간이며 시간표 입력 기준으로 표시됩니다.
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

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <div className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
            선생님 수 <span className="font-semibold">{teachers.length}</span>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
            시간 수 <span className="font-semibold">{timeSlots.length}</span>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
            학생 배정 수 <span className="font-semibold">{totalCount}</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
          불러오는 중...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl bg-white p-8 text-center text-red-500 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && teachers.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
          선택한 날짜에 시간표 데이터가 없습니다.
        </div>
      )}

      {!loading && !error && teachers.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="min-w-[900px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[90px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-700">
                  시간
                </th>

                {teachers.map((teacher) => (
                  <th
                    key={teacher.teacherId}
                    className="top-0 z-10 min-w-[220px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-900"
                  >
                    {teacher.teacherName}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {timeSlots.map((time) => (
                <tr key={time}>
                  <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-3 text-center text-sm font-semibold text-gray-700">
                    {time}
                  </td>

                  {teachers.map((teacher) => {
                    const key = `${time}__${teacher.teacherId}`
                    const items = cellMap[key] ?? []

                    return (
                      <td key={key} className="align-top border-b border-r px-2 py-2">
                        {items.length === 0 ? (
                          <div className="min-h-[56px]" />
                        ) : (
                          <div className="flex min-h-[56px] flex-col gap-2">
                            {items.map((item) => (
                              <div
                                key={item.entryId}
                                className="rounded-xl border bg-white px-2 py-2 shadow-sm"
                              >
                                <div className="text-sm font-semibold text-gray-900">
                                  [{minuteLabel(item.minuteSlot)}] {item.childName}
                                  {item.ageText ? ` (${item.ageText})` : ''}
                                </div>

                                <div className="mt-1 flex flex-wrap gap-1">
                                  {item.voucherType ? (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                      {item.voucherType}
                                    </span>
                                  ) : null}

                                  {item.note ? (
                                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-[11px] text-yellow-700">
                                      메모
                                    </span>
                                  ) : null}
                                </div>
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
      )}
    </div>
  )
}