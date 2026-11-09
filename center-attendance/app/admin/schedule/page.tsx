import { redirect } from 'next/navigation'
// The old weekly_schedules screen is retired; all schedule editing uses one source.
export default async function SchedulePage({searchParams}:{searchParams:Promise<{date?:string}>}) {
 const {date}=await searchParams
 redirect('/admin'+(date && /^\d{4}-\d{2}-\d{2}$/.test(date)?'?date='+encodeURIComponent(date):''))
}
