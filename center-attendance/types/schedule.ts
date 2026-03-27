import type { VoucherType } from './child'

export type ScheduleStatus = '출석' | '보강' | '결석' | '당일결석'
export type ClassType = 'individual' | 'group'

export interface ScheduleEntry {
  id: string
  date: string
  timeSlot: string
  roomNumber: number
  teacherId: string
  teacherName?: string
  classType: ClassType
  childId?: string | null
  childIds?: string[]
  voucherType: VoucherType
  status: ScheduleStatus
  createdAt?: string
}