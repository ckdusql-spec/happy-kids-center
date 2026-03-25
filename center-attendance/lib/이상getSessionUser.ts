import { cookies } from 'next/headers'

type SessionUser = {
  id: number
  loginId: string
  name: string
  role: 'admin' | 'employee'
} | null

export async function getSessionUser(): Promise<SessionUser> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('session_user')?.value

  if (!raw) return null

  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}