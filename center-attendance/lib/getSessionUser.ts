import { cookies } from 'next/headers'

export async function getSessionUser() {
  const cookieStore = await cookies()

  const userId = cookieStore.get('userId')?.value
  const loginId = cookieStore.get('loginId')?.value
  const role = cookieStore.get('role')?.value
  const name = cookieStore.get('name')?.value

  if (!userId || !loginId || !role) {
    return null
  }

  return {
    id: Number(userId),
    loginId,
    role,
    name: name ?? '',
  }
}