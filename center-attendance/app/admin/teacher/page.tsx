'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ClassLogRow = {
  id: number
  staff_id: number
  child_id: number
  class_date: string
  class_time: string
  status: string | null
  note: string | null
}

type StaffRow = {
  id: number
  name: string
}

type ChildRow = {
  id: number
  child_name: string
}

type CellItem = {
  logId: number
  childId: number
  childName: string
  status: string
  note: string
  classTime: string
}

type TeacherColumn = {
  staffId: number
  staffName: string
}

function formatDateInput(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getTimeKey(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || value
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getStatusLabel(status: string) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'makeup') return '보강'
  return status || ''
}

function getStatusClass(status: string) {
  if (status === 'attended' || status === 'makeup') {
    return 'bg-blue-50 text-blue-700 border-blue-200'
  }
  if (status === 'absent') {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

export default function TeacherPage() {
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

      const { data: logsData, error: logsError } = await supabase
        .from('class_logs')
        .select('id, staff_id, child_id, class_date, class_time, status, note')
        .eq('class_date', date)
        .order('class_time', { ascending: true })

      if (logsError) throw logsError

      const logs = (logsData ?? []) as ClassLogRow[]

      if (logs.length === 0) {
        setTeachers([])
        setTimeSlots([])
        setCellMap({})
        return
      }

      const staffIds = [...new Set(logs.map((v) => Number(v.staff_id)).filter(Boolean))]
      const childIds = [...new Set(logs.map((v) => Number(v.child_id)).filter(Boolean))]

      const { data: staffData, error: staffError } = await supabase
        .from('staff_accounts')
        .select('id, name')
        .in('id', staffIds)

      if (staffError) throw staffError

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('id, child_name')
        .in('id', childIds)

      if (childError) throw childError

      const staffMap = new Map<number, StaffRow>()
      ;((staffData ?? []) as StaffRow[]).forEach((row) => {
        staffMap.set(Number(row.id), row)
      })

      const childMap = new Map<number, ChildRow>()
      ;((childData ?? []) as ChildRow[]).forEach((row) => {
        childMap.set(Number(row.id), row)
      })

      const teacherList: TeacherColumn[] = staffIds
        .map((id) => ({
          staffId: id,
          staffName: staffMap.get(id)?.name ?? `선생님(${id})`,
        }))
        .sort((a, b) => a.staffName.localeCompare(b.staffName, 'ko'))

      const slotSet = new Set<string>()
      const nextCellMap: Record<string, CellItem[]> = {}

      logs.forEach((log) => {
        const timeKey = getTimeKey(log.class_time)
        const staffId = Number(log.staff_id)
        const childId = Number(log.child_id)
        const mapKey = `${timeKey}__${staffId}`

        slotSet.add(timeKey)

        if (!nextCellMap[mapKey]) {
          nextCellMap[mapKey] = []
        }

        nextCellMap[mapKey].push({
          logId: Number(log.id),
          childId,
          childName: childMap.get(childId)?.child_name ?? `학생(${childId})`,
          status: log.status ?? '',
          note: log.note ?? '',
          classTime: log.class_time,
        })
      })

      Object.keys(nextCellMap).forEach((key) => {
        nextCellMap[key].sort((a, b) => a.childName.localeCompare(b.childName, 'ko'))
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
    <div className="min-h-screen bg-[#f6f8fb] p-4 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">선생님별 전체시간표</h1>
              <p className="mt-1 text-sm text-gray-500">
                가로는 선생님, 세로는 시간입니다. 각 칸에 학생이 표시됩니다.
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
            선택한 날짜에 수업 데이터가 없습니다.
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
                      key={teacher.staffId}
                      className="top-0 z-10 min-w-[220px] border-b border-r bg-gray-50 px-3 py-3 text-center text-sm font-bold text-gray-900"
                    >
                      {teacher.staffName}
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
                      const key = `${time}__${teacher.staffId}`
                      const items = cellMap[key] ?? []

                      return (
                        <td
                          key={key}
                          className="align-top border-b border-r px-2 py-2"
                        >
                          {items.length === 0 ? (
                            <div className="min-h-[56px]" />
                          ) : (
                            <div className="flex min-h-[56px] flex-col gap-2">
                              {items.map((item) => (
                                <div
                                  key={item.logId}
                                  className="rounded-xl border bg-white px-2 py-2 shadow-sm"
                                >
                                  <div className="text-sm font-semibold text-gray-900">
                                    {item.childName}
                                  </div>

                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.status ? (
                                      <span
                                        className={`rounded-full border px-2 py-0.5 text-[11px] ${getStatusClass(item.status)}`}
                                      >
                                        {getStatusLabel(item.status)}
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
    </div>
  )
}