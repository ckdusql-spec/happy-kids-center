import { createClient } from '@supabase/supabase-js'

type VoucherType = '일반' | '디딤' | '아청심' | '드림스타트' | '배움' | '그룹'
type ScheduleStatus = '출석' | '보강' | '결석' | '당일결석'
type ClassType = 'individual' | 'group'

type Child = {
  id: string
  name: string
  age: number
  vouchers: VoucherType[]
  basePrice: number
  voucherPrices: Record<string, number>
}

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
  voucherType: VoucherType
  status: ScheduleStatus
}

type StudentAttendanceRow = {
  student: string
  age: number
  attendanceDates: string[]
  makeupDates: string[]
  absentDates: string[]
  sameDayAbsentDates: string[]
}

type TeacherLessonRow = {
  teacher: string
  student: string
  attendanceDates: string[]
  makeupDates: string[]
  absentDates: string[]
  sameDayAbsentDates: string[]
}

type MonthlyStudentSettlementRow = {
  student: string
  age: number
  voucher: VoucherType
  amount: number
}

const TABLES = {
  children: 'children',
  schedules: 'schedule_entries',
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)가 없습니다.')
  }

  return createClient(url, anonKey)
}

function formatMd(date: string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function joinDates(dates: string[]): string {
  return dates.length ? dates.join(', ') : '-'
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function isSameMonth(date: string, month: string): boolean {
  return String(date).slice(0, 7) === month
}

function calculateAgeFromBirthdate(value?: string | null): number {
  if (!value) return 0
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return 0

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()

  const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (today < thisYearBirthday) age -= 1

  return age
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

function normalizeChild(row: any): Child {
  const voucherPricesFromJson =
    row.voucher_prices && typeof row.voucher_prices === 'object'
      ? row.voucher_prices
      : {}

  const voucherPrices = {
    디딤: Number(voucherPricesFromJson['디딤'] ?? row.didim_price ?? 0),
    아청심: Number(voucherPricesFromJson['아청심'] ?? row.acheongsim_price ?? 0),
    드림스타트: Number(voucherPricesFromJson['드림스타트'] ?? row.dreamstart_price ?? 0),
    배움: Number(voucherPricesFromJson['배움'] ?? row.baeum_price ?? 0),
    그룹: Number(voucherPricesFromJson['그룹'] ?? row.group_price ?? 0),
  }

  const rawVouchers =
    row.vouchers ??
    row.voucher_types ??
    row.voucher_list ??
    []

  const vouchers: VoucherType[] = Array.isArray(rawVouchers)
    ? rawVouchers.map(normalizeVoucherType)
    : []

  const age =
    Number(row.age ?? row.korean_age ?? 0) ||
    calculateAgeFromBirthdate(row.birthdate ?? row.birth_date ?? null)

  return {
    id: String(row.id),
    name: String(row.name ?? row.child_name ?? ''),
    age,
    vouchers,
    basePrice: Number(row.base_price ?? row.general_price ?? row.normal_price ?? 0),
    voucherPrices,
  }
}

function normalizeScheduleEntry(row: any): ScheduleEntry {
  const childIdsRaw = row.child_ids ?? row.student_ids ?? []
  const childIds = Array.isArray(childIdsRaw)
    ? childIdsRaw.map((v) => String(v))
    : []

  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    timeSlot: String(row.time_slot ?? row.time ?? ''),
    roomNumber: Number(row.room_number ?? row.room ?? 0),
    teacherId: String(row.teacher_id ?? ''),
    teacherName: String(row.teacher_name ?? row.teacher ?? ''),
    classType: normalizeClassType(row.class_type),
    childId: row.child_id ? String(row.child_id) : null,
    childIds,
    voucherType: normalizeVoucherType(row.voucher_type),
    status: normalizeStatus(row.status),
  }
}

function buildStudentAttendanceRows(
  entries: ScheduleEntry[],
  children: Child[],
): StudentAttendanceRow[] {
  return children.map((child) => {
    const childEntries = entries.filter(
      (e) => e.childId === child.id || e.childIds?.includes(child.id),
    )

    return {
      student: child.name,
      age: child.age,
      attendanceDates: childEntries
        .filter((e) => e.status === '출석')
        .map((e) => formatMd(e.date)),
      makeupDates: childEntries
        .filter((e) => e.status === '보강')
        .map((e) => formatMd(e.date)),
      absentDates: childEntries
        .filter((e) => e.status === '결석')
        .map((e) => formatMd(e.date)),
      sameDayAbsentDates: childEntries
        .filter((e) => e.status === '당일결석')
        .map((e) => formatMd(e.date)),
    }
  })
}

function buildTeacherLessonRows(
  entries: ScheduleEntry[],
  children: Child[],
): TeacherLessonRow[] {
  const map = new Map<string, TeacherLessonRow>()

  for (const entry of entries) {
    const relatedChildIds =
      entry.classType === 'group'
        ? (entry.childIds ?? [])
        : entry.childId
          ? [entry.childId]
          : []

    for (const childId of relatedChildIds) {
      const child = children.find((c) => c.id === childId)
      if (!child) continue

      const key = `${entry.teacherId}-${childId}`

      if (!map.has(key)) {
        map.set(key, {
          teacher: entry.teacherName || '-',
          student: child.name,
          attendanceDates: [],
          makeupDates: [],
          absentDates: [],
          sameDayAbsentDates: [],
        })
      }

      const row = map.get(key)!
      const date = formatMd(entry.date)

      if (entry.status === '출석') row.attendanceDates.push(date)
      if (entry.status === '보강') row.makeupDates.push(date)
      if (entry.status === '결석') row.absentDates.push(date)
      if (entry.status === '당일결석') row.sameDayAbsentDates.push(date)
    }
  }

  return [...map.values()]
}

function resolveVoucherAmount(
  voucher: VoucherType,
  occurrence: number,
  child: Child,
  isGroup: boolean,
): number {
  if (isGroup || voucher === '그룹') {
    return Number(child.voucherPrices['그룹'] ?? 0)
  }

  if (voucher === '일반') {
    return Number(child.basePrice ?? 0)
  }

  // 디딤: 월 3회까지 디딤 금액, 3회 초과 시 일반금액
  if (voucher === '디딤') {
    return occurrence <= 3
      ? Number(child.voucherPrices['디딤'] ?? 0)
      : Number(child.basePrice ?? 0)
  }

  // 아청심 / 드림스타트 / 배움: 입력한 금액 그대로
  return Number(child.voucherPrices[voucher] ?? 0)
}

function buildMonthlySettlementRows(
  entries: ScheduleEntry[],
  children: Child[],
): MonthlyStudentSettlementRow[] {
  const rows: MonthlyStudentSettlementRow[] = []

  for (const child of children) {
    const childEntries = entries
      .filter((e) => e.childId === child.id || e.childIds?.includes(child.id))
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) return dateCompare
        return a.timeSlot.localeCompare(b.timeSlot)
      })

    const voucherAmountMap = new Map<string, number>()
    let didimOccurrence = 0

    for (const entry of childEntries) {
      const voucher: VoucherType =
        entry.classType === 'group' ? '그룹' : entry.voucherType

      if (voucher === '디딤') didimOccurrence += 1

      const amount = resolveVoucherAmount(
        voucher,
        voucher === '디딤' ? didimOccurrence : 1,
        child,
        entry.classType === 'group',
      )

      voucherAmountMap.set(voucher, (voucherAmountMap.get(voucher) ?? 0) + amount)
    }

    for (const [voucher, amount] of voucherAmountMap.entries()) {
      rows.push({
        student: child.name,
        age: child.age,
        voucher: voucher as VoucherType,
        amount,
      })
    }
  }

  return rows
}

