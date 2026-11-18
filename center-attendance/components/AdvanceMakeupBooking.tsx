'use client'
import { useEffect, useState } from 'react'
import TaskDialog from './TaskDialog'
import { readApiJson } from '@/lib/apiResponse'
type Row={id:string;date:string;time:string;child:string;teacher:string;voucher:string}
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())
export default function AdvanceMakeupBooking(){
 const [open,setOpen]=useState(false),[sourceDate,setSourceDate]=useState(today),[rows,setRows]=useState<Row[]>([]),[sourceId,setSourceId]=useState(''),[query,setQuery]=useState(''),[date,setDate]=useState(''),[hour,setHour]=useState('09:00'),[minute,setMinute]=useState('0'),[minutes,setMinutes]=useState('40'),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[saved,setSaved]=useState(false)
 useEffect(()=>{if(!open)return;const controller=new AbortController();setRows([]);setSourceId('');setLoading(true);setMessage('');fetch('/api/schedule/advance-makeup?date='+sourceDate,{signal:controller.signal,cache:'no-store'}).then(r=>readApiJson<{rows:Row[]}>(r)).then(d=>setRows(d.rows)).catch(e=>{if(e.name!=='AbortError')setMessage(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[open,sourceDate])
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{await readApiJson(await fetch('/api/schedule/advance-makeup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId,date,hour,minute,minutes,reason})}));setSaved(true);setMessage('보강을 예약했습니다. 원래 수업은 출결 대기로 유지됩니다. 시간표를 새로고침하면 예약을 볼 수 있습니다.')}catch(e){setMessage(e instanceof Error?e.message:'예약 실패')}finally{setBusy(false)}}
 const selected=rows.find(r=>r.id===sourceId)
 return <><button className="advance-booking-button" onClick={()=>{setSaved(false);setDate('');setReason('');setOpen(true)}}>＋ 결석 전 보강 예약</button>{open&&<TaskDialog title="결석 전 보강 예약" description="결석 체크 없이 예정 수업에 보강을 연결합니다. 보강일이 원래 수업보다 빨라도 예약할 수 있습니다." onClose={()=>{if(!busy)setOpen(false)}}>
 {message&&<p className="workspace-feedback" role="status">{message}</p>}
 {!saved?<form onSubmit={save}><fieldset disabled={busy} className="space-y-4"><label className="form-field"><span>1. 결석 예정인 원래 수업 날짜</span><input type="date" required value={sourceDate} onChange={e=>setSourceDate(e.target.value)} className="w-full rounded-lg border p-3"/></label>
 <label className="form-field"><span>학생·선생님 검색</span><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-lg border p-3" placeholder="이름 입력"/></label>
 <label className="form-field"><span>원래 수업 선택 · 출결 미입력 개인수업만 표시</span><select required disabled={loading} value={sourceId} onChange={e=>setSourceId(e.target.value)} className="w-full rounded-lg border p-3"><option value="">{loading?'불러오는 중…':'수업을 선택하세요'}</option>{rows.filter(r=>(r.child+' '+r.teacher).includes(query.trim())).map(r=><option key={r.id} value={r.id}>{r.time} · {r.child} · {r.teacher} · {r.voucher}</option>)}</select></label>
 {!loading&&rows.length===0&&<p className="field-help">이 날짜에는 예약 가능한 미처리 개인수업이 없습니다. 이미 결석 처리했다면 기존 보강 입력을 이용하세요.</p>}
 {selected&&<p className="lesson-context">{selected.child} · {selected.teacher}<br/>{selected.date} {selected.time} 수업의 보강을 예약합니다.</p>}
 <label className="form-field"><span>2. 보강 받을 날짜</span><input type="date" required min={today()} value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border p-3"/></label>
 <div className="grid grid-cols-2 gap-3"><label className="form-field"><span>시작 시</span><select value={hour} onChange={e=>setHour(e.target.value)} className="w-full rounded-lg border p-3">{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+':00').map(t=><option key={t}>{t}</option>)}</select></label><label className="form-field"><span>시작 분</span><select value={minute} onChange={e=>setMinute(e.target.value)} className="w-full rounded-lg border p-3">{[0,10,20,30,40,50].map(m=><option key={m} value={m}>{m}분</option>)}</select></label></div>
 <label className="form-field"><span>보강 시간 · 같은 수업의 완료·예약 합계 최대 40분</span><select value={minutes} onChange={e=>setMinutes(e.target.value)} className="w-full rounded-lg border p-3">{[40,10,20,30].map(n=><option key={n} value={n}>{n===40?'일보강 1회 · 40분':`시간보강 · ${n}분`}</option>)}</select></label>
 <label className="form-field"><span>3. 사전 예약 사유</span><textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 가족 일정으로 결석 예정" className="w-full rounded-lg border p-3"/></label>
 <p className="field-help">담당 선생님과 바우처는 원래 수업을 따릅니다. 실제 결석 처리 시 자동 연결되며, 출석으로 변경하려면 예약한 보강을 먼저 정리해야 합니다.</p>
 <button disabled={!sourceId||loading||busy} className="w-full rounded-xl bg-indigo-700 p-3 font-semibold text-white disabled:opacity-40">{busy?'예약 중…':'보강 예약 저장'}</button></fieldset></form>:<button className="advance-booking-button" onClick={()=>window.location.reload()}>시간표 새로고침</button>}
 </TaskDialog>}</>
}
