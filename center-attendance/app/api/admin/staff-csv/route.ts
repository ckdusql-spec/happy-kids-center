import { NextRequest,NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { serverReportRows } from '@/lib/serverReportData'
import { csvText,staffCsvRows,STAFF_CSV_HEADERS,type StaffReportSchedule } from '@/lib/staffCsv'
import { shiftMonth } from '@/lib/monthlyLessons'
import type { AttendanceFact } from '@/lib/attendanceReport'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 try{await requireStaff(req,true)}catch{return NextResponse.json({message:'관리자 로그인이 필요합니다.'},{status:403})}
 const month=req.nextUrl.searchParams.get('month')||''
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({message:'조회 월을 확인하세요.'},{status:400})
 try{
  const end=shiftMonth(month,1)+'-01'
  const [schedules,logs,children,teachers]=await Promise.all([
   serverReportRows<StaffReportSchedule>('schedule_entries','*','date',end),
   serverReportRows<AttendanceFact>('class_logs','*','class_date',end),
   serverReportRows<{id:number;child_name:string}>('children','id,child_name'),
   serverReportRows<{id:number;name:string}>('staff_accounts','id,name'),
  ])
  const allRows=staffCsvRows(month,schedules,logs,children,teachers)
  const rows=req.nextUrl.searchParams.get('kind')==='makeup'?allRows.filter(r=>r[6]!=='일반수업'||r[14]!==''):allRows
  return new NextResponse(csvText(STAFF_CSV_HEADERS,rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="staff-${month}.csv"`,'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({message:'선생님 CSV 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.'},{status:500})}
}
