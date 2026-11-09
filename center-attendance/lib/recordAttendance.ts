export async function recordAttendance(ids:string[],status:string,makeup:Record<string,unknown>|null=null){
 const response=await fetch('/api/class-log/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,status,makeup})})
 const result=await response.json()
 if(!response.ok)throw new Error(result.message||'출결 저장 실패')
 return result
}
