export async function cancelOccurrences(ids: string[]) {
  const response = await fetch('/api/schedule/cancel', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids})
  })
  const result=await response.json()
  if (!response.ok) throw new Error(result.message || '일정 취소 실패')
  return result
}
