import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function GET(req:NextRequest) {
 try {
  const actor=await requireStaff(req)
  const staffId=Number(req.nextUrl.searchParams.get('staffId'))
  const start=req.nextUrl.searchParams.get('startDate'),end=req.nextUrl.searchParams.get('endDate')
  if(!staffId||!start||!end) return NextResponse.json({ok:false,message:'담당자·기간을 확인하세요.'},{status:400})
  if(actor.role!=='admin'&&actor.id!==staffId) return NextResponse.json({ok:false},{status:403})
  const {data,error}=await supabaseAdmin.from('schedule_entries').select('*').eq('teacher_id',staffId).eq('is_active',true).gte('date',start).lte('date',end).order('date').order('time_slot').order('minute_slot')
  if(error) throw error
  return NextResponse.json({ok:true,rows:(data??[]).map(row=>({...row,staff_id:row.teacher_id,schedule_date:row.date,memo:row.note,time_slot:row.time_slot.slice(0,2)+':'+String(row.minute_slot??0).padStart(2,'0')}))})
 } catch {return NextResponse.json({ok:false,message:'시간표 조회 실패 또는 접근 권한 없음'},{status:403})}
}
