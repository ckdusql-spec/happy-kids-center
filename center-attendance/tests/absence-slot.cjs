const fs=require('fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{await db.exec(fs.readFileSync(__dirname+'/fixture-schema.sql','utf8'));for(const f of fs.readdirSync(__dirname+'/../migrations').filter(f=>/^0(0[1-9]|1[0-2])_/.test(f)).sort())await db.exec(fs.readFileSync(__dirname+'/../migrations/'+f,'utf8'));
await db.exec("INSERT INTO staff_accounts(login_id,name,role) VALUES('admin','admin','admin'),('teacher','teacher','employee');INSERT INTO children(child_name) VALUES('a'),('b'),('c');");
async function original(date,status,extra=''){const id=(await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type) VALUES($1,'18:00',2,1,'일반') RETURNING id",[date])).rows[0].id;if(status)await db.query("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(2,1,$1::date,($1::text||' 18:00')::timestamp AT TIME ZONE 'Asia/Seoul',$2)",[date,status]);return id}
const reserve=date=>db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],2)',[JSON.stringify([{date,time_slot:'18:00',minute_slot:0,teacher_id:2,child_id:2,voucher_type:'일반',status:'makeup',note:'[보강]'}])]);
const absent=await original('2026-11-19','absent');await reserve('2026-11-19');assert.equal((await db.query('SELECT is_active FROM schedule_entries WHERE id=$1',[absent])).rows[0].is_active,true);assert.equal((await db.query("SELECT count(*)::int n FROM class_logs WHERE status='absent'")).rows[0].n,1);
await assert.rejects(()=>reserve('2026-11-19'),/기존 일정/);
await assert.rejects(()=>db.query("SELECT record_attendance_v2(ARRAY[$1]::uuid[],'attended',2)",[absent]),/결석 시간에 다른 일정/);
await original('2026-11-20','same_day_absent');await reserve('2026-11-20');
await original('2026-11-21',null);await assert.rejects(()=>reserve('2026-11-21'),/기존 일정/);
await original('2026-11-22','attended');await assert.rejects(()=>reserve('2026-11-22'),/기존 일정/);
const newer=await original('2026-11-23','absent');await db.query("INSERT INTO class_logs(schedule_entry_id,staff_id,child_id,class_date,class_time,status,updated_at) VALUES($1,2,1,'2026-11-23','2026-11-23T18:00:00+09','attended',now()+interval '1 second')",[newer]);await assert.rejects(()=>reserve('2026-11-23'),/기존 일정/);
await original('2026-11-26','absent');await db.query('SELECT apply_regular_change_v2($1)',[JSON.stringify({kind:'individual',teacherId:2,childId:2,weekday:4,timeSlot:'18:00',minuteSlot:0,effectiveDate:'2026-11-26',endDate:'2026-11-26',voucherType:'일반',isActive:true})]);
await db.exec("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type,is_group,group_id) VALUES('2026-11-27','18:00',2,1,'그룹수업',true,'g'),('2026-11-27','18:00',2,3,'그룹수업',true,'g');INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status,is_group,group_id) VALUES(2,1,'2026-11-27','2026-11-27T18:00:00+09','absent',true,'g');");await assert.rejects(()=>reserve('2026-11-27'),/기존 일정/);
await db.exec(fs.readFileSync(__dirname+'/../migrations/012_absence_releases_slot.sql','utf8'));
console.log('PASS: absent/same-day absent release slot; history preserved; legacy attendance recognized; pending/present/latest correction/group attendee still block; regular booking follows same rule; conflicting attendance restoration rejected; migration idempotent.');
}finally{await db.close()}})().catch(e=>{console.error(e.message);process.exit(1)});

