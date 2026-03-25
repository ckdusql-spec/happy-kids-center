import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type VoucherType =
  | 'none'
  | 'edu_office'
  | 'mental_health'
  | 'after_school'
  | 'gugu'

function getVoucherLabel(voucherType: VoucherType) {
  switch (voucherType) {
    case 'edu_office':
      return '교육청 바우처'
    case 'mental_health':
      return '아청심 바우처'
    case 'after_school':
      return '방과후 바우처'
    case 'gugu':
      return '구구 바우처'
    default:
      return '일반'
  }
}

function getVoucherColor(voucherType: VoucherType) {
  switch (voucherType) {
    case 'edu_office':
      return 'yellow'
    case 'mental_health':
      return 'purple'
    case 'after_school':
      return 'green'
    case 'gugu':
      return 'orange'
    default:
      return 'slate'
  }
}

function getAgeText(birthDate: string | null) {
  if (!birthDate) return ''

  const today = new Date()
  const birth = new Date(birthDate)

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }

  if (age < 0 || Number.isNaN(age)) return ''
  return `${age}세`
}

export async function GET() {
  try {
    const { data: children, error: childrenError } = await supabaseAdmin
      .from('children')
      .select(
        `
        id,
        chart_no,
        child_name,
        birth_date,
        phone,
        voucher_type,
        is_active,
        notes
      `
      )
      .order('child_name', { ascending: true })

    if (childrenError) {
      return NextResponse.json(
        {
          ok: false,
          message: '아이 목록 조회 실패',
          error: childrenError.message,
        },
        { status: 500 }
      )
    }

    const { data: voucherRows, error: voucherError } = await supabaseAdmin
      .from('voucher_usage_summary')
      .select('child_id, ym, used_count')
      .order('month_start', { ascending: true })

    if (voucherError) {
      return NextResponse.json(
        {
          ok: false,
          message: '바우처 조회 실패',
          error: voucherError.message,
        },
        { status: 500 }
      )
    }

    const voucherMap: Record<number, { ym: string; used_count: number }[]> = {}

    for (const row of voucherRows ?? []) {
      if (!voucherMap[row.child_id]) {
        voucherMap[row.child_id] = []
      }

      voucherMap[row.child_id].push({
        ym: row.ym,
        used_count: row.used_count,
      })
    }

    const result = (children ?? []).map((child) => {
      const voucherType = (child.voucher_type ?? 'none') as VoucherType
      const ageText = getAgeText(child.birth_date)
      const displayName = ageText
        ? `${child.child_name} (${ageText})`
        : child.child_name

      return {
        ...child,
        voucher_type: voucherType,
        voucher_label: getVoucherLabel(voucherType),
        voucher_color: getVoucherColor(voucherType),
        age_text: ageText,
        display_name: displayName,
        voucher_summary: voucherMap[child.id] ?? [],
      }
    })

    return NextResponse.json({
      ok: true,
      children: result,
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