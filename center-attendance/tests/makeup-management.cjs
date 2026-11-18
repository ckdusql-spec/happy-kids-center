const fs=require('fs'),assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{await db.exec(fs.readFileSync(__dirname+'/fixture-schema.sql','utf8'));for(const f of fs.readdirSync(__dirname+'/../migrations').filter(f=>/^(00[1-9]|010)_/.test(f)).sort())await db.exec(fs.readFileSync(__dirname+'/../migrations/'+f,'utf8'));
await db.exec("INSERT INTO staff_accounts(login_id,name,role) VALUES('admin','admin','admin'),('teacher','teacher','employee'),('other','other','employee');INSERT INTO children(child_name) VALUES('test');");
const a=(await db.query("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(2,1,'2020-01-01','2020-01-01T09:00:00+09','absent') RETURNING id")).rows[0].id;
const m=(await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type,status,note) VALUES('2020-01-02','10:00',2,1,'일반','makeup','[보강] [결석일:2020-01-01]') RETURNING id")).rows[0].id;
await assert.rejects(async()=>db.query("SELECT manage_makeup_v4($1,'complete',NULL,3)",[m]),/권한/);
await db.query("SELECT manage_makeup_v4($1,'complete',NULL,2)",[m]);
await assert.rejects(async()=>db.query("SELECT manage_makeup_v4($1,'cancel',NULL,2)",[m]),/출결/);
await db.query("SELECT manage_makeup_v4($1,'link',$2,1)",[m,a]);
assert.equal((await db.query('SELECT absent_class_log_id FROM schedule_entries WHERE id=$1',[m])).rows[0].absent_class_log_id,a);
assert.equal((await db.query('SELECT count(*)::int n FROM class_logs')).rows[0].n,2);
// Older missed makeup with no schedule foreign key must not consume reservation capacity.
const a2=(await db.query("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(2,1,'2020-02-01','2020-02-01T09:00:00+09','absent') RETURNING id")).rows[0].id;
await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type,status,note,absent_class_log_id) VALUES('2020-02-02','10:00',2,1,'일반','makeup','[보강]', $1)",[a2]);
await db.exec("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(2,1,'2020-02-02','2020-02-02T10:00:00+09','absent');");
await db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],2)',[JSON.stringify([{date:'2020-02-03',time_slot:'10:00',minute_slot:0,teacher_id:2,child_id:1,voucher_type:'일반',status:'makeup',note:'[보강]',absent_class_log_id:a2}])]);
const pending=(await db.query("SELECT id FROM schedule_entries WHERE date='2020-02-03'")).rows[0].id;
await db.query("SELECT manage_makeup_v4($1,'cancel',NULL,2)",[pending]);assert.equal((await db.query('SELECT is_active FROM schedule_entries WHERE id=$1',[pending])).rows[0].is_active,false);
const replacement=JSON.stringify([{date:'2020-02-03',time_slot:'10:00',minute_slot:0,teacher_id:2,child_id:1,voucher_type:'일반',status:'makeup',note:'[보강]',absent_class_log_id:a2}]);
await db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],2)',[replacement]);
await assert.rejects(async()=>db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],2)',[replacement]),/2020-02-03/);
// Two same-day original lessons: explicit linkage must never debit the other lesson.
await db.exec("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type) VALUES('2020-03-01','09:00',2,1,'일반'),('2020-03-01','11:00',3,1,'일반');");
const first=(await db.query("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(2,1,'2020-03-01','2020-03-01T09:00:00+09','absent') RETURNING id")).rows[0].id;
const second=(await db.query("INSERT INTO class_logs(staff_id,child_id,class_date,class_time,status) VALUES(3,1,'2020-03-01','2020-03-01T11:00:00+09','absent') RETURNING id")).rows[0].id;
await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type,status,note,absent_class_log_id) VALUES('2020-03-02','09:00',2,1,'일반','makeup','[보강] [결석일:2020-03-01]',$1)",[first]);
await db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],1)',[JSON.stringify([{date:'2020-03-03',time_slot:'11:00',teacher_id:3,child_id:1,status:'makeup',note:'[보강]',absent_class_log_id:second}])]);
const ambiguous=(await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type,status,note) VALUES('2020-04-01','09:00',2,1,'일반','makeup','[보강] [결석일:2020-03-01]') RETURNING id")).rows[0].id;
assert.equal((await db.query('SELECT makeup_absence_v5(s) a FROM schedule_entries s WHERE id=$1',[ambiguous])).rows[0].a,null);
await assert.rejects(async()=>db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],1)',[JSON.stringify([{date:'2020-04-03',time_slot:'11:00',teacher_id:3,child_id:1,status:'makeup',note:'[보강]',absent_class_log_id:second}])]),/연결이 불명확/);
await assert.rejects(async()=>db.query('SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],1)',[JSON.stringify([{date:'2020-04-05',time_slot:'11:00',teacher_id:2,child_id:1,status:'makeup',note:'[보강]',absent_class_log_id:(await db.query("SELECT id FROM class_logs WHERE class_date='2020-02-02'")).rows[0].id}])]),/새 40분/);
const missedId=(await db.query("SELECT id FROM schedule_entries WHERE date='2020-02-02'")).rows[0].id;
await assert.rejects(()=>db.query("SELECT record_attendance_v2(ARRAY[$1]::uuid[],'makeup',2)",[missedId]),/다시 완료하면 40분/);
// Reapplying the migration remains safe.
await db.exec(fs.readFileSync(__dirname+'/../migrations/010_makeup_capacity_consistency.sql','utf8'));
console.log('PASS: makeup completion retains history; logged deletion blocked; explicit reviewed link; staff scope; old missed makeup releases capacity; pending cancellation.');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exit(1)});

