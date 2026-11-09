import { absentDate, latestLog, makeupKind, plannedMinutes, type ScheduleFact, type AttendanceFact } from './attendanceReport'

export type MonthlySchedule = ScheduleFact & { regular_credit_month?: string | null }
export type MonthlyPlan = { month: string; child_id: number; teacher_id: number; voucher_type: string; target: number; closed: boolean; reason: string }
export type MonthlyRule = MonthlyCourse & { is_active: boolean | null; start_date: string; end_date: string | null }
export type MonthlyCourse = { child_id: number; teacher_id: number; voucher_type: string }
export type MonthlySummary = MonthlyCourse & {
  historyOnly: boolean; key: string; target: number; closed: boolean; reason: string; allocated: number; attended: number;
  absent: number; pending: number; shortage: number; excess: number; carriedIn: number; carriedOut: number;
  makeupEntries: number; makeupCount: number; makeupMinutes: number; makeupReservedMinutes: number; schedules: MonthlySchedule[]; makeupSchedules: MonthlySchedule[];
}
export function courseKey(r: MonthlyCourse) { return JSON.stringify([Number(r.child_id), Number(r.teacher_id), r.voucher_type]) }
export function shiftMonth(month: string, amount: number) {
  const [y,m]=month.split('-').map(Number)
  return new Date(Date.UTC(y,m-1+amount,1)).toISOString().slice(0,7)
}
export function activeMonthlyCourses(month: string, rules: MonthlyRule[]): MonthlyCourse[] {
 return rules.filter(r=>r.is_active===true && r.start_date<shiftMonth(month,1)+'-01' && (!r.end_date||r.end_date>=month+'-01'))
}
function makeupCourse(r: MonthlySchedule, logs: AttendanceFact[]): MonthlyCourse | undefined {
 const id=r.absent_class_log_id || Number(r.note?.match(/\[결석기록:(\d+)\]/)?.[1]||0)
 const candidates=id ? logs.filter(l=>Number(l.id)===Number(id)) : logs.filter(l=>l.child_id===Number(r.child_id)&&l.staff_id===Number(r.teacher_id)&&l.class_date===absentDate(r)&&['absent','same_day_absent'].includes(l.status))
 const linked=candidates.length===1 ? candidates[0] : undefined
 if(linked) return {child_id:linked.child_id,teacher_id:linked.staff_id,voucher_type:linked.voucher_type||''}
 if(r.child_id && r.teacher_id && r.voucher_type!=='시간보강') return {child_id:r.child_id,teacher_id:r.teacher_id,voucher_type:r.voucher_type||''}
}
function regular(r: MonthlySchedule) { return makeupKind(r)==='일반수업' && !r.absent_class_log_id }
export function creditMonth(r: MonthlySchedule) { return r.regular_credit_month?.slice(0,7) || r.date.slice(0,7) }
export function monthlySummaries(month: string, rows: MonthlySchedule[], logs: AttendanceFact[], plans: MonthlyPlan[], courses: MonthlyCourse[] = []): MonthlySummary[] {
  const keys=new Map<string,MonthlyCourse>()
  const add=(r: MonthlyCourse)=>keys.set(courseKey(r),r)
  courses.forEach(add)
  plans.filter(p=>p.month.slice(0,7)===month).forEach(add)
  rows.filter(r=>r.is_active && (r.date.startsWith(month)||creditMonth(r)===month)).forEach(r=>{
    if(r.child_id && r.teacher_id && regular(r)) add({child_id:r.child_id,teacher_id:r.teacher_id,voucher_type:r.voucher_type || ''})
  })
  const monthMakeups=rows.filter(r=>r.is_active && r.date.startsWith(month) && makeupKind(r)!=='일반수업')
  monthMakeups.forEach(r=>{const c=makeupCourse(r,logs);if(c)add(c)})
  return [...keys.entries()].map(([key,c])=>{
    const all=rows.filter(r=>r.is_active && Number(r.child_id)===Number(c.child_id) && Number(r.teacher_id)===Number(c.teacher_id) && (r.voucher_type||'')===c.voucher_type)
    const assigned=all.filter(r=>regular(r) && creditMonth(r)===month)
    const p=plans.find(p=>p.month.slice(0,7)===month && courseKey(p)===key)
    const historyOnly=!p && !courses.some(r=>courseKey(r)===key) && !all.some(r=>regular(r)&&(r.date.startsWith(month)||creditMonth(r)===month))
    const target=p?.target??(historyOnly?0:4)
    let attended=0,absent=0,pending=0
    for(const r of assigned) {
      const status=latestLog(r,logs)?.status
      if(status==='attended') attended++
      else if(status==='absent'||status==='same_day_absent') absent++
      else pending++
    }
    // Time makeup uses a different voucher label: recover its course from the linked absence.
    const makeups=monthMakeups.filter(r=>{const linked=makeupCourse(r,logs);return linked && courseKey(linked)===key})
    const complete=makeups.filter(r=>['attended','makeup'].includes(latestLog(r,logs)?.status||''))
    return {...c,historyOnly,key,target,closed:p?.closed??false,reason:p?.reason??'',allocated:assigned.length,attended,absent,pending,
      shortage:Math.max(0,target-assigned.length),excess:Math.max(0,assigned.length-target),
      carriedIn:assigned.filter(r=>!r.date.startsWith(month)).length,
      carriedOut:all.filter(r=>regular(r)&&r.date.startsWith(month)&&creditMonth(r)!==month).length,
      makeupSchedules:[...makeups].sort((a,b)=>(a.date+a.time_slot+String(a.minute_slot??0).padStart(2,'0')).localeCompare(b.date+b.time_slot+String(b.minute_slot??0).padStart(2,'0'))),
      makeupEntries:makeups.length,makeupCount:complete.length,makeupMinutes:complete.reduce((n,r)=>n+plannedMinutes(r),0),
      makeupReservedMinutes:makeups.filter(r=>!latestLog(r,logs)).reduce((n,r)=>n+plannedMinutes(r),0),
      schedules:all.filter(r=>regular(r)&&(r.date.startsWith(month)||creditMonth(r)===month)).sort((a,b)=>(a.date+a.time_slot).localeCompare(b.date+b.time_slot))}
  })
}
