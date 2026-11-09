import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function POST(req: NextRequest) {
  let actor
  try { actor = await requireStaff(req) }
  catch { return NextResponse.json({message:'로그인이 필요합니다.'},{status:403}) }
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length===0 || ids.length>100) throw new Error('일정을 선택하세요.')
    const { data,error } = await supabaseAdmin.rpc('cancel_occurrences_v2',{p_ids:ids,p_actor:actor.id})
    if (error) throw error
    return NextResponse.json({cancelled:data})
  } catch(err) { return NextResponse.json({message:err instanceof Error ? err.message : (err as {message?:string}).message || '취소 실패'},{status:400}) }
}
