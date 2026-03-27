'use client'

interface Props {
  student: string
  age: number
  attendanceDates: string[]
  makeupDates: string[]
  absentDates: string[]
  sameDayAbsentDates: string[]
}

export default function ChildInfoModal(props: Props) {
  return (
    <div className="space-y-2 rounded border p-4 bg-white">
      <div className="font-semibold">{props.student} / {props.age}세</div>
      <div>출석날짜: {props.attendanceDates.join(', ') || '-'}</div>
      <div>보강날짜: {props.makeupDates.join(', ') || '-'}</div>
      <div>결석날짜: {props.absentDates.join(', ') || '-'}</div>
      <div>당일결석날짜: {props.sameDayAbsentDates.join(', ') || '-'}</div>
    </div>
  )
}