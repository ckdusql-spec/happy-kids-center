'use client'
import { useId } from 'react'
const descriptions: Record<string,string> = { attended: '정상 수업을 마쳤어요', absent: '결석 기록 · 보강 예약 가능', same_day_absent: '수업 당일 결석했어요', makeup: '보강 수업을 마쳤어요' }
const labels: Record<string,string> = { attended: '출석', absent: '결석', same_day_absent: '당일 결석', makeup: '보강 완료' }
export default function AttendancePicker<T extends string>({ value, options, onChange }: {value:T;options:readonly T[];onChange:(value:T)=>void}) {
 const name=useId()
 return <fieldset className="attendance-picker"><legend>출결 상태 선택</legend><div>{options.map(option=><label key={option} data-selected={value===option}><input type="radio" name={name} value={option} checked={value===option} onChange={()=>onChange(option)}/><span><strong>{labels[option]||option}</strong><small>{descriptions[option]}</small></span></label>)}</div></fieldset>
}
