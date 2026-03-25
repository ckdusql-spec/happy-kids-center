import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const staffId = searchParams.get('staffId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!staffId || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, message: 'staffId, startDate, endDate 필요' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .select('*')
      .eq('staff_id', Number(staffId))
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
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
        message: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 500 }
    )
  }
}