import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import crypto from 'crypto'

function signSession(payload: string) {
  const secret = process.env.APP_SESSION_SECRET

  if (!secret) {
    throw new Error('APP_SESSION_SECRET is required')
  }

  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { loginId, password } = body as {
      loginId?: string
      password?: string
    }

    if (!loginId || !password) {
      return NextResponse.json(
        { ok: false, message: '아이디와 비밀번호를 입력하세요.' },
        { status: 400 }
      )
    }

    const { data: user, error } = await supabaseAdmin
      .from('staff_accounts')
      .select('id, login_id, password_hash, name, role, is_active')
      .eq('login_id', loginId)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { ok: false, message: '로그인 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (!user || !user.is_active) {
      return NextResponse.json(
        { ok: false, message: '존재하지 않거나 비활성 계정입니다.' },
        { status: 401 }
      )
    }

    const { data: isValid, error: pwError } = await supabaseAdmin.rpc('check_password', {
      plain_password: password,
      hashed_password: user.password_hash,
    })

    if (pwError) {
      return NextResponse.json(
        { ok: false, message: '비밀번호 확인 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (!isValid) {
      return NextResponse.json(
        { ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      )
    }

    const sessionPayload = JSON.stringify({
      id: user.id,
      loginId: user.login_id,
      name: user.name,
      role: user.role,
    })

    const signature = signSession(sessionPayload)

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        loginId: user.login_id,
        name: user.name,
        role: user.role,
      },
    })

    response.cookies.set('app_session', Buffer.from(sessionPayload).toString('base64'), {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    response.cookies.set('app_session_sig', signature, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch {
    return NextResponse.json(
      { ok: false, message: '요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}