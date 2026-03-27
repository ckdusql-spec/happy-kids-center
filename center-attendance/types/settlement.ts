import type { VoucherType } from './child'

export interface StudentAttendanceRow {
  student: string
  age: number
  attendanceDates: string[]
  makeupDates: string[]
  absentDates: string[]
  sameDayAbsentDates: string[]
}

export interface TeacherLessonRow {
  teacher: string
  student: string
  attendanceDates: string[]
  makeupDates: string[]
  absentDates: string[]
  sameDayAbsentDates: string[]
}

export interface MonthlyStudentSettlementRow {
  student: string
  age: number
  voucher: VoucherType
  amount: number
}