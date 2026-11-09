'use client'
import type { ScheduleEntry } from '@/types/schedule'
export default function ScheduleCell({entry}: {date:string;timeSlot:string;roomNumber:number;entry?:ScheduleEntry}) {
 if(!entry) return <span className="text-slate-400">등록 없음</span>
 return <div><div>{entry.teacherName || entry.teacherId}</div><div>{entry.voucherType}</div><div>{entry.status}</div></div>
}
