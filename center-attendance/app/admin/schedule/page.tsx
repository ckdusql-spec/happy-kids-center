import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type VoucherType = '일반' | '디딤' | '아청심' | '드림스타트' | '배움' | '그룹'
type ScheduleStatus = '출석' | '보강' | '결석' | '당일결석'

type ChildDbRow = {
  id: number | string
  child_name?: string | null
  voucher_yn?: boolean | string | null
  monthly_limit?: number | null
  is_active?: boolean | null
  notes?: string | null
  [key: string]: unknown
}

type StaffDbRow = {
  id: number | string
  name?: string | null
  staff_name?: string | null
  username?: string | null
  user_name?: string | null
  display_name?: string | null
  [key: string]: unknown
}

type WeeklyScheduleDbRow = {
  id: number | string
  staff_id: number | string
  child_id: number | string
  schedule_date: string
  time_slot: string
  memo?: string | null
  [key: string]: unknown
}

type ClassLogDbRow = {
  id: number | string
  staff_id: number | string
  child_id: number | string
  class_date: string
  class_time?: string | null
  status?: string | null
  note?: string | null
  [key: string]: unknown
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

function formatClassTimeToSlot(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function getChildName(row: ChildDbRow) {
  return String(row.child_name ?? '이름없음')
}

function getStaffName(row: StaffDbRow) {
  return String(
    row.name ??
      row.staff_name ??
      row.username ??
      row.user_name ??
      row.display_name ??
      '선생님',
  )
}

function getVoucherFromChild(row: ChildDbRow): VoucherType {
  const raw = row['voucher_type'] ?? row['voucher_name'] ?? row['voucher']

  if (raw) {
    return normalizeVoucherType(raw)
  }

  const voucherYn = row.voucher_yn
  if (voucherYn === true || voucherYn === 'true' || voucherYn === 'Y' || voucherYn === 'y') {
    return '디딤'
  }

  return '일반'
}

function buildMap<T>(rows: T[], getId: (row: T) => string, getLabel: (row: T) => string) {
  return new Map<string, string>(rows.map((row) => [getId(row), getLabel(row)]))
}

function buildVoucherMap(rows: ChildDbRow[]) {
  return new Map<string, VoucherType>(
    rows.map((row) => [String(row.id), getVoucherFromChild(row)]),
  )
}

function renderStatusBadge(status: ScheduleStatus) {
  const className =
    status === '출석'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === '보강'
        ? 'bg-sky-50 text-sky-700 border-sky-200'
        : status === '결석'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-red-50 text-red-700 border-red-200'

  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${className}`}>
      {status}
    </span>
  )
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
    supabase.from(TABLES.children).select('*'),
    supabase.from(TABLES.staff).select('*'),
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

  const children = (childrenRaw ?? []) as ChildDbRow[]
  const staff = (staffRaw ?? []) as StaffDbRow[]
  const weeklyRows = (weeklyRaw ?? []) as WeeklyScheduleDbRow[]
  const classLogs = (classLogsRaw ?? []) as ClassLogDbRow[]

  const childNameMap = buildMap(
    children,
    (row) => String(row.id),
    (row) => getChildName(row),
  )

  const staffNameMap = buildMap(
    staff,
    (row) => String(row.id),
    (row) => getStaffName(row),
  )

  const voucherMap = buildVoucherMap(children)

  // class_logs를 같은 선생님/학생/날짜 기준으로 상태 매핑
  // 시간까지 있으면 시간도 맞춰보고, 없으면 날짜 기준으로 사용
  const classLogMap = new Map<string, ClassLogDbRow>()
  for (const row of classLogs) {
    const timeSlot = formatClassTimeToSlot(row.class_time)
    const keyWithTime = `${row.staff_id}-${row.child_id}-${row.class_date}-${timeSlot}`
    const keyWithoutTime = `${row.staff_id}-${row.child_id}-${row.class_date}`
    if (timeSlot) classLogMap.set(keyWithTime, row)
    classLogMap.set(keyWithoutTime, row)
  }

  const items: ScheduleItem[] = weeklyRows.map((row) => {
    const timeSlot = formatTimeSlot(row.time_slot)
    const keyWithTime = `${row.staff_id}-${row.child_id}-${row.schedule_date}-${timeSlot}`
    const keyWithoutTime = `${row.staff_id}-${row.child_id}-${row.schedule_date}`
    const matchedLog = classLogMap.get(keyWithTime) ?? classLogMap.get(keyWithoutTime)

    return {
      id: String(row.id),
      date: String(row.schedule_date),
      timeSlot,
      staffId: String(row.staff_id),
      staffName: staffNameMap.get(String(row.staff_id)) ?? String(row.staff_id),
      childId: String(row.child_id),
      childName: childNameMap.get(String(row.child_id)) ?? String(row.child_id),
      status: matchedLog ? normalizeStatus(matchedLog.status) : '출석',
      voucherType: voucherMap.get(String(row.child_id)) ?? '일반',
      memo: row.memo ? String(row.memo) : undefined,
    }
  })

  const getItemsByTime = (timeSlot: string) =>
    items.filter((item) => item.timeSlot === timeSlot)

  return (
    <div className="space-y-5 p-4 md:p-6">
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
            className="rounded border px-3 py-2 text-sm"
            type="date"
            name="date"
            defaultValue={selectedDate}
          />
          <button className="rounded bg-black px-4 py-2 text-sm text-white" type="submit">
            날짜보기
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border bg-white">
          <thead>
            <tr>
              <th className="w-16 whitespace-nowrap border px-2 py-1 bg-gray-50 text-sm">
                시간
              </th>
              <th className="border px-2 py-1 bg-gray-50 text-sm">선생님 배정</th>
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((timeSlot) => {
              const slotItems = getItemsByTime(timeSlot)

              return (
                <tr key={timeSlot}>
                  <td className="w-16 whitespace-nowrap border px-2 py-1 align-top bg-gray-50 text-xs font-medium">
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
                            className="space-y-0.5 rounded border bg-gray-50 px-2 py-1"
                          >
                            <div className="font-semibold">{item.staffName}</div>
                            <div>{item.childName}</div>
                            <div>{item.voucherType}</div>
                            <div>{renderStatusBadge(item.status)}</div>
                            {item.memo ? (
                              <div className="text-[11px] text-gray-500">{item.memo}</div>
                            ) : null}
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