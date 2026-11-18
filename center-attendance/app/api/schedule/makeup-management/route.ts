import { NextRequest,NextResponse } from 'next/server'
import { requireStaff } from '@/lib/serverSession'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { makeupManagementRows } from '@/lib/makeupManagement'
import { makeupBalances,type ScheduleFact,type AttendanceFact } from '@/lib/attendanceReport'
import { serverReportRows } from '@/lib/serverReportData'
export async function GET(req:NextRequest){
 let actor:{id:number;role:string};try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{
  const childId=Number(req.nextUrl.searchParams.get('childId'))
  if(!childId){
   const q=(req.nextUrl.searchParams.get('q')||'').trim();if(!q)return NextResponse.json({children:[]})
   const {data,error}=await supabaseAdmin.from('children').select('id,child_name').ilike('child_name','%'+q.replace(/[%_]/g,'')+'%').limit(20);if(error)throw error
   if(actor.role==='admin')return NextResponse.json({children:data})
   const {data:own,error:ownError}=await supabaseAdmin.from('schedule_entries').select('child_id').eq('teacher_id',actor.id).in('child_id',data.map(c=>c.id));if(ownError)throw ownError
   return NextResponse.json({children:data.filter(c=>own.some(s=>s.child_id===c.id))})
  }
  async function read<T>(table:string,column:string){const rows:T[]=[];for(let offset=0;;offset+=500){let q=supabaseAdmin.from(table).select('*').eq('child_id',childId).order('id').range(offset,offset+499);if(actor.role!=='admin')q=q.eq(column,actor.id);const {data,error}=await q;if(error)throw error;rows.push(...data as T[]);if(data.length<500)return rows}}
  const [rows,logs,teachers]=await Promise.all([read<ScheduleFact>('schedule_entries','teacher_id'),read<AttendanceFact>('class_logs','staff_id'),serverReportRows<{id:number;name:string}>('staff_accounts','id,name')])
  const balances=makeupBalances(rows,logs)
  const visibility:{absence_id:number;hidden:boolean;reason:string}[]=[]
  for(let i=0;i<balances.length;i+=200){const {data,error}=await supabaseAdmin.from('makeup_balance_visibility').select('absence_id,hidden,reason').in('absence_id',balances.slice(i,i+200).map(b=>b.absence.id));if(error)throw error;visibility.push(...data)}
  return NextResponse.json({isAdmin:actor.role==='admin',rows:makeupManagementRows(rows,logs),balances,visibility,teachers})
 }catch(e){return NextResponse.json({message:(e as Error).message||'조회 실패'},{status:400})}
}
export async function POST(req:NextRequest){
 let actor:{id:number;role:string};try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{const p=await req.json();if(p.action==='balance-visibility'){if(actor.role!=='admin')return NextResponse.json({message:'관리자만 목록을 정리할 수 있습니다.'},{status:403});if(typeof p.hidden!=='boolean')throw new Error('처리 상태를 확인하세요.');const {error}=await supabaseAdmin.rpc('set_makeup_balance_visibility',{p_absence:p.absenceId,p_child:p.childId,p_hidden:p.hidden,p_reason:p.reason,p_actor:actor.id});if(error)throw error;return NextResponse.json({ok:true})}if(p.action==='admin-edit'){if(actor.role!=='admin')return NextResponse.json({message:'관리자만 수정할 수 있습니다.'},{status:403});const {error}=await supabaseAdmin.rpc('admin_manage_makeup_v5',{p,p_actor:actor.id});if(error)throw error;return NextResponse.json({ok:true})}const {error}=await supabaseAdmin.rpc('manage_makeup_v4',{p_id:p.id,p_action:p.action,p_absence:p.absenceId||null,p_actor:actor.id});if(error)throw error;return NextResponse.json({ok:true})}catch(e){return NextResponse.json({message:(e as Error).message||'처리 실패'},{status:400})}
}
