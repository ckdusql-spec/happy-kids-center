import { NextRequest,NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function POST(req:NextRequest){
 let actor
 try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{
  const {rows,replaceIds=[]}=await req.json()
  const {data,error}=await supabaseAdmin.rpc('save_schedule_batch_v2',{p_rows:rows,p_replace_ids:replaceIds,p_actor:actor.id})
  if(error)throw error
  return NextResponse.json({inserted:data})
 }catch(err){return NextResponse.json({message:(err as {message?:string}).message||'일정 저장 실패'},{status:400})}
}
