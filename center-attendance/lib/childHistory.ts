import {readApiJson} from './apiResponse'
export async function childHistory<S,L>(childId:number){return readApiJson<{schedules:S[];logs:L[]}>(await fetch('/api/schedule/child-history?childId='+childId,{cache:'no-store'}))}
