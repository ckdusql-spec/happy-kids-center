import { createClient } from '@supabase/supabase-js'

type VoucherType = '일반' | '디딤' | '아청심' | '드림스타트' | '배움' | '그룹'
type ScheduleStatus = '출석' | '보강' | '결석' | '당일결석'
type ClassType = 'individual' | 'group'

type ScheduleEntry = {
  id: string
  date: string
  timeSlot: string
  roomNumber: number
  teacherId: string
  teacherName: string
  classType: ClassType
  childId?: string | null
  childIds?: string[]
  childNames: string[]
  voucherType: VoucherType
  status: ScheduleStatus
}

const TABLES = {
  schedules: 'schedule_entries',
  children: 'children',
}

const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
]

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)가 없습니다.')
  }

  return createClient(url, anonKey)
}

function getTodayInKST() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getDayLabel(date: string) {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return days[d.getDay()]
}

function normalizeVoucherType(value: unknown): VoucherType {
  const raw = String(value ?? '').trim()

  if (raw === '교육청' || raw === '교육청 바우처' || raw === '디딤') return '디딤'
  if (raw === '아청심' || raw === '아청심 바우처') return '아청심'
  if (raw === '방과후' || raw === '방과후 바우처' || raw === '드림스타트') return '드림스타트'
  if (raw === '구구' || raw === '구구 바우처' || raw === '배움') return '배움'
  if (raw === '그룹' || raw === '그룹수업') return '그룹'
  return '일반'
}

function normalizeStatus(value: unknown): ScheduleStatus {
  const raw = String(value ?? '').trim()
  if (raw === '출석') return '출석'
  if (raw === '보강') return '보강'
  if (raw === '결석') return '결석'
  if (raw === '당일결석') return '당일결석'
  return '출석'
}

function normalizeClassType(value: unknown): ClassType {
  const raw = String(value ?? '').trim()
  if (raw === 'group' || raw === '그룹' || raw === 'group_class') return 'group'
  return 'individual'
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v))
}

async function getChildNameMap(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from(TABLES.children)
    .select('id, name')

  if (error) {
    return new Map<string, string>()
  }

  return new Map<string, string>(
    (data ?? []).map((row: any) => [String(row.id), String(row.name ?? '')]),
  )
}

function normalizeScheduleEntry(row: any, childNameMap: Map<string, string>): ScheduleEntry {
  const childId = row.child_id ? String(row.child_id) : null
  const childIds = safeStringArray(row.child_ids ?? row.student_ids ?? [])

  const childNames =
    normalizeClassType(row.class_type) === 'group'
      ? childIds.map((id) => childNameMap.get(id) ?? id).filter(Boolean)
      : childId
        ? [childNameMap.get(childId) ?? childId]
        : []

  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    timeSlot: String(row.time_slot ?? row.time ?? ''),
    roomNumber: Number(row.room_number ?? row.room ?? 0),
    teacherId: String(row.teacher_id ?? ''),
    teacherName: String(row.teacher_name ?? row.teacher ?? ''),
    classType: normalizeClassType(row.class_type),
    childId,
    childIds,
    childNames,
    voucherType: normalizeVoucherType(row.voucher_type),
    status: normalizeStatus(row.status),
  }
}

function renderCell(entry?: ScheduleEntry) {
  if (!entry) {
    return <div className="text-sm text-gray-400">-</div>
  }

  const studentText =
    entry.classType === 'group'
      ? entry.childNames.length
        ? `그룹: ${entry.childNames.join(', ')}`
        : '그룹수업'
      : entry.childNames[0] ?? '-'

  return (
    <div className="space-y-1 text-sm leading-5">
      <div className="font-semibold">{entry.teacherName || '선생님 미입력'}</div>
      <div>{entry.classType === 'group' ? '그룹수업' : '개인수업'}</div>
      <div>{studentText}</div>
      <div>{entry.voucherType}</div>
      <div>{entry.status}</div>
    </div>
  )
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedDate = resolvedSearchParams?.date || getTodayInKST()

  const supabase = getSupabase()
  const childNameMap = await getChildNameMap(supabase)

  const { data, error } = await supabase
    .from(TABLES.schedules)
    .select('*')
    .eq('date', selectedDate)
    .order('time_slot', { ascending: true })
    .order('room_number', { ascending: true })

  if (error) {
    return (
      <div className="p-6 text-red-600">
        schedule_entries 조회 오류: {error.message}
      </div>
    )
  }

  const entries: ScheduleEntry[] = (data ?? []).map((row: any) =>
    normalizeScheduleEntry(row, childNameMap),
  )

  const findEntry = (timeSlot: string, roomNumber: number) =>
    entries.find(
      (entry) =>
        entry.date === selectedDate &&
        entry.timeSlot === timeSlot &&
        entry.roomNumber === roomNumber,
    )

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">관리자 시간표</h1>
          <div className="text-sm text-gray-600">
            {selectedDate} {getDayLabel(selectedDate)}
          </div>
        </div>

        <form className="flex items-center gap-2" method="get">
          <input
            className="rounded border px-3 py-2"
            type="date"
            name="date"
            defaultValue={selectedDate}
          />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            날짜보기
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse border bg-white">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-50">시간</th>
              {[1, 2, 3, 4, 5, 6, 7].map((room) => (
                <th key={room} className="border p-2 bg-gray-50">
                  {room}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((timeSlot) => (
              <tr key={timeSlot}>
                <td className="border p-2 font-medium bg-gray-50">{timeSlot}</td>
                {[1, 2, 3, 4, 5, 6, 7].map((roomNumber) => (
                  <td
                    key={`${timeSlot}-${roomNumber}`}
                    className="border p-2 align-top h-28"
                  >
                    {renderCell(findEntry(timeSlot, roomNumber))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}