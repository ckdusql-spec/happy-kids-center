import { absentDate, balanceText, isCompleted, latestLog, makeupBalances, makeupKind, plannedMinutes, matchesSchedule, type AttendanceFact, type ScheduleFact } from './attendanceReport'
export type StaffReportSchedule=ScheduleFact & {teacher_name?:string|null;group_name?:string|null;regular_credit_month?:string|null}
export const STAFF_CSV_HEADERS=['날짜','선생님','시간','학생','바우처','그룹','수업구분','원래결석일','출결상태','예정보강분','완료보강분','보강잔여(월말기준)','정규횟수반영월','일정ID','확인사항']
const states:Record<string,string>={attended:'출석',absent:'결석',same_day_absent:'당일결석',makeup:'보강완료'}
export function staffCsvRows(month:string,schedules:StaffReportSchedule[],logs:AttendanceFact[],children:{id:number;child_name:string}[],teachers:{id:number;name:string}[]) {
 const names=new Map(children.map(c=>[Number(c.id),c.child_name])),staff=new Map(teachers.map(t=>[Number(t.id),t.name]));
 const balances=makeupBalances(schedules,logs)
 const result:(string|number)[][]=schedules.filter(s=>s.is_active&&s.date.startsWith(month)).sort((a,b)=>(a.date+a.time_slot+String(a.minute_slot??0).padStart(2,'0')).localeCompare(b.date+b.time_slot+String(b.minute_slot??0).padStart(2,'0'))).map(s=>{
  const log=latestLog(s,logs),kind=makeupKind(s)
  const id=s.absent_class_log_id||Number(s.note?.match(/\[결석기록:(\d+)\]/)?.[1]||0)
  const original=id?logs.find(l=>Number(l.id)===Number(id)):undefined
  const date=original?.class_date||absentDate(s)
  const linked=balances.filter(b=>b.absence.child_id===Number(s.child_id)&&(id?b.absence.id===id:b.absence.class_date===date))
  const warning=kind==='일반수업'&&(log?.status==='makeup'||/보강|보충/.test(s.note||''))?'보강 종류 확인 필요':kind!=='일반수업'&&linked.length!==1?'결석 연결 확인 필요':''
  return [s.date,staff.get(Number(s.teacher_id))||s.teacher_name||'담당 #'+s.teacher_id,s.time_slot.slice(0,2)+':'+String(s.minute_slot??0).padStart(2,'0'),names.get(Number(s.child_id))||'학생 #'+s.child_id,s.voucher_type||'',s.is_group?s.group_name||'그룹수업':'',log?.status==='makeup'&&kind==='일반수업'?'보강(유형 확인 필요)':kind,date,log?states[log.status]||log.status:'예약/미입력',plannedMinutes(s)||'',isCompleted(s,logs)?plannedMinutes(s)||'':'',linked.map(balanceText).join(' / '),kind==='일반수업'&&log?.status!=='makeup'?(s.regular_credit_month?.slice(0,7)||s.date.slice(0,7)):'보강 제외',s.id,warning]
 })
 // A makeup attendance with no surviving schedule must be visible for review, not silently discarded.
 const orphan=logs.filter(l=>l.class_date.startsWith(month)&&l.status==='makeup'&&!schedules.some(s=>matchesSchedule(s,l)))
 for(const l of orphan) result.push([l.class_date,staff.get(l.staff_id)||'담당 #'+l.staff_id,l.class_time?new Date(l.class_time).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}):'',names.get(l.child_id)||'학생 #'+l.child_id,l.voucher_type||'','','보강(일정 연결 없음)','','보강출결 기록','','','','보강 제외','','일정 없이 남은 출결 #'+l.id+' — 별도 확인 필요'])
 return result
}
export function csvText(headers:string[],rows:(string|number)[][]) {
 const cell=(v:string|number)=>{let s=String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 return '\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')
}