export default async function SettlementPage() {
  const month = getCurrentMonth()
  const supabase = getSupabase()

  const { data: childrenRaw, error: childrenError } = await supabase
    .from(TABLES.children)
    .select('*')
    .order('name')

  const { data: entriesRaw, error: entriesError } = await supabase
    .from(TABLES.schedules)
    .select('*')
    .gte('date', `${month}-01`)
    .lt('date', (() => {
      const [y, m] = month.split('-').map(Number)
      const next = new Date(y, m, 1)
      return next.toISOString().slice(0, 10)
    })())
    .order('date')
    .order('time_slot', { ascending: true })

  if (childrenError) {
    return (
      <div className="p-6 text-red-600">
        children 조회 오류: {childrenError.message}
      </div>
    )
  }

  if (entriesError) {
    return (
      <div className="p-6 text-red-600">
        schedule_entries 조회 오류: {entriesError.message}
      </div>
    )
  }

  const children = (childrenRaw ?? []).map(normalizeChild)
  const entries = (entriesRaw ?? [])
    .map(normalizeScheduleEntry)
    .filter((e) => isSameMonth(e.date, month))

  const studentRows = buildStudentAttendanceRows(entries, children)
  const teacherRows = buildTeacherLessonRows(entries, children)
  const settlementRows = buildMonthlySettlementRows(entries, children)

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">월정산</h1>
        <div className="text-sm text-gray-600">{month}</div>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">1. 학생출결</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border bg-white">
            <thead>
              <tr>
                <th className="border p-2">학생</th>
                <th className="border p-2">나이</th>
                <th className="border p-2">출석날짜</th>
                <th className="border p-2">보강날짜</th>
                <th className="border p-2">결석날짜</th>
                <th className="border p-2">당일결석날짜</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.length === 0 ? (
                <tr>
                  <td className="border p-3 text-center" colSpan={6}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                studentRows.map((row) => (
                  <tr key={row.student}>
                    <td className="border p-2">{row.student}</td>
                    <td className="border p-2">{row.age}</td>
                    <td className="border p-2">{joinDates(row.attendanceDates)}</td>
                    <td className="border p-2">{joinDates(row.makeupDates)}</td>
                    <td className="border p-2">{joinDates(row.absentDates)}</td>
                    <td className="border p-2">{joinDates(row.sameDayAbsentDates)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">2. 선생님 수업</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border bg-white">
            <thead>
              <tr>
                <th className="border p-2">선생님</th>
                <th className="border p-2">학생</th>
                <th className="border p-2">출석날짜</th>
                <th className="border p-2">보강날짜</th>
                <th className="border p-2">결석날짜</th>
                <th className="border p-2">당일결석날짜</th>
              </tr>
            </thead>
            <tbody>
              {teacherRows.length === 0 ? (
                <tr>
                  <td className="border p-3 text-center" colSpan={6}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                teacherRows.map((row, index) => (
                  <tr key={`${row.teacher}-${row.student}-${index}`}>
                    <td className="border p-2">{row.teacher}</td>
                    <td className="border p-2">{row.student}</td>
                    <td className="border p-2">{joinDates(row.attendanceDates)}</td>
                    <td className="border p-2">{joinDates(row.makeupDates)}</td>
                    <td className="border p-2">{joinDates(row.absentDates)}</td>
                    <td className="border p-2">{joinDates(row.sameDayAbsentDates)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">3. 월학생 정산</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border bg-white">
            <thead>
              <tr>
                <th className="border p-2">학생</th>
                <th className="border p-2">나이</th>
                <th className="border p-2">바우처</th>
                <th className="border p-2">금액</th>
              </tr>
            </thead>
            <tbody>
              {settlementRows.length === 0 ? (
                <tr>
                  <td className="border p-3 text-center" colSpan={4}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                settlementRows.map((row, index) => (
                  <tr key={`${row.student}-${row.voucher}-${index}`}>
                    <td className="border p-2">{row.student}</td>
                    <td className="border p-2">{row.age}</td>
                    <td className="border p-2">{row.voucher}</td>
                    <td className="border p-2 text-right">
                      {row.amount.toLocaleString()}원
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}