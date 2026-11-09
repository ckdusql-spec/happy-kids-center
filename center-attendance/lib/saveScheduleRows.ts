export async function saveScheduleRows(rows: Record<string,unknown>[], replaceIds:string[]=[]){
 const response=await fetch('/api/schedule/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows,replaceIds})})
 const result=await response.json()
 if(!response.ok)throw new Error(result.message||'일정 저장 실패')
 return result
}
