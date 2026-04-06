import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      loginId,
      password,
      name,
      role,
      isActive,
    } = body as {
      loginId?: string
      password?: string
      name?: string
      role?: 'admin' | 'employee'
      isActive?: boolean
    }

    if (!loginId || !password || !name || !role) {
      return NextResponse.json(
        { ok: false, message: '필수값이 누락되었습니다.' },
        { status: 400 }
      )
    }

    const { data: hashed, error: hashError } = await supabaseAdmin.rpc('hash_password', {
      plain_password: password,
    })

    if (hashError || !hashed) {
      return NextResponse.json(
        { ok: false, message: '비밀번호 해시 실패' },
        { status: 500 }
      )
    }

    const { error } = await supabaseAdmin
      .from('staff_accounts')
      .insert({
        login_id: loginId,
        password_hash: hashed,
        name,
        role,
        is_active: isActive ?? true,
      })

    if (error) {
      return NextResponse.json(
        { ok: false, message: '선생님 등록 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '선생님 등록 완료',
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message ?? '서버 오류' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      id,
      loginId,
      password,
      name,
      role,
      isActive,
    } = body as {
      id?: number
      loginId?: string
      password?: string
      name?: string
      role?: 'admin' | 'employee'
      isActive?: boolean
    }

    if (!id || !loginId || !name || !role) {
      return NextResponse.json(
        { ok: false, message: '필수값이 누락되었습니다.' },
        { status: 400 }
      )
    }

    const updatePayload: {
      login_id: string
      name: string
      role: 'admin' | 'employee'
      is_active: boolean
      password_hash?: string
    } = {
      login_id: loginId,
      name,
      role,
      is_active: isActive ?? true,
    }

    if (password && password.trim()) {
      const { data: hashed, error: hashError } = await supabaseAdmin.rpc('hash_password', {
        plain_password: password,
      })

      if (hashError || !hashed) {
        return NextResponse.json(
          { ok: false, message: '비밀번호 해시 실패' },
          { status: 500 }
        )
      }

      updatePayload.password_hash = hashed
    }

    const { error } = await supabaseAdmin
      .from('staff_accounts')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { ok: false, message: '선생님 수정 실패', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: '선생님 수정 완료',
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message ?? '서버 오류' },
      { status: 500 }
    )
  }
}