import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeAuditLog } from '@/lib/auditLog'

function getHourKey(timeSlot: string) {
  return timeSlot.slice(0, 2)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      staffId,
      childId,
      scheduleDate,
      timeSlot,
      memo,
      createdByStaffId,
    } = body as {
      staffId?: number
      childId?: number | null
      scheduleDate?: string
      timeSlot?: string
      memo?: string
      createdByStaffId?: number
    }

    if (!staffId || !scheduleDate || !timeSlot || !createdByStaffId) {
      return NextResponse.json(
        { ok: false, message: '필수값 누락' },
        { status: 400 }
      )
    }

    if (!childId) {
      return NextResponse.json(
        { ok: false, message: '학생을 선택하세요.' },
        { status: 400 }
      )
    }

    const { data: duplicateByStaff, error: duplicateByStaffError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('id')
      .eq('staff_id', staffId)
      .eq('schedule_date', scheduleDate)
      .eq('time_slot', timeSlot)
      .eq('child_id', childId)
      .maybeSingle()

    if (duplicateByStaffError) {
      return NextResponse.json(
        { ok: false, message: '중복 조회 실패', error: duplicateByStaffError.message },
        { status: 500 }
      )
    }

    if (duplicateByStaff) {
      return NextResponse.json({
        ok: false,
        message: '이미 같은 시간에 등록된 학생입니다.',
      })
    }

    const hourKey = getHourKey(timeSlot)
    const hourStart = `${hourKey}:00`
    const hourEnd = `${hourKey}:59`

    const { data: hourRows, error: hourRowsError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('id, time_slot')
      .eq('staff_id', staffId)
      .eq('schedule_date', scheduleDate)
      .gte('time_slot', hourStart)
      .lte('time_slot', hourEnd)
      .order('time_slot', { ascending: true })

    if (hourRowsError) {
      return NextResponse.json(
        { ok: false, message: '시간표 개수 조회 실패', error: hourRowsError.message },
        { status: 500 }
      )
    }

    if ((hourRows ?? []).length >= 2) {
      return NextResponse.json({
        ok: false,
        message: '해당 시간에는 최대 2개까지만 입력할 수 있습니다.',
      })
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('weekly_schedules')
      .insert({
        staff_id: staffId,
        child_id: childId,
        schedule_date: scheduleDate,
        time_slot: timeSlot,
        memo: memo ?? '',
        created_by_staff_id: createdByStaffId,
      })
      .select('*')
      .single()

    if (insertError) {
      return NextResponse.json(
        { ok: false, message: '시간표 저장 실패', error: insertError.message },
        { status: 500 }
      )
    }

    await writeAuditLog({
      actorStaffId: createdByStaffId,
      actionType: 'schedule_create',
      targetTable: 'weekly_schedules',
      targetId: inserted.id,
      beforeData: null,
      afterData: inserted,
    })

    return NextResponse.json({
      ok: true,
      message: '시간표 저장 완료',
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

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      scheduleId,
      confirmDelete,
      actorStaffId,
    } = body as {
      scheduleId?: number
      confirmDelete?: boolean
      actorStaffId?: number
    }

    if (!scheduleId) {
      return NextResponse.json(
        { ok: false, message: 'scheduleId가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('*')
      .eq('id', scheduleId)
      .maybeSingle()

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { ok: false, message: '시간표 조회 실패' },
        { status: 500 }
      )
    }

    const classDateTime = `${schedule.schedule_date}T${schedule.time_slot}:00+09:00`

    const { data: classLog, error: classLogError } = await supabaseAdmin
      .from('class_logs')
      .select('*')
      .eq('staff_id', schedule.staff_id)
      .eq('child_id', schedule.child_id)
      .eq('class_date', schedule.schedule_date)
      .eq('class_time', classDateTime)
      .maybeSingle()

    if (classLogError) {
      return NextResponse.json(
        { ok: false, message: '수업기록 조회 실패' },
        { status: 500 }
      )
    }

    if (classLog) {
      const affectsVoucher = ['attended', 'makeup', 'same_day_absent'].includes(
        classLog.status
      )

      if (affectsVoucher && !confirmDelete) {
        return NextResponse.json({
          ok: false,
          needsConfirm: true,
          message: '바우처 횟수가 변동됩니다. 그래도 삭제하시겠습니까?',
        })
      }

      const { error: deleteClassLogError } = await supabaseAdmin
        .from('class_logs')
        .delete()
        .eq('id', classLog.id)

      if (deleteClassLogError) {
        return NextResponse.json(
          { ok: false, message: '수업기록 삭제 실패', error: deleteClassLogError.message },
          { status: 500 }
        )
      }

      await writeAuditLog({
        actorStaffId: actorStaffId ?? null,
        actionType: 'class_log_delete',
        targetTable: 'class_logs',
        targetId: classLog.id,
        beforeData: classLog,
        afterData: null,
      })
    }

    const { error: deleteScheduleError } = await supabaseAdmin
      .from('weekly_schedules')
      .delete()
      .eq('id', scheduleId)

    if (deleteScheduleError) {
      return NextResponse.json(
        { ok: false, message: '시간표 삭제 실패', error: deleteScheduleError.message },
        { status: 500 }
      )
    }

    await writeAuditLog({
      actorStaffId: actorStaffId ?? null,
      actionType: 'schedule_delete',
      targetTable: 'weekly_schedules',
      targetId: scheduleId,
      beforeData: schedule,
      afterData: null,
    })

    return NextResponse.json({
      ok: true,
      message: '시간표 삭제 완료',
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      scheduleId,
      memo,
      actorStaffId,
    } = body as {
      scheduleId?: number
      memo?: string
      actorStaffId?: number
    }

    if (!scheduleId) {
      return NextResponse.json(
        { ok: false, message: 'scheduleId가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data: beforeRow, error: beforeError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('*')
      .eq('id', scheduleId)
      .maybeSingle()

    if (beforeError || !beforeRow) {
      return NextResponse.json(
        { ok: false, message: '기존 시간표 조회 실패' },
        { status: 500 }
      )
    }

    const { data: updated, error } = await supabaseAdmin
      .from('weekly_schedules')
      .update({
        memo: memo ?? '',
      })
      .eq('id', scheduleId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, message: '메모 수정 실패', error: error.message },
        { status: 500 }
      )
    }

    await writeAuditLog({
      actorStaffId: actorStaffId ?? null,
      actionType: 'schedule_memo_update',
      targetTable: 'weekly_schedules',
      targetId: scheduleId,
      beforeData: beforeRow,
      afterData: updated,
    })

    return NextResponse.json({
      ok: true,
      message: '메모 수정 완료',
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