import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_accounts')
      .select('id, login_id, name, role, is_active')
      .order('id', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '선생님 목록 조회 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: '서버 오류',
        error: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 500 }
    )
  }
}