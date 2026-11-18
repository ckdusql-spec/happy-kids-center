import {NextRequest,NextResponse} from 'next/server'
import {requireStaff} from '@/lib/serverSession'
import {supabaseAdmin} from '@/lib/supabaseAdmin'
export async function GET(req:NextRequest){
 let actor;try{actor=await requireStaff(req)}catch{return NextResponse.json({message:'로그인이 필요합니다.'},{status:403})}
 try{const id=Number(req.nextUrl.searchParams.get('childId'));if(!Number.isSafeInteger(id)||id<=0)throw new Error('학생을 선택하세요.')
 if(actor.role!=='admin'){const {data,error}=await supabaseAdmin.from('schedule_entries').select('id').eq('child_id',id).eq('teacher_id',actor.id).limit(1);if(error)throw error;if(!data.length)return NextResponse.json({message:'담당 학생만 조회할 수 있습니다.'},{status:403})}
 async function read(table:string){const rows:Record<string,unknown>[]=[];for(let offset=0;;offset+=500){const {data,error}=await supabaseAdmin.from(table).select('*').eq('child_id',id).order('id').range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows}}
 const [schedules,logs]=await Promise.all([read('schedule_entries'),read('class_logs')]);
 // All of this child's lessons are necessary to detect ambiguous same-day links across teachers.
 return NextResponse.json({schedules,logs},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return NextResponse.json({message:(e as Error).message},{status:400})}
}
