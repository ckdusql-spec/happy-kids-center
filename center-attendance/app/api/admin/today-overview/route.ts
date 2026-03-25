import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function todayKstDate() {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('mode') ?? 'all'
    const date = searchParams.get('date') ?? todayKstDate()

    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('*')
      .eq('schedule_date', date)
      .order('time_slot', { ascending: true })

    if (scheduleError) {
      return NextResponse.json(
        { ok: false, message: scheduleError.message },
        { status: 500 }
      )
    }

    const { data: logs, error: logError } = await supabaseAdmin
      .from('class_logs')
      .select('*')
      .eq('class_date', date)

    if (logError) {
      return NextResponse.json(
        { ok: false, message: logError.message },
        { status: 500 }
      )
    }

    const scheduleRows = schedules ?? []
    const classLogs = logs ?? []

    const rows = scheduleRows.map((row) => {
      const classDateTime = `${row.schedule_date}T${row.time_slot}:00+09:00`
      const matched = classLogs.find(
        (log) =>
          log.staff_id === row.staff_id &&
          log.child_id === row.child_id &&
          log.class_time === classDateTime
      )

      return {
        ...row,
        input_status: matched?.status ?? null,
      }
    })

    const filtered =
      mode === 'missing'
        ? rows.filter((row) => !row.input_status)
        : rows

    return NextResponse.json({
      ok: true,
      date,
      rows: filtered,
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