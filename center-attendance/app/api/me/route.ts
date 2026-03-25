import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function signSession(payload: string) {
  const secret = process.env.APP_SESSION_SECRET!
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('app_session')?.value
    const sigCookie = req.cookies.get('app_session_sig')?.value

    if (!sessionCookie || !sigCookie) {
      return NextResponse.json(
        { ok: false, message: '세션이 없습니다.' },
        { status: 401 }
      )
    }

    const payload = Buffer.from(sessionCookie, 'base64').toString('utf-8')
    const expectedSig = signSession(payload)

    if (expectedSig !== sigCookie) {
      return NextResponse.json(
        { ok: false, message: '세션 검증 실패' },
        { status: 401 }
      )
    }

    const user = JSON.parse(payload)

    return NextResponse.json({
      ok: true,
      user,
    })
  } catch {
    return NextResponse.json(
      { ok: false, message: '세션 처리 오류' },
      { status: 500 }
    )
  }
}