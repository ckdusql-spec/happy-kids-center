import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeAuditLog } from '@/lib/auditLog'

type ClassStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'

function affectsVoucher(status: ClassStatus) {
  return status === 'attended' || status === 'makeup' || status === 'same_day_absent'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      staffId,
      childId,
      classDate,
      classTime,
      status,
      note,
      actorStaffId,
    } = body as {
      staffId?: number
      childId?: number
      classDate?: string
      classTime?: string
      status?: ClassStatus
      note?: string
      actorStaffId?: number
    }

    if (!staffId || !childId || !classDate || !classTime || !status) {
      return NextResponse.json(
        { ok: false, message: '필수값 누락' },
        { status: 400 }
      )
    }

    const classDateTime = `${classDate}T${classTime}:00+09:00`

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('class_logs')
      .select('*')
      .eq('staff_id', staffId)
      .eq('child_id', childId)
      .eq('class_date', classDate)
      .eq('class_time', classDateTime)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: '기존 수업기록 조회 실패', error: existingError.message },
        { status: 500 }
      )
    }

    if (!existing) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('class_logs')
        .insert({
          staff_id: staffId,
          child_id: childId,
          class_date: classDate,
          class_time: classDateTime,
          status,
          note: note ?? '',
        })
        .select('*')
        .single()

      if (insertError) {
        return NextResponse.json(
          { ok: false, message: '수업기록 저장 실패', error: insertError.message },
          { status: 500 }
        )
      }

      await writeAuditLog({
        actorStaffId: actorStaffId ?? staffId,
        actionType: 'class_log_create',
        targetTable: 'class_logs',
        targetId: inserted.id,
        beforeData: null,
        afterData: inserted,
      })

      return NextResponse.json({
        ok: true,
        message: '수업 상태 저장 완료',
      })
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('class_logs')
      .update({
        status,
        note: note ?? existing.note ?? '',
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json(
        { ok: false, message: '수업기록 수정 실패', error: updateError.message },
        { status: 500 }
      )
    }

    await writeAuditLog({
      actorStaffId: actorStaffId ?? staffId,
      actionType: 'class_log_update',
      targetTable: 'class_logs',
      targetId: updated.id,
      beforeData: existing,
      afterData: updated,
    })

    return NextResponse.json({
      ok: true,
      message: '수업 상태 수정 완료',
      voucherChanged:
        affectsVoucher(existing.status as ClassStatus) !== affectsVoucher(status),
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