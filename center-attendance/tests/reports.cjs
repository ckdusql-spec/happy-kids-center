const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'center-report-test-'));
for(const f of ['makeupPolicy','attendanceReport','staffCsv','makeupManagement'])fs.writeFileSync(dir+'/'+f+'.js',ts.transpileModule(fs.readFileSync(__dirname+'/../lib/'+f+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
const r=require(dir+'/attendanceReport.js');
const schedule=(id,date,note='',extra={})=>({id,date,time_slot:'09:00',minute_slot:30,teacher_id:2,child_id:1,is_active:true,note,...extra});
const log=(id,date,status,extra={})=>({id,class_date:date,class_time:date+'T00:30:00Z',staff_id:2,child_id:1,status,...extra});
const abs=schedule('abs','2026-05-05');const lesson=schedule('makeup','2026-10-10','[보강] [결석일:2026-05-05]',{voucher_type:'아청심2'});
assert.equal(r.makeupKind(lesson),'일보강');assert.equal(r.absentDate(lesson),'2026-05-05');
assert.equal(r.matchesSchedule(lesson,log(2,'2026-10-10','makeup')),true);
let b=r.makeupBalances([abs,lesson],[log(1,'2026-05-05','absent')])[0];assert.equal(b.remainingMinutes,40);assert.equal(b.reservedMinutes,40);
b=r.makeupBalances([abs,lesson],[log(1,'2026-05-05','absent'),log(2,'2026-10-10','makeup')])[0];assert.equal(b.remainingMinutes,0);
const ten=schedule('ten','2026-10-11','[시간보강:10분] [결석일:2026-05-05]');
const twenty=schedule('twenty','2026-10-12','[시간보강:20분] [결석일:2026-05-05]');
const logs=[log(1,'2026-05-05','absent'),log(3,'2026-10-11','attended'),log(4,'2026-10-12','makeup')];
b=r.makeupBalances([abs,ten,twenty],logs)[0];assert.equal(b.usedCount,2);assert.equal(b.usedMinutes,30);assert.equal(b.remainingMinutes,10);
assert.equal(r.validAttendance([{...twenty,is_active:false}],logs).length,0);
assert.equal(r.latestLog(twenty,[...logs,log(5,'2026-10-12','absent')]).status,'absent');
const other=schedule('other','2026-05-05','',{minute_slot:40});
b=r.makeupBalances([abs,other,ten],[...logs,log(6,'2026-05-05','absent',{class_time:'2026-05-05T00:40:00Z'})])[0];assert.equal(b.ambiguous,true);assert.equal(b.usedMinutes,0);
// The authenticated download endpoint uses this same report builder.
const {staffCsvRows,csvText,STAFF_CSV_HEADERS}=require(dir+'/staffCsv.js');
const report=staffCsvRows('2026-10',[abs,{...lesson,teacher_name:'테스트교사'},ten,twenty],[...logs,log(2,'2026-10-10','makeup')],[{id:1,child_name:'테스트학생'}],[{id:2,name:'테스트교사'}]);
assert.equal(report.length,3);assert.equal(report.filter(row=>row[6]==='시간보강').length,2);assert(report[0].includes('일보강'));assert(report[0].includes('2026-05-05'));assert(report[0].includes(40));
const orphanLog=log(999,'2026-10-20','makeup');const review=staffCsvRows('2026-10',[],[orphanLog],[],[]);assert.equal(review.length,1);assert.equal(review[0][6],'보강(일정 연결 없음)');
const cancelled=staffCsvRows('2026-10',[{...lesson,is_active:false}],[log(2,'2026-10-10','makeup')],[],[]);assert.equal(cancelled.length,0);
assert(csvText(['name'],[['=formula']]).includes("'=formula"));assert.equal(STAFF_CSV_HEADERS.length,report[0].length);
const planned={...lesson,absent_class_log_id:null,makeup_source_schedule_id:'future-source',note:'[보강] [결석일:2026-11-20] [사전보강:future-source]'};
const plannedCsv=staffCsvRows('2026-10',[planned],[],[],[]);assert.equal(plannedCsv[0][14],'사전 보강 예약 · 원수업 출결 대기');assert.equal(plannedCsv[0][7],'2026-11-20');assert.equal(plannedCsv[0][10],'');
assert.equal(r.makeupBalances([abs,{...ten,makeup_source_schedule_id:'another-source',absent_class_log_id:null}],logs)[0].reservedMinutes,0);
const managed=require(dir+'/makeupManagement.js').makeupManagementRows([abs,lesson,ten,twenty],logs);
assert.equal(managed.find(x=>x.id==='makeup').state,r.isCompleted(lesson,logs)?'completed':'reserved');
const reservedManaged=require(dir+'/makeupManagement.js').makeupManagementRows([abs,lesson],[]);assert.equal(reservedManaged[0].state,'reserved');assert.equal(reservedManaged[0].date,'2026-10-10');
const completedManaged=require(dir+'/makeupManagement.js').makeupManagementRows([abs,lesson],[log(1,'2026-05-05','absent'),log(2,'2026-10-10','makeup')]);assert.equal(completedManaged[0].state,'completed');assert.equal(completedManaged[0].needsLink,false);
console.log('PASS: staff CSV keeps day/time makeup and unlinked-review rows, excludes cancellations, exports absence dates and 40-minute totals, escapes formula cells');
fs.rmSync(dir,{recursive:true,force:true});

// Missing a makeup releases its original reservation; it never creates another entitlement.
{const missed=log(1000,'2026-10-10','absent');const balances=r.makeupBalances([abs,lesson],[log(1,'2026-05-05','absent'),missed]);assert.equal(balances.length,1);assert.equal(balances[0].reservedMinutes,0);assert.equal(balances[0].remainingMinutes,40)}
