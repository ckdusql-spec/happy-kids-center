import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeAuditLog } from '@/lib/auditLog'

function todayKstDate() {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      staffId,
      type,
    } = body as {
      staffId?: number
      type?: 'check_in' | 'check_out'
    }

    if (!staffId || !type) {
      return NextResponse.json(
        { ok: false, message: 'staffId와 type이 필요합니다.' },
        { status: 400 }
      )
    }

    const workDate = todayKstDate()
    const nowIso = new Date().toISOString()

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('attendance_logs')
      .select('*')
      .eq('staff_id', staffId)
      .eq('work_date', workDate)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: '출퇴근 조회 실패', error: existingError.message },
        { status: 500 }
      )
    }

    if (type === 'check_in') {
      if (existing?.check_in_time) {
        return NextResponse.json({
          ok: false,
          message: '이미 출근 처리되었습니다.',
        })
      }

      if (!existing) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('attendance_logs')
          .insert({
            staff_id: staffId,
            work_date: workDate,
            check_in_time: nowIso,
            check_out_time: null,
          })
          .select('*')
          .single()

        if (insertError) {
          return NextResponse.json(
            { ok: false, message: '출근 저장 실패', error: insertError.message },
            { status: 500 }
          )
        }

        await writeAuditLog({
          actorStaffId: staffId,
          actionType: 'attendance_check_in_create',
          targetTable: 'attendance_logs',
          targetId: inserted.id,
          beforeData: null,
          afterData: inserted,
        })

        return NextResponse.json({
          ok: true,
          message: '출근 처리되었습니다.',
        })
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('attendance_logs')
        .update({
          check_in_time: nowIso,
        })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (updateError) {
        return NextResponse.json(
          { ok: false, message: '출근 수정 실패', error: updateError.message },
          { status: 500 }
        )
      }

      await writeAuditLog({
        actorStaffId: staffId,
        actionType: 'attendance_check_in_update',
        targetTable: 'attendance_logs',
        targetId: updated.id,
        beforeData: existing,
        afterData: updated,
      })

      return NextResponse.json({
        ok: true,
        message: '출근 처리되었습니다.',
      })
    }

    if (!existing) {
      return NextResponse.json({
        ok: false,
        message: '출근 기록이 없어 퇴근 처리할 수 없습니다.',
      })
    }

    if (!existing.check_in_time) {
      return NextResponse.json({
        ok: false,
        message: '출근 시간 없이 퇴근 처리할 수 없습니다.',
      })
    }

    if (existing.check_out_time) {
      return NextResponse.json({
        ok: false,
        message: '이미 퇴근 처리되었습니다.',
      })
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('attendance_logs')
      .update({
        check_out_time: nowIso,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json(
        { ok: false, message: '퇴근 저장 실패', error: updateError.message },
        { status: 500 }
      )
    }

    await writeAuditLog({
      actorStaffId: staffId,
      actionType: 'attendance_check_out_update',
      targetTable: 'attendance_logs',
      targetId: updated.id,
      beforeData: existing,
      afterData: updated,
    })

    return NextResponse.json({
      ok: true,
      message: '퇴근 처리되었습니다.',
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