import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type VoucherType = '일반' | '디딤' | '아청심' | '드림스타트' | '배움' | '그룹'
type ScheduleStatus = '출석' | '보강' | '결석' | '당일결석'

type ChildRow = {
  id: string
  name: string
}

type StaffRow = {
  id: string
  name: string
}

type WeeklyScheduleRow = {
  id: string
  staff_id: string
  child_id: string
  schedule_date: string
  time_slot: string
  memo?: string | null
}

type ClassLogRow = {
  id: string
  staff_id: string
  child_id: string
  class_date: string
  class_time: string
  status: string
  note?: string | null
}

type ScheduleItem = {
  id: string
  date: string
  timeSlot: string
  staffId: string
  staffName: string
  childId: string
  childName: string
  status: ScheduleStatus
  voucherType: VoucherType
  memo?: string
}

const TABLES = {
  children: 'children',
  staff: 'staff_accounts',
  weekly: 'weekly_schedules',
  classLogs: 'class_logs',
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
    throw new Error('Supabase 환경변수가 없습니다.')
  }

  return createClient(url, anonKey)
}

function getTodayInKST() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const kst = new Date(utc + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getDayLabel(date: string) {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return days[d.getDay()]
}

function normalizeStatus(value: unknown): ScheduleStatus {
  const raw = String(value ?? '').trim()
  if (raw === '출석') return '출석'
  if (raw === '보강') return '보강'
  if (raw === '결석') return '결석'
  if (raw === '당일결석') return '당일결석'
  return '출석'
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

function formatTimeSlot(value: string) {
  if (!value) return ''
  if (value.length >= 5 && value.includes(':')) return value.slice(0, 5)
  return value
}

function formatClassTimeToSlot(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function buildMap<T extends { id: string; name: string }>(rows: T[]) {
  return new Map<string, string>(rows.map((row) => [String(row.id), row.name]))
}

function joinOrDash(values: string[]) {
  return values.length ? values.join(', ') : '-'
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }> | { date?: string }
}) {
  const resolved =
    searchParams && typeof (searchParams as any).then === 'function'
      ? await (searchParams as Promise<{ date?: string }>)
      : (searchParams as { date?: string } | undefined)

  const selectedDate = resolved?.date || getTodayInKST()
  const supabase = getSupabase()

  const [
    { data: childrenRaw, error: childrenError },
    { data: staffRaw, error: staffError },
    { data: weeklyRaw, error: weeklyError },
    { data: classLogsRaw, error: classLogsError },
  ] = await Promise.all([
    supabase.from(TABLES.children).select('id, name, vouchers'),
    supabase.from(TABLES.staff).select('id, name'),
    supabase
      .from(TABLES.weekly)
      .select('*')
      .eq('schedule_date', selectedDate)
      .order('time_slot', { ascending: true }),
    supabase
      .from(TABLES.classLogs)
      .select('*')
      .eq('class_date', selectedDate),
  ])

  if (childrenError) {
    return <div className="p-6 text-red-600">children 조회 오류: {childrenError.message}</div>
  }
  if (staffError) {
    return <div className="p-6 text-red-600">staff_accounts 조회 오류: {staffError.message}</div>
  }
  if (weeklyError) {
    return <div className="p-6 text-red-600">weekly_schedules 조회 오류: {weeklyError.message}</div>
  }
  if (classLogsError) {
    return <div className="p-6 text-red-600">class_logs 조회 오류: {classLogsError.message}</div>
  }

  const children = (childrenRaw ?? []) as ChildRow[]
  const staff = (staffRaw ?? []) as StaffRow[]
  const weeklyRows = (weeklyRaw ?? []) as WeeklyScheduleRow[]
  const classLogs = (classLogsRaw ?? []) as ClassLogRow[]

  const childNameMap = buildMap(children)
  const staffNameMap = buildMap(staff)

  // class_logs를 staff_id + child_id + date 기준으로 상태 매핑
  const classLogMap = new Map<string, ClassLogRow>()
  for (const row of classLogs) {
    const key = `${row.staff_id}-${row.child_id}-${row.class_date}`
    classLogMap.set(key, row)
  }

  // children 테이블에 vouchers가 있으면 첫 번째 바우처를 우선 표시
  const voucherMap = new Map<string, VoucherType>()
  for (const row of (childrenRaw ?? []) as any[]) {
    const vouchers = Array.isArray(row.vouchers) ? row.vouchers : []
    const firstVoucher = vouchers.length ? normalizeVoucherType(vouchers[0]) : '일반'
    voucherMap.set(String(row.id), firstVoucher)
  }

  const items: ScheduleItem[] = weeklyRows.map((row) => {
    const key = `${row.staff_id}-${row.child_id}-${row.schedule_date}`
    const matchedLog = classLogMap.get(key)

    return {
      id: String(row.id),
      date: row.schedule_date,
      timeSlot: formatTimeSlot(row.time_slot),
      staffId: String(row.staff_id),
      staffName: staffNameMap.get(String(row.staff_id)) ?? String(row.staff_id),
      childId: String(row.child_id),
      childName: childNameMap.get(String(row.child_id)) ?? String(row.child_id),
      status: matchedLog ? normalizeStatus(matchedLog.status) : '출석',
      voucherType: voucherMap.get(String(row.child_id)) ?? '일반',
      memo: row.memo ?? undefined,
    }
  })

  const getItemsByTime = (timeSlot: string) =>
    items.filter((item) => item.timeSlot === timeSlot)

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">관리자 시간표</h1>
          <div className="text-sm text-gray-600">
            {selectedDate} {getDayLabel(selectedDate)}
          </div>
          <div className="text-xs text-gray-500">조회건수: {items.length}</div>
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
        <table className="w-full border-collapse border bg-white">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50 w-16 text-sm whitespace-nowrap">시간</th>
              <th className="border px-2 py-1 bg-gray-50 text-sm">선생님 배정</th>
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((timeSlot) => {
              const slotItems = getItemsByTime(timeSlot)

              return (
                <tr key={timeSlot}>
                  <td className="border px-2 py-1 text-xs font-medium bg-gray-50 w-16 whitespace-nowrap align-top">
                    {timeSlot}
                  </td>
                  <td className="border px-2 py-1 align-top text-xs">
                    {slotItems.length === 0 ? (
                      <div className="text-xs text-gray-400">-</div>
                    ) : (
                      <div className="space-y-1">
                        {slotItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded border bg-gray-50 px-2 py-1 space-y-0.5"
                          >
                            <div className="font-semibold">{item.staffName}</div>
                            <div>{item.childName}</div>
                            <div>{item.voucherType}</div>
                            <div>{item.status}</div>
                            {item.memo ? <div className="text-gray-500">{item.memo}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}