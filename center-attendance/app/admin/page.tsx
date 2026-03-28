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
  role: string | null
  is_active: boolean | null
}

type ChildRow = {
  id: number
  child_name: string
  is_active: boolean | null
}

type TeacherGroupedItem = {
  logId: number
  childId: number
  childName: string
  classTime: string
  status: string
  note: string
}

type TeacherGrouped = {
  staffId: number
  staffName: string
  items: TeacherGroupedItem[]
}

function formatDateToKSTInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatClassTime(value: string) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatStatus(status: string) {
  if (status === 'attended') return '출석'
  if (status === 'absent') return '결석'
  if (status === 'makeup') return '보강'
  return status || '-'
}

export default function TeacherStudentAssignmentPage() {
  const [selectedDate, setSelectedDate] = useState(formatDateToKSTInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupedData, setGroupedData] = useState<TeacherGrouped[]>([])

  async function loadTeacherAssignments(date: string) {
    try {
      setLoading(true)
      setError('')

      // 1) 해당 날짜 수업 로그 조회
      const { data: logs, error: logsError } = await supabase
        .from('class_logs')
        .select('id, staff_id, child_id, class_date, class_time, status, note')
        .eq('class_date', date)
        .order('class_time', { ascending: true })

      if (logsError) {
        throw logsError
      }

      const classLogs = (logs ?? []) as ClassLogRow[]

      if (classLogs.length === 0) {
        setGroupedData([])
        return
      }

      // 2) staff_id / child_id 추출
      const uniqueStaffIds = [...new Set(classLogs.map((row) => row.staff_id).filter(Boolean))]
      const uniqueChildIds = [...new Set(classLogs.map((row) => row.child_id).filter(Boolean))]

      // 3) 선생님 정보 조회
      const { data: staffs, error: staffsError } = await supabase
        .from('staff_accounts')
        .select('id, name, role, is_active')
        .in('id', uniqueStaffIds)

      if (staffsError) {
        throw staffsError
      }

      // 4) 학생 정보 조회
      const { data: children, error: childrenError } = await supabase
        .from('children')
        .select('id, child_name, is_active')
        .in('id', uniqueChildIds)

      if (childrenError) {
        throw childrenError
      }

      const staffMap = new Map<number, StaffRow>()
      ;((staffs ?? []) as StaffRow[]).forEach((staff) => {
        staffMap.set(Number(staff.id), staff)
      })

      const childMap = new Map<number, ChildRow>()
      ;((children ?? []) as ChildRow[]).forEach((child) => {
        childMap.set(Number(child.id), child)
      })

      // 5) 선생님별 그룹핑
      const groupedMap = new Map<number, TeacherGrouped>()

      classLogs.forEach((log) => {
        const staffId = Number(log.staff_id)
        const childId = Number(log.child_id)

        if (!groupedMap.has(staffId)) {
          groupedMap.set(staffId, {
            staffId,
            staffName: staffMap.get(staffId)?.name ?? `선생님(${staffId})`,
            items: [],
          })
        }

        groupedMap.get(staffId)!.items.push({
          logId: log.id,
          childId,
          childName: childMap.get(childId)?.child_name ?? `학생(${childId})`,
          classTime: log.class_time,
          status: log.status ?? '',
          note: log.note ?? '',
        })
      })

      // 6) 시간순 정렬 + 선생님명 정렬
      const result = Array.from(groupedMap.values())
        .map((teacher) => ({
          ...teacher,
          items: teacher.items.sort((a, b) => {
            const at = new Date(a.classTime).getTime()
            const bt = new Date(b.classTime).getTime()
            return at - bt
          }),
        }))
        .sort((a, b) => a.staffName.localeCompare(b.staffName, 'ko'))

      setGroupedData(result)
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? '데이터를 불러오지 못했습니다.')
      setGroupedData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeacherAssignments(selectedDate)
  }, [selectedDate])

  const totalStudents = useMemo(() => {
    return groupedData.reduce((sum, teacher) => sum + teacher.items.length, 0)
  }, [groupedData])

  return (
    <div className="min-h-screen bg-[#f7f8fb] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">선생님별 학생 배정</h1>
              <p className="mt-1 text-sm text-gray-500">
                해당 날짜에 수업이 있는 선생님만 표시됩니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">날짜</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
            <div className="rounded-full bg-gray-100 px-3 py-1">
              선생님 수: <span className="font-semibold">{groupedData.length}</span>
            </div>
            <div className="rounded-full bg-gray-100 px-3 py-1">
              학생 배정 수: <span className="font-semibold">{totalStudents}</span>
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

        {!loading && !error && groupedData.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
            선택한 날짜에 수업 데이터가 없습니다.
          </div>
        )}

        {!loading && !error && groupedData.length > 0 && (
          <div className="grid gap-4">
            {groupedData.map((teacher) => (
              <div
                key={teacher.staffId}
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="border-b bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">{teacher.staffName}</h2>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                      {teacher.items.length}명
                    </span>
                  </div>
                </div>

                <div className="divide-y">
                  {teacher.items.map((item) => (
                    <div
                      key={item.logId}
                      className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-[72px] rounded-lg bg-gray-100 px-2 py-1 text-center text-sm font-semibold text-gray-700">
                          {formatClassTime(item.classTime)}
                        </div>
                        <div className="text-base font-medium text-gray-900">
                          {item.childName}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                          {formatStatus(item.status)}
                        </span>
                        {item.note ? (
                          <span className="rounded-full bg-yellow-50 px-3 py-1 text-sm text-yellow-700">
                            메모: {item.note}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}