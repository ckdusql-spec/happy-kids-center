import { absentDate, latestLog, validAttendance, matchesSchedule, makeupKind, plannedMinutes, type AttendanceFact, type ScheduleFact } from './attendanceReport'
export function makeupManagementRows(rows:ScheduleFact[],logs:AttendanceFact[]) {
 const valid=validAttendance(rows,logs).filter(l=>!rows.some(r=>r.is_active && makeupKind(r)!=='일반수업' && matchesSchedule(r,l)))
 return rows.filter(r=>makeupKind(r)!=='일반수업'&&!r.is_group).map(row=>{
  const log=latestLog(row,logs)
  const state=!row.is_active?'cancelled':log?.status==='attended'||log?.status==='makeup'?'completed':log?'missed':'reserved'
  const link=row.absent_class_log_id||Number(row.note?.match(/\[결석기록:(\d+)\]/)?.[1]||0)
  const candidates=valid.filter(l=>l.child_id===row.child_id&&['absent','same_day_absent'].includes(l.status)&&!l.is_group&&(link?l.id===link:l.class_date===absentDate(row)))
  return {...row,state,minutes:plannedMinutes(row),originalDate:absentDate(row),logId:(log?.id??null) as number|null,needsLink:!row.makeup_source_schedule_id&&!link&&candidates.length!==1,candidates:candidates.map(l=>({id:l.id,date:l.class_date,time:l.class_time,teacherId:l.staff_id}))}
 }).sort((a,b)=>(a.date+a.time_slot+String(a.minute_slot||0).padStart(2,'0')).localeCompare(b.date+b.time_slot+String(b.minute_slot||0).padStart(2,'0')))
}

