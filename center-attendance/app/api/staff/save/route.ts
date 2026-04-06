import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const payload: any = {
      login_id: body.login_id,
      name: body.name,
      role: body.role,
      is_active: body.is_active,
    }

    
    if (body.password) {
      payload.password_hash = await bcrypt.hash(body.password, 10)
    }

    if (body.id) {
      const { error } = await supabaseAdmin
        .from('staff_accounts')
        .update(payload)
        .eq('id', body.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('staff_accounts')
        .insert(payload)

      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message })
  }
}
