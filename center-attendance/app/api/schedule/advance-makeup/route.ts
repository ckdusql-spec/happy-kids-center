import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { latestLog, makeupKind, type ScheduleFact, type AttendanceFact } from '@/lib/attendanceReport'
import { serverReportRows } from '@/lib/serverReportData'

export async function GET(req: NextRequest) {
 let actor
 try { actor=await requireStaff(req) } catch { return NextResponse.json({message:'로그인이 필요합니다.'},{status:403}) }
 try {
  const date=req.nextUrl.searchParams.get('date')||''
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('원래 수업 날짜를 선택하세요.')
  const schedules:ScheduleFact[]=[],logs:AttendanceFact[]=[]
  for(let offset=0;;offset+=500){
   let q=supabaseAdmin.from('schedule_entries').select('*').eq('date',date).eq('is_active',true).order('id').range(offset,offset+499)
   if(actor.role!=='admin')q=q.eq('teacher_id',actor.id)
   const {data,error}=await q;if(error)throw error;schedules.push(...data);if(data.length<500)break
  }
  for(let offset=0;;offset+=500){
   let q=supabaseAdmin.from('class_logs').select('*').eq('class_date',date).order('id').range(offset,offset+499)
   if(actor.role!=='admin')q=q.eq('staff_id',actor.id)
   const {data,error}=await q;if(error)throw error;logs.push(...data);if(data.length<500)break
  }
  const [children,staff]=await Promise.all([serverReportRows<{id:number;child_name:string}>('children','id,child_name'),serverReportRows<{id:number;name:string}>('staff_accounts','id,name')])
  return NextResponse.json({rows:schedules.filter(s=>!s.is_group&&makeupKind(s)==='일반수업'&&!latestLog(s,logs)).map(s=>({id:s.id,date:s.date,time:s.time_slot.slice(0,2)+':'+String(s.minute_slot??0).padStart(2,'0'),child:children.find(c=>c.id===s.child_id)?.child_name||'학생',teacher:staff.find(t=>t.id===s.teacher_id)?.name||'선생님',voucher:s.voucher_type}))})
 } catch(e) {return NextResponse.json({message:(e as Error).message||'조회 실패'},{status:400})}
}
export async function POST(req:NextRequest){
 let actor
 try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{
  const p=await req.json()
  const {data,error}=await supabaseAdmin.rpc('reserve_advance_makeup_v3',{p_source:p.sourceId,p_date:p.date,p_hour:p.hour,p_minute:Number(p.minute),p_minutes:Number(p.minutes),p_reason:p.reason,p_actor:actor.id})
  if(error)throw error
  return NextResponse.json({id:data})
 }catch(e){return NextResponse.json({message:(e as Error).message||'보강 예약 실패'},{status:400})}
}
