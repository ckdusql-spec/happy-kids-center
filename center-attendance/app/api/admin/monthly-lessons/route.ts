import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { monthlySummaries, shiftMonth, activeMonthlyCourses, type MonthlyPlan, type MonthlySchedule, type MonthlyRule } from '@/lib/monthlyLessons'
import { makeupKind, type AttendanceFact } from '@/lib/attendanceReport'

export const dynamic='force-dynamic'
async function readAll<T>(table: string, columns='*', start?: string, end?: string, dateColumn='date') {
  const result:T[]=[]
  for(let offset=0;;offset+=500) {
    let q=supabaseAdmin.from(table).select(columns).order(table==='monthly_lesson_plans'?'month':'id').range(offset,offset+499)
    if(table==='monthly_lesson_plans') q=q.order('child_id').order('teacher_id').order('voucher_type')
    if(start) q=q.gte(dateColumn,start)
    if(end) q=q.lt(dateColumn,end)
    const {data,error}=await q
    if(error) throw new Error(error.message)
    result.push(...(data as unknown as T[]))
    if(data.length<500) return result
  }
}
export async function GET(req: NextRequest) {
  try { await requireStaff(req,true) } catch {return NextResponse.json({message:'관리자 로그인이 필요합니다.'},{status:403})}
  const month=req.nextUrl.searchParams.get('month')||''
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({message:'조회 월을 확인하세요.'},{status:400})
  try {
    const start=shiftMonth(month,-1)+'-01',end=shiftMonth(month,2)+'-01'
    const [schedules,logs,plans,children,teachers,rules]=await Promise.all([
      readAll<MonthlySchedule>('schedule_entries','*',start,end),
      readAll<AttendanceFact>('class_logs','*',undefined,end,'class_date'),
      readAll<MonthlyPlan>('monthly_lesson_plans','*',start,end,'month'),
      readAll<{id:number;child_name:string}>('children','id,child_name'),
      readAll<{id:number;name:string}>('staff_accounts','id,name'),
      readAll<MonthlyRule>('regular_classes','id,child_id,teacher_id,voucher_type,is_active,start_date,end_date'),
    ])
    const courses=activeMonthlyCourses(month,rules)
    const summary=monthlySummaries(month,schedules,logs,plans,courses)
    const unassignedMakeups=schedules.filter(r=>r.is_active&&r.date.startsWith(month)&&makeupKind(r)!=='일반수업').length-summary.reduce((n,c)=>n+c.makeupEntries,0)
    return NextResponse.json({month,summary,children,teachers,logs,unassignedMakeups}, {headers:{'Cache-Control':'no-store'}})
  } catch(e) {return NextResponse.json({message:e instanceof Error?e.message:'조회 실패'},{status:500})}
}
export async function POST(req:NextRequest) {
  let actor
  try {actor=await requireStaff(req,true)} catch {return NextResponse.json({message:'관리자 로그인이 필요합니다.'},{status:403})}
  try {
    const p=await req.json()
    const {error}=await supabaseAdmin.rpc('manage_monthly_lessons_v3',{p,p_actor:actor.id})
    if(error) return NextResponse.json({message:error.message},{status:400})
    return NextResponse.json({ok:true})
  } catch {return NextResponse.json({message:'월별 수업 저장 실패'},{status:500})}
}
