import type { Child, VoucherType } from '@/types/child'
import type { ScheduleEntry } from '@/types/schedule'
import type {
  MonthlyStudentSettlementRow,
  StudentAttendanceRow,
  TeacherLessonRow,
} from '@/types/settlement'
import { formatMd } from './dateUtils'
import { resolveVoucherAmount } from './voucherRules'

export function buildStudentAttendanceRows(
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
      attendanceDates: childEntries.filter((e) => e.status === '출석').map((e) => formatMd(e.date)),
      makeupDates: childEntries.filter((e) => e.status === '보강').map((e) => formatMd(e.date)),
      absentDates: childEntries.filter((e) => e.status === '결석').map((e) => formatMd(e.date)),
      sameDayAbsentDates: childEntries
        .filter((e) => e.status === '당일결석')
        .map((e) => formatMd(e.date)),
    }
  })
}

export function buildTeacherLessonRows(
  entries: ScheduleEntry[],
  children: Child[],
): TeacherLessonRow[] {
  const map = new Map<string, TeacherLessonRow>()

  for (const entry of entries) {
    const childIds =
      entry.classType === 'group'
        ? (entry.childIds ?? [])
        : entry.childId
          ? [entry.childId]
          : []

    for (const childId of childIds) {
      const child = children.find((c) => c.id === childId)
      if (!child) continue

      const key = `${entry.teacherId}-${childId}`
      if (!map.has(key)) {
        map.set(key, {
          teacher: entry.teacherName ?? '',
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

export function buildMonthlySettlementRows(
  entries: ScheduleEntry[],
  children: Child[],
): MonthlyStudentSettlementRow[] {
  const rows: MonthlyStudentSettlementRow[] = []

  for (const child of children) {
    const childEntries = entries
      .filter((e) => e.childId === child.id || e.childIds?.includes(child.id))
      .sort((a, b) => a.date.localeCompare(b.date))

    const voucherAmountMap = new Map<string, number>()
    let didimOccurrence = 0

    for (const entry of childEntries) {
      const voucher: VoucherType = entry.classType === 'group' ? '그룹' : entry.voucherType
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