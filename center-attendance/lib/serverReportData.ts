import { supabaseAdmin } from './supabaseAdmin'
export async function serverReportRows<T>(table:string,columns:string,dateColumn?:string,end?:string) {
 const result:T[]=[]
 for(let offset=0;;offset+=500){
  let q=supabaseAdmin.from(table).select(columns).order('id').range(offset,offset+499)
  if(dateColumn&&end)q=q.lt(dateColumn,end)
  const {data,error}=await q
  if(error)throw new Error(error.message)
  result.push(...data as unknown as T[])
  if(data.length<500)return result
 }
}
