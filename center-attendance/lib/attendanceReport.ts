import { MAKEUP_REQUIRED_MINUTES } from './makeupPolicy'

export type ScheduleFact = {
  id: string; date: string; time_slot: string; minute_slot?: number | null;
  teacher_id: number | null; child_id: number | null; is_active?: boolean | null;
  is_group?: boolean | null; group_id?: string | null; voucher_type?: string | null;
  absent_class_log_id?: number | null; note?: string | null; status?: string | null;
}
export type AttendanceFact = {
  id: number; schedule_entry_id?: string | null; staff_id: number; child_id: number; class_date: string; class_time?: string | null;
  status: string; is_group?: boolean | null; group_id?: string | null;
  created_at?: string | null; updated_at?: string | null; voucher_type?: string | null;
}
export function logMinute(log: AttendanceFact) {
  if (!log.class_time) return null
  const date = new Date(log.class_time)
  if (!Number.isFinite(date.getTime())) return null
  return ((date.getUTCHours() + 9) % 24) * 60 + date.getUTCMinutes()
}
export function matchesSchedule(row: ScheduleFact, log: AttendanceFact) {
  if(log.schedule_entry_id) return row.id === log.schedule_entry_id
  return row.date === log.class_date && Number(row.teacher_id) === Number(log.staff_id)
    && Number(row.child_id) === Number(log.child_id)
    && Number(row.time_slot.slice(0,2))*60+Number(row.minute_slot ?? 0) === logMinute(log)
    && Boolean(row.is_group) === Boolean(log.is_group)
    && (!row.is_group || (row.group_id ?? '') === (log.group_id ?? ''))
}
export function latestLog(row: ScheduleFact, logs: AttendanceFact[]) {
  return logs.filter(log=>matchesSchedule(row,log)).sort((a,b)=>
    (Date.parse(b.updated_at || b.created_at || '') || 0) - (Date.parse(a.updated_at || a.created_at || '') || 0)
    || Number(b.id)-Number(a.id))[0]
}
export function validAttendance<T extends AttendanceFact>(rows: ScheduleFact[], logs: T[]): T[] {
  const ids = new Set<number>()
  for (const row of rows.filter(r=>r.is_active)) {
    const log=latestLog(row,logs)
    if (log) ids.add(log.id)
  }
  return logs.filter(log=>ids.has(log.id))
}
export function makeupKind(row: ScheduleFact) {
  if (row.voucher_type === '시간보강' || /\[시간보강:/.test(row.note || '')) return '시간보강'
  if (row.status === 'makeup' || /\[보강\]/.test(row.note || '')) return '일보강'
  return '일반수업'
}
export function absentDate(row: ScheduleFact) { return row.note?.match(/\[결석일:(\d{4}-\d{2}-\d{2})\]/)?.[1] || '' }
export function plannedMinutes(row: ScheduleFact) {
  return makeupKind(row)==='시간보강' ? Number(row.note?.match(/\[시간보강:(\d+)분\]/)?.[1] || 0)
    : makeupKind(row)==='일보강' ? MAKEUP_REQUIRED_MINUTES : 0
}
export function isCompleted(row: ScheduleFact, logs: AttendanceFact[]) {
  const log=latestLog(row,logs)
  return log?.status === 'attended' || log?.status === 'makeup'
}
export type MakeupBalance = {
  absence: AttendanceFact; usedCount: number; usedMinutes: number; reservedMinutes: number;
  remainingMinutes: number; ambiguous: boolean;
}
// Legacy date-only links are accepted only when exactly one absence matches.
// Never guess which of two same-day lessons a makeup belongs to.
export function makeupBalances(rows: ScheduleFact[], logs: AttendanceFact[]): MakeupBalance[] {
  const valid=validAttendance(rows,logs)
  const balances=valid.filter(l=>!l.is_group && ['absent','same_day_absent'].includes(l.status)).map(absence=>({
    absence,usedCount:0,usedMinutes:0,reservedMinutes:0,remainingMinutes:MAKEUP_REQUIRED_MINUTES,ambiguous:false
  }))
  const seen=new Set<string>()
  for(const row of rows.filter(r=>r.is_active && !r.is_group && makeupKind(r)!=='일반수업')) {
    const key=[row.date,row.time_slot,row.minute_slot??0,row.child_id,row.teacher_id].join('|')
    if(seen.has(key)) continue
    seen.add(key)
    const explicit=row.absent_class_log_id || row.note?.match(/\[결석기록:(\d+)\]/)?.[1]
    let candidates=balances.filter(b=>b.absence.child_id===Number(row.child_id) && (explicit ? b.absence.id===Number(explicit) : b.absence.class_date===absentDate(row)))
    if(explicit) candidates=candidates.filter(b=>b.absence.id===Number(explicit))
    if(candidates.length!==1) { candidates.forEach(b=>b.ambiguous=true); continue }
    const balance=candidates[0], minutes=plannedMinutes(row)
    if(minutes<=0 || minutes>MAKEUP_REQUIRED_MINUTES) {balance.ambiguous=true;continue}
    if(isCompleted(row,logs)) {balance.usedCount++;balance.usedMinutes+=minutes}
    else {
      const status=latestLog(row,logs)?.status
      if(!status) balance.reservedMinutes+=minutes
    }
    balance.remainingMinutes=Math.max(0,MAKEUP_REQUIRED_MINUTES-balance.usedMinutes)
  }
  return balances
}
export function balanceText(b: MakeupBalance) {
 return `${b.absence.class_date} ${b.absence.class_time ? new Date(b.absence.class_time).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}) : ""} 담당#${b.absence.staff_id} 결석#${b.absence.id}: 사용 ${b.usedCount}번 ${b.usedMinutes}분 / 예약 ${b.reservedMinutes}분 / 남음 ${b.remainingMinutes}분${b.ambiguous?' (연결 확인 필요)':''}`
}
