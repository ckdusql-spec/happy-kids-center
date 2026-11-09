let pending = false

export async function saveRegularChange(payload: Record<string, unknown>) {
  if (pending) throw new Error('정기수업 변경을 처리 중입니다. 잠시 기다려 주세요.')
  pending = true
  try {
    const response = await fetch('/api/admin/regular-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '정기수업 변경 실패')
    return result
  } finally { pending = false }
}

export function askEffectiveDate(label = '변경') {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const value = window.prompt(`${label} 적용일을 입력하세요 (YYYY-MM-DD). 이전 일정과 출결은 보존됩니다.`, today)
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) throw new Error('적용일 형식은 YYYY-MM-DD입니다.')
  return value.trim()
}
