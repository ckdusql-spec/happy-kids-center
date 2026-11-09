import { NextRequest,NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function POST(req:NextRequest){
 let actor
 try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{
  const {ids,status,makeup=null}=await req.json()
  const {data,error}=await supabaseAdmin.rpc('record_attendance_v2',{p_ids:ids,p_status:status,p_actor:actor.id,p_makeup:makeup})
  if(error)throw error
  return NextResponse.json({saved:data})
 }catch(err){return NextResponse.json({message:(err as {message?:string}).message||'출결 저장 실패'},{status:400})}
}
