import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClassStatus = 'attended' | 'absent' | 'makeup' | 'same_day_absent'
type VoucherType =
  | 'none'
  | 'edu_office'
  | 'mental_health'
  | 'after_school'
  | 'gugu'

function affectsVoucher(status: ClassStatus) {
  return status === 'attended' || status === 'makeup' || status === 'same_day_absent'
}

function getVoucherLabel(voucherType: string | null | undefined) {
  switch (voucherType as VoucherType) {
    case 'edu_office':
      return '교육청'
    case 'mental_health':
      return '아청심'
    case 'after_school':
      return '방과후'
    case 'gugu':
      return '구구'
    default:
      return '일반'
  }
}

function getAgeText(birthDate: string | null | undefined) {
  if (!birthDate) return ''

  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return ''

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()

  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }

  return `${age}세`
}

function getChildDisplayName(child: any) {
  const ageText = child.age_text?.trim() || getAgeText(child.birth_date)
  return ageText ? `${child.child_name} (${ageText})` : child.child_name
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json(
        { ok: false, message: 'month가 필요합니다. 예: 2026-03' },
        { status: 400 }
      )
    }

    const [year, monthNum] = month.split('-').map(Number)
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [childrenRes, logsRes] = await Promise.all([
      supabaseAdmin
        .from('children')
        .select('*')
        .eq('is_active', true)
        .order('child_name', { ascending: true }),
      supabaseAdmin
        .from('class_logs')
        .select('*')
        .gte('class_date', startDate)
        .lte('class_date', endDate),
    ])

    if (childrenRes.error) {
      return NextResponse.json(
        { ok: false, message: childrenRes.error.message },
        { status: 500 }
      )
    }

    if (logsRes.error) {
      return NextResponse.json(
        { ok: false, message: logsRes.error.message },
        { status: 500 }
      )
    }

    const children = childrenRes.data ?? []
    const logs = logsRes.data ?? []

    const rows = children.map((child) => {
      const childLogs = logs.filter((log) => log.child_id === child.id)

      const attended = childLogs.filter((log) => log.status === 'attended').length
      const absent = childLogs.filter((log) => log.status === 'absent').length
      const sameDayAbsent = childLogs.filter((log) => log.status === 'same_day_absent').length
      const makeup = childLogs.filter((log) => log.status === 'makeup').length

      const usedCount = childLogs.filter((log) =>
        affectsVoucher(log.status as ClassStatus)
      ).length

      const ageText = child.age_text?.trim() || getAgeText(child.birth_date)
      const voucherLabel = child.voucher_label?.trim() || getVoucherLabel(child.voucher_type)

      return {
        child_id: child.id,
        child_name: child.child_name,
        display_name: getChildDisplayName(child),
        age_text: ageText,
        voucher_type: child.voucher_type ?? 'none',
        voucher_label: voucherLabel,
        attended_count: attended,
        absent_count: absent,
        same_day_absent_count: sameDayAbsent,
        makeup_count: makeup,
        used_count: usedCount,
      }
    })

    return NextResponse.json({
      ok: true,
      month,
      rows,
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