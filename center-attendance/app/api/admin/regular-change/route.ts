import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try { await requireStaff(req, true) }
  catch { return NextResponse.json({ message: '관리자 로그인이 필요합니다.' }, { status: 403 }) }
  try {
    const payload = await req.json()
    const { data, error } = await supabaseAdmin.rpc('apply_regular_change_v2', { p: payload })
    if (error) return NextResponse.json({ message: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch { return NextResponse.json({ message: '정기수업 요청 처리 실패' }, { status: 500 }) }
}
