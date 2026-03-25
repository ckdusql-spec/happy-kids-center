import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const staffId = Number(searchParams.get('staffId'))

    if (!staffId) {
      return NextResponse.json(
        { ok: false, message: 'staffId가 필요합니다.' },
        { status: 400 }
      )
    }

    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const year = nowKST.getUTCFullYear()
    const month = nowKST.getUTCMonth() + 1

    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(Date.UTC(year, month, 0))
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`

    const { data, error } = await supabaseAdmin
      .from('class_logs')
      .select(`
        id,
        class_date,
        class_time,
        note,
        child_id,
        children (
          child_name
        )
      `)
      .eq('staff_id', staffId)
      .gte('class_date', start)
      .lte('class_date', end)
      .order('class_date', { ascending: true })
      .order('class_time', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '수업 달력 조회 실패' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '서버 오류' },
      { status: 500 }
    )
  }
}