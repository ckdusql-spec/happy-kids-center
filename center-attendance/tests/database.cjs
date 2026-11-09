const {PGlite}=require('@electric-sql/pglite');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync(__dirname+'/fixture-schema.sql','utf8'));
 for(const f of ['001_regular_changes.sql','002_cancel_occurrences.sql','003_retire_legacy_delete.sql','004_attendance_links.sql','005_atomic_schedule_save.sql','006_atomic_attendance.sql','007_monthly_lessons.sql']) await db.exec(fs.readFileSync(__dirname+'/../migrations/'+f,'utf8'));
 await db.exec(`INSERT INTO staff_accounts(login_id,password_hash,name,role) VALUES ('admin','hash','관리자','admin'),('teacher','hash','선생님','employee'); INSERT INTO children(child_name) VALUES ('테스트');`);
 const call=async p=>(await db.query('select apply_regular_change_v2($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
 const base={kind:'individual',teacherId:2,childId:1,weekday:1,timeSlot:'09:00',minuteSlot:30,effectiveDate:'2026-11-02',endDate:'2026-11-30',voucherType:'일반',isActive:true};
 const a=await call(base);assert.equal(a.inserted,5);
 await db.exec(`INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES (2,1,'2026-11-02','2026-11-02T09:30:00+09:00','attended');`);
 const b=await call({...base,id:a.id,weekday:2,effectiveDate:'2026-11-10'});assert.equal(b.inserted,3);assert.equal(b.cancelled,3);
 let rows=(await db.query('select date::text from schedule_entries where is_active order by date')).rows.map(r=>r.date);
 assert.deepEqual(rows,['2026-11-02','2026-11-09','2026-11-10','2026-11-17','2026-11-24']);
 assert.equal((await db.query('select count(*)::int n from class_logs')).rows[0].n,1);
 // Invalid edit must rollback the preceding cancellation and old rule update.
 await assert.rejects(()=>call({...base,id:b.id,effectiveDate:'2026-11-17',teacherId:999}));
 assert.equal((await db.query('select count(*)::int n from schedule_entries where is_active')).rows[0].n,5);
 const id=(await db.query("select id from schedule_entries where date='2026-11-17' and is_active")).rows[0].id;
 await db.query('select cancel_occurrences_v2($1::uuid[],1)',[[id]]);
 const c=await call({...base,id:b.id,weekday:2,effectiveDate:'2026-11-17'});assert.equal(c.inserted,1); // cancelled 17th stays cancelled
 await call({kind:'individual',id:c.id,action:'stop',effectiveDate:'2026-11-24'});
 assert.equal((await db.query("select count(*)::int n from schedule_entries where is_active and date>='2026-11-17'")).rows[0].n,0);
 const logged=(await db.query("select id from schedule_entries where date='2026-11-02' and is_active")).rows[0].id;
 await assert.rejects(()=>db.query('select cancel_occurrences_v2($1::uuid[],1)',[[logged]]));
 // Group generation with two teachers and two children is one atomic operation.
 await db.exec(`INSERT INTO staff_accounts(login_id,password_hash,name,role) VALUES ('t2','hash','선생님2','employee'); INSERT INTO children(child_name) VALUES ('테스트2');`);
 const g=await call({kind:'group',teacherId:2,teacherId2:3,childIds:[1,2],weekday:3,timeSlot:'13:00',minuteSlot:0,effectiveDate:'2026-11-01',endDate:'2026-11-30',groupName:'그룹'});assert.equal(g.inserted,16);
 console.log('PASS: schema migration, Monday-to-Tuesday boundary, history preservation, rollback, cancellation exception, termination, logged-record protection, two-teacher group');

 const batch=async(rows,ids=[]) => db.query('select save_schedule_batch_v2($1::jsonb,$2::uuid[],1)',[JSON.stringify(rows),ids]);
 const occurrence={date:'2026-12-01',time_slot:'09:00',minute_slot:0,teacher_id:2,child_id:1,voucher_type:'일반',status:'scheduled'};
 await batch([occurrence]);
 const sid=(await db.query("select id from schedule_entries where date='2026-12-01' and is_active")).rows[0].id;
 const record=async(status,makeup=null)=>db.query('select record_attendance_v2($1::uuid[],$2,1,$3::jsonb)',[[sid],status,JSON.stringify(makeup)]);
 // A failed attached makeup must rollback the attendance as well.
 await assert.rejects(()=>record('absent',{date:'2026-11-30',timeSlot:'09:00',minuteSlot:0}));
 assert.equal((await db.query('select count(*)::int n from class_logs where schedule_entry_id=$1',[sid])).rows[0].n,0);
 await record('absent',{date:'2026-12-02',timeSlot:'09:00',minuteSlot:0});
 await record('absent',{date:'2026-12-02',timeSlot:'09:00',minuteSlot:0});
 const aid=(await db.query('select id from class_logs where schedule_entry_id=$1',[sid])).rows[0].id;
 assert.equal((await db.query('select count(*)::int n from schedule_entries where absent_class_log_id=$1 and is_active',[aid])).rows[0].n,1);
 await assert.rejects(()=>batch([{...occurrence,date:'2026-12-03',absent_class_log_id:aid,note:'[시간보강:10분] [결석일:2026-12-01]'}]));
 await assert.rejects(()=>batch([{...occurrence,date:'2026-12-04'}],[sid]));
 await assert.rejects(()=>record('attended'));
 console.log('PASS: atomic one-off save, linked absence, duplicate retry, 40-minute reservation cap, atomic attendance rollback, logged edit protection');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
