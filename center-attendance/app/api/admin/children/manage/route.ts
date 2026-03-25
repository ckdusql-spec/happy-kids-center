import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type VoucherType =
  | 'none'
  | 'edu_office'
  | 'mental_health'
  | 'after_school'
  | 'gugu'

function normalizeVoucherType(value?: string): VoucherType {
  const allowed: VoucherType[] = [
    'none',
    'edu_office',
    'mental_health',
    'after_school',
    'gugu',
  ]

  if (value && allowed.includes(value as VoucherType)) {
    return value as VoucherType
  }

  return 'none'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      chartNo,
      childName,
      birthDate,
      phone,
      voucherType,
      notes,
      isActive,
    } = body as {
      chartNo?: string
      childName?: string
      birthDate?: string
      phone?: string
      voucherType?: string
      notes?: string
      isActive?: boolean
    }

    if (!childName?.trim()) {
      return NextResponse.json(
        { ok: false, message: '아이 이름이 필요합니다.' },
        { status: 400 }
      )
    }

    const normalizedVoucherType = normalizeVoucherType(voucherType)

    const { error } = await supabaseAdmin
      .from('children')
      .insert({
        chart_no: chartNo?.trim() || null,
        child_name: childName.trim(),
        birth_date: birthDate || null,
        phone: phone?.trim() || null,
        voucher_type: normalizedVoucherType,
        notes: notes ?? '',
        is_active: isActive ?? true,
      })

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: '아이 등록 실패',
          error: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '아이 등록 완료',
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

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      id,
      chartNo,
      childName,
      birthDate,
      phone,
      voucherType,
      notes,
      isActive,
    } = body as {
      id?: number
      chartNo?: string
      childName?: string
      birthDate?: string
      phone?: string
      voucherType?: string
      notes?: string
      isActive?: boolean
    }

    if (!id || !childName?.trim()) {
      return NextResponse.json(
        { ok: false, message: 'id와 아이 이름이 필요합니다.' },
        { status: 400 }
      )
    }

    const normalizedVoucherType = normalizeVoucherType(voucherType)

    const { error } = await supabaseAdmin
      .from('children')
      .update({
        chart_no: chartNo?.trim() || null,
        child_name: childName.trim(),
        birth_date: birthDate || null,
        phone: phone?.trim() || null,
        voucher_type: normalizedVoucherType,
        notes: notes ?? '',
        is_active: isActive ?? true,
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: '아이 수정 실패',
          error: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '아이 수정 완료',
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