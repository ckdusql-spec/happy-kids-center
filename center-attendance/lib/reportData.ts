import { supabase } from './supabase'
import type { AttendanceFact, ScheduleFact } from './attendanceReport'
export async function fetchAllRows<T>(table: string, dateColumn?: string, end?: string, filters: Record<string, string|number|boolean> = {}, start?: string): Promise<T[]> {
  const rows:T[]=[]
  for(let offset=0;;offset+=500) {
    let query=supabase.from(table).select('*').order('id',{ascending:true}).range(offset,offset+499)
    if(dateColumn && end) query=query.lte(dateColumn,end)
    if(dateColumn && start) query=query.gte(dateColumn,start)
    for(const [key,value] of Object.entries(filters)) query=query.eq(key,value)
    const {data,error}=await query
    if(error) throw error
    rows.push(...(data ?? []) as T[])
    if((data?.length ?? 0)<500) return rows
  }
}
export async function loadReportHistory(end: string) {
  const [schedules,logs]=await Promise.all([
    fetchAllRows<ScheduleFact>('schedule_entries','date',end),
    fetchAllRows<AttendanceFact>('class_logs','class_date',end),
  ])
  return {schedules,logs}
}
