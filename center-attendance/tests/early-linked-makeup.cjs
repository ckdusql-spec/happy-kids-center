const fs=require('fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{await db.exec(fs.readFileSync(__dirname+'/fixture-schema.sql','utf8'));for(const f of fs.readdirSync(__dirname+'/../migrations').filter(f=>/^0(0[1-9]|1[0-4])_/.test(f)).sort())await db.exec(fs.readFileSync(__dirname+'/../migrations/'+f,'utf8'));
await db.exec("INSERT INTO staff_accounts(login_id,name,role) VALUES('admin','admin','admin'),('teacher','teacher','employee');INSERT INTO children(child_name) VALUES('a');");
const src=(await db.query("INSERT INTO schedule_entries(date,time_slot,teacher_id,child_id,voucher_type) VALUES('2035-11-20','09:00',2,1,'일반') RETURNING id")).rows[0].id;
await db.query("SELECT record_attendance_v2(ARRAY[$1]::uuid[],'absent',2,$2)",[src,JSON.stringify({date:'2035-11-18',timeSlot:'10:00',minuteSlot:0})]);
const rows=(await db.query("SELECT * FROM schedule_entries WHERE status='makeup'")).rows;assert.equal(rows.length,1);assert.equal(new Date(rows[0].date).toISOString().slice(0,10),'2035-11-18');assert.ok(rows[0].absent_class_log_id);
await assert.rejects(()=>db.query("SELECT save_schedule_batch_v2($1,ARRAY[]::uuid[],2)",[JSON.stringify([{date:'2035-11-17',time_slot:'10:00',teacher_id:2,child_id:1,voucher_type:'일반',status:'makeup',note:'[보강]',absent_class_log_id:rows[0].absent_class_log_id}])]),/40분/);
await db.exec(fs.readFileSync(__dirname+'/../migrations/014_early_linked_makeup.sql','utf8'));
console.log('PASS: November 20 absence with November 18 linked makeup atomically saved; 40-minute capacity retained; repeat migration safe.');
}finally{await db.close()}})().catch(e=>{console.error(e.message);process.exit(1)});

