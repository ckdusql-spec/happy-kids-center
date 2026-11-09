import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { latestLog } from '@/lib/attendanceReport'
export async function GET(req:NextRequest) {
 try {
  await requireStaff(req,true)
  const date=req.nextUrl.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date())
  const [s,l]=await Promise.all([
   supabaseAdmin.from('schedule_entries').select('*').eq('date',date).eq('is_active',true).order('time_slot').order('minute_slot'),
   supabaseAdmin.from('class_logs').select('*').eq('class_date',date)
  ])
  if(s.error)throw s.error;if(l.error)throw l.error
  let rows=(s.data??[]).map(row=>({...row,staff_id:row.teacher_id,schedule_date:row.date,input_status:latestLog(row,l.data??[])?.status??null}))
  if(req.nextUrl.searchParams.get('mode')==='missing') rows=rows.filter(r=>!r.input_status)
  return NextResponse.json({ok:true,date,rows})
 }catch{return NextResponse.json({ok:false,message:'조회 실패 또는 접근 권한 없음'},{status:403})}
}
