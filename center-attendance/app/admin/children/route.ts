import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionUser } from '@/lib/getSessionUser'

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { ok: false, message: '관리자만 접근 가능합니다.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const {
      childName,
      voucherYn,
      monthlyLimit,
      notes,
      isActive,
    } = body as {
      childName?: string
      voucherYn?: boolean
      monthlyLimit?: number
      notes?: string
      isActive?: boolean
    }

    if (!childName) {
      return NextResponse.json(
        { ok: false, message: '아이 이름이 필요합니다.' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('children')
      .insert({
        child_name: childName,
        voucher_yn: voucherYn ?? false,
        monthly_limit: monthlyLimit ?? 8,
        notes: notes ?? '',
        is_active: isActive ?? true,
      })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '아이 등록 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '아이 등록 완료',
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '서버 오류' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser()

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { ok: false, message: '관리자만 접근 가능합니다.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const {
      id,
      childName,
      voucherYn,
      monthlyLimit,
      notes,
      isActive,
    } = body as {
      id?: number
      childName?: string
      voucherYn?: boolean
      monthlyLimit?: number
      notes?: string
      isActive?: boolean
    }

    if (!id || !childName) {
      return NextResponse.json(
        { ok: false, message: 'id와 아이 이름이 필요합니다.' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('children')
      .update({
        child_name: childName,
        voucher_yn: voucherYn ?? false,
        monthly_limit: monthlyLimit ?? 8,
        notes: notes ?? '',
        is_active: isActive ?? true,
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { ok: false, message: '아이 수정 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '아이 수정 완료',
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '서버 오류' },
      { status: 500 }
    )
  }
}