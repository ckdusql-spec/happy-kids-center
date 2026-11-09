import { NextResponse } from 'next/server'
// The legacy numeric-id writer targeted weekly_schedules. Never accept writes there.
function retired() {return NextResponse.json({ok:false,message:'이전 시간표 저장 경로는 종료되었습니다. 관리자 시간표를 새로고침하여 이용하세요.'},{status:410})}
export const POST=retired
export const PUT=retired
export const PATCH=retired
export const DELETE=retired
