/** Never expose an HTML/error page as a JSON parser error in the UI. */
export async function readApiJson<T>(response: Response): Promise<T> {
  let value: unknown
  try { value = await response.json() }
  catch { throw new Error(response.status >= 500
    ? '서버 오류로 조회하지 못했습니다. 잠시 후 새로고침해 주세요.'
    : '서버 응답을 확인하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.') }
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string' ? value.message : '요청 처리에 실패했습니다.'
    throw new Error(message)
  }
  return value as T
}
