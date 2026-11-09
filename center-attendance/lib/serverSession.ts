import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function requireStaff(req: NextRequest, admin = false) {
  const encoded = req.cookies.get('app_session')?.value
  const signature = req.cookies.get('app_session_sig')?.value
  const secret = process.env.APP_SESSION_SECRET
  if (!encoded || !signature || !secret) throw new Error('로그인이 필요합니다.')
  const payload = Buffer.from(encoded, 'base64').toString('utf8')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('세션이 유효하지 않습니다.')
  }
  const { id } = JSON.parse(payload)
  const { data, error } = await supabaseAdmin.from('staff_accounts').select('id, role, is_active').eq('id', id).single()
  if (error || !data?.is_active || (admin && data.role !== 'admin')) throw new Error('접근 권한이 없습니다.')
  return data
}
