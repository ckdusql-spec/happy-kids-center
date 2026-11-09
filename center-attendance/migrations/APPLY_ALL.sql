-- 2026-11-09 통합 업데이트. 테스트 DB에서 먼저 검증하세요. 운영 데이터 삭제/초기화 SQL이 아닙니다.
BEGIN;

-- 001_regular_changes.sql
-- Review/staging first. Additive migration: existing attendance rows are never deleted.
BEGIN;
ALTER TABLE public.regular_classes ADD COLUMN IF NOT EXISTS series_id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.regular_group_classes ADD COLUMN IF NOT EXISTS series_id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS regular_rule_id bigint;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS regular_group_rule_id bigint;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS cancelled_reason text;
CREATE TABLE IF NOT EXISTS public.regular_exceptions_v2 (
  series_id uuid NOT NULL, occurrence_date date NOT NULL, child_id bigint NOT NULL,
  PRIMARY KEY(series_id, occurrence_date, child_id)
);
ALTER TABLE public.regular_exceptions_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.regular_exceptions_v2 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.regular_exceptions_v2 TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_has_log_v2(s public.schedule_entries)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.class_logs l
 WHERE l.class_date=s.date AND l.staff_id=s.teacher_id AND l.child_id=s.child_id
 AND coalesce(l.is_group,false)=coalesce(s.is_group,false)
 AND (NOT coalesce(s.is_group,false) OR coalesce(l.group_id,'')=coalesce(s.group_id,''))
 AND (l.class_time IS NULL OR
      to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=
      left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0')))
$$;
REVOKE ALL ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_regular_change_v2(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 k text := p->>'kind'; action text := coalesce(p->>'action','save');
 old_id bigint := nullif(p->>'id','')::bigint; new_id bigint;
 effective date := (p->>'effectiveDate')::date; finish date := nullif(p->>'endDate','')::date;
 old_start date; old_rule jsonb; series uuid; old_active boolean; tag text;
 teacher bigint := nullif(p->>'teacherId','')::bigint;
 teacher2 bigint := nullif(p->>'teacherId2','')::bigint;
 children_ids bigint[]; teachers bigint[]; child bigint; tid bigint; d date;
 weekday integer := nullif(p->>'weekday','')::integer;
 minute integer := coalesce(nullif(p->>'minuteSlot','')::integer,0);
 slot text := p->>'timeSlot'; enabled boolean := coalesce((p->>'isActive')::boolean,true);
 note text := coalesce(p->>'note',''); removed integer := 0; added integer := 0;
BEGIN
 -- Serialize rule changes, including concurrent creations and cancellations.
 PERFORM pg_advisory_xact_lock(406040);
 IF k NOT IN ('individual','group') OR action NOT IN ('save','stop') OR effective IS NULL THEN
   RAISE EXCEPTION '종류와 적용일을 확인하세요.';
 END IF;
 IF old_id IS NOT NULL THEN
   IF k='individual' THEN
     SELECT start_date,series_id,is_active INTO old_start,series,old_active FROM regular_classes WHERE id=old_id FOR UPDATE;
     tag := '[정기수업:'||old_id||']';
     SELECT to_jsonb(r) INTO old_rule FROM regular_classes r WHERE id=old_id;
   ELSE
     SELECT start_date,series_id,is_active INTO old_start,series,old_active FROM regular_group_classes WHERE id=old_id FOR UPDATE;
     tag := '[정기그룹:'||old_id||']';
     SELECT to_jsonb(r) INTO old_rule FROM regular_group_classes r WHERE id=old_id;
   END IF;
   IF old_start IS NULL OR NOT coalesce(old_active,false) THEN RAISE EXCEPTION '이미 변경/종료된 규칙입니다. 새로고침 후 다시 선택하세요.'; END IF;
   IF effective < old_start THEN RAISE EXCEPTION '적용일은 기존 시작일 이후여야 합니다.'; END IF;
   series := coalesce(series,gen_random_uuid());
   -- Exact legacy prefix only. Never guess ownership from child/day alone.
   IF k='individual' THEN
     UPDATE schedule_entries SET regular_rule_id=old_id
     WHERE regular_rule_id IS NULL AND NOT coalesce(is_group,false) AND starts_with(coalesce(schedule_entries.note,''),tag);
   ELSE
     UPDATE schedule_entries SET regular_group_rule_id=old_id
     WHERE regular_group_rule_id IS NULL AND coalesce(is_group,false) AND starts_with(coalesce(schedule_entries.note,''),tag);
   END IF;
   IF EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.date>=effective
     AND e.regular_rule_id IS NULL AND e.regular_group_rule_id IS NULL
     AND coalesce(e.note,'') !~ '^\[정기(수업|그룹):[0-9]+\]'
     AND extract(dow FROM e.date)=(old_rule->>'weekday')::integer
     AND left(e.time_slot,2)=left(coalesce(old_rule->>'time_slot',old_rule->>'hour'),2)
     AND coalesce(e.minute_slot,0)=coalesce((old_rule->>'minute_slot')::integer,(old_rule->>'minute')::integer,0)
     AND e.teacher_id=(old_rule->>'teacher_id')::bigint
     AND ((k='individual' AND e.child_id=(old_rule->>'child_id')::bigint AND NOT coalesce(e.is_group,false))
       OR (k='group' AND coalesce(e.is_group,false) AND EXISTS(SELECT 1 FROM regular_group_class_members m WHERE m.regular_group_class_id=old_id AND m.child_id=e.child_id AND m.is_active)))) THEN
     RAISE EXCEPTION '기존 규칙과 연결되지 않은 일정 후보가 있습니다. 자동으로 추정하여 변경하지 않았습니다. 기존 일정 연결을 먼저 확인하세요.';
   END IF;
   IF EXISTS(SELECT 1 FROM schedule_entries s WHERE s.is_active AND s.date>=effective
      AND ((k='individual' AND s.regular_rule_id=old_id) OR (k='group' AND s.regular_group_rule_id=old_id))
      AND schedule_has_log_v2(s)) THEN
     RAISE EXCEPTION '적용일 이후에 출결이 기록된 수업이 있습니다. 기록 이후로 적용일을 조정하세요. 기존 기록은 변경하지 않았습니다.';
   END IF;
   UPDATE schedule_entries s SET is_active=false, cancelled_reason='정기수업 '||action||' 적용일 '||effective
   WHERE s.is_active AND s.date>=effective
     AND ((k='individual' AND s.regular_rule_id=old_id) OR (k='group' AND s.regular_group_rule_id=old_id));
   GET DIAGNOSTICS removed = ROW_COUNT;
   IF k='individual' THEN
     UPDATE regular_classes SET end_date=effective-1,is_active=false,series_id=series WHERE id=old_id;
   ELSE
     UPDATE regular_group_classes SET end_date=effective-1,is_active=false,series_id=series WHERE id=old_id;
   END IF;
 ELSE
   series := gen_random_uuid();
   IF action='stop' THEN RAISE EXCEPTION '종료할 정기수업을 선택하세요.'; END IF;
 END IF;
 IF action='stop' THEN RETURN jsonb_build_object('cancelled',removed,'inserted',0); END IF;
 IF finish IS NULL OR finish<effective OR finish>effective+interval '6 years'
   OR weekday IS NULL OR weekday NOT BETWEEN 0 AND 6 OR minute NOT IN (0,10,20,30,40,50)
   OR slot IS NULL OR slot !~ '^([01][0-9]|2[0-3]):00$' THEN
   RAISE EXCEPTION '요일·시간·기간을 확인하세요. 생성 기간은 6년 이내입니다.';
 END IF;
 IF teacher IS NULL OR NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=teacher AND is_active) THEN RAISE EXCEPTION '담당자를 확인하세요.'; END IF;
 teachers := ARRAY[teacher];
 IF k='group' AND teacher2 IS NOT NULL THEN
   IF teacher2=teacher OR NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=teacher2 AND is_active) THEN RAISE EXCEPTION '두 번째 담당자를 확인하세요.'; END IF;
   teachers := array_append(teachers,teacher2);
 END IF;
 IF k='individual' THEN
   children_ids := ARRAY[(p->>'childId')::bigint];
   IF nullif(p->>'voucherType','') IS NULL THEN RAISE EXCEPTION '바우처를 선택하세요.'; END IF;
 ELSE
   SELECT array_agg(DISTINCT value::bigint) INTO children_ids FROM jsonb_array_elements_text(p->'childIds');
   IF nullif(trim(p->>'groupName'),'') IS NULL THEN RAISE EXCEPTION '그룹명을 입력하세요.'; END IF;
 END IF;
 IF coalesce(cardinality(children_ids),0)=0 THEN RAISE EXCEPTION '학생을 선택하세요.'; END IF;
 FOREACH child IN ARRAY children_ids LOOP
   IF child IS NULL OR NOT EXISTS(SELECT 1 FROM children WHERE id=child AND is_active) THEN RAISE EXCEPTION '학생을 확인하세요.'; END IF;
 END LOOP;
 IF k='individual' THEN
   INSERT INTO regular_classes(child_id,teacher_id,weekday,time_slot,minute_slot,start_date,end_date,voucher_type,note,is_active,series_id)
   VALUES(children_ids[1],teacher,weekday,slot,minute,effective,finish,p->>'voucherType',note,enabled,series) RETURNING id INTO new_id;
   tag := '[정기수업:'||new_id||']';
 ELSE
   IF teacher2 IS NOT NULL THEN note := note||' [보조교사:'||teacher2||':'||(SELECT name FROM staff_accounts WHERE id=teacher2)||']'; END IF;
   INSERT INTO regular_group_classes(teacher_id,weekday,time_slot,minute_slot,start_date,end_date,group_name,note,is_active,series_id)
   VALUES(teacher,weekday,slot,minute,effective,finish,p->>'groupName',note,enabled,series) RETURNING id INTO new_id;
   INSERT INTO regular_group_class_members(regular_group_class_id,child_id,is_active) SELECT new_id,unnest(children_ids),true;
   tag := '[정기그룹:'||new_id||']';
 END IF;
 IF enabled THEN
  FOR d IN SELECT effective+i FROM generate_series(0,finish-effective) i WHERE extract(dow FROM effective+i)=weekday LOOP
   FOREACH child IN ARRAY children_ids LOOP
    IF EXISTS(SELECT 1 FROM regular_exceptions_v2 e WHERE e.series_id=series AND e.occurrence_date=d AND e.child_id=child) THEN CONTINUE; END IF;
    FOREACH tid IN ARRAY teachers LOOP
     IF EXISTS(SELECT 1 FROM schedule_entries s WHERE s.is_active AND s.date=d AND s.time_slot=slot AND coalesce(s.minute_slot,0)=minute
        AND (s.child_id=child OR s.teacher_id=tid)
        AND NOT (k='group' AND s.regular_group_rule_id=new_id)) THEN
       RAISE EXCEPTION '학생 또는 담당자의 기존 일정과 충돌합니다: % %:%',d,left(slot,2),lpad(minute::text,2,'0');
     END IF;
     INSERT INTO schedule_entries(date,time_slot,minute_slot,room_number,teacher_id,teacher_name,class_type,child_id,voucher_type,status,note,is_active,is_group,group_id,group_name,regular_rule_id,regular_group_rule_id)
     VALUES(d,slot,minute,1,tid,(SELECT name FROM staff_accounts WHERE id=tid),k,child,
       CASE WHEN k='group' THEN '그룹수업' ELSE p->>'voucherType' END,'scheduled',tag||' '||coalesce(p->>'note',''),true,k='group',
       CASE WHEN k='group' THEN new_id::text END,CASE WHEN k='group' THEN p->>'groupName' END,
       CASE WHEN k='individual' THEN new_id END,CASE WHEN k='group' THEN new_id END);
     added := added+1;
    END LOOP;
   END LOOP;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('id',new_id,'cancelled',removed,'inserted',added,'effectiveDate',effective);
END $$;
REVOKE ALL ON FUNCTION public.apply_regular_change_v2(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_regular_change_v2(jsonb) TO service_role;


-- 002_cancel_occurrences.sql
CREATE OR REPLACE FUNCTION public.cancel_occurrences_v2(p_ids uuid[], p_actor bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.schedule_entries; actor_role text; series uuid; rid bigint; count_cancelled integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO actor_role FROM staff_accounts WHERE id=p_actor AND is_active;
 IF actor_role IS NULL THEN RAISE EXCEPTION '접근 권한이 없습니다.'; END IF;
 IF cardinality(p_ids)>100 OR cardinality(p_ids)=0 THEN RAISE EXCEPTION '취소할 일정을 확인하세요.'; END IF;
 FOR s IN SELECT * FROM schedule_entries WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE LOOP
   IF actor_role<>'admin' AND s.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 일정만 취소할 수 있습니다.'; END IF;
   IF NOT coalesce(s.is_active,false) THEN CONTINUE; END IF;
   IF schedule_has_log_v2(s) THEN RAISE EXCEPTION '출결이 있는 일정은 삭제할 수 없습니다. 출결 기록을 확인하세요.'; END IF;
   series:=NULL;
   IF coalesce(s.is_group,false) THEN
     rid:=coalesce(s.regular_group_rule_id,substring(coalesce(s.note,'') from '^\[정기그룹:([0-9]+)\]')::bigint);
     SELECT series_id INTO series FROM regular_group_classes WHERE id=rid;
   ELSE
     rid:=coalesce(s.regular_rule_id,substring(coalesce(s.note,'') from '^\[정기수업:([0-9]+)\]')::bigint);
     SELECT series_id INTO series FROM regular_classes WHERE id=rid;
   END IF;
   IF series IS NOT NULL AND s.child_id IS NOT NULL THEN
     INSERT INTO regular_exceptions_v2 VALUES(series,s.date,s.child_id) ON CONFLICT DO NOTHING;
   END IF;
   UPDATE schedule_entries SET is_active=false,cancelled_reason='개별 회차 취소' WHERE id=s.id;
   count_cancelled:=count_cancelled+1;
 END LOOP;
 RETURN count_cancelled;
END $$;
REVOKE ALL ON FUNCTION public.cancel_occurrences_v2(uuid[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_occurrences_v2(uuid[],bigint) TO service_role;


-- 003_retire_legacy_delete.sql
-- Old deletion RPCs bypass the new effective-date and attendance protections.
-- Keep definitions for rollback review; revoke browser execution only.
BEGIN;
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('delete_unlogged_regular_class_schedules','delete_unlogged_regular_group_schedules')
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
 END LOOP;
END $$;


-- 004_attendance_links.sql
ALTER TABLE public.class_logs ADD COLUMN IF NOT EXISTS schedule_entry_id uuid REFERENCES public.schedule_entries(id) ON DELETE RESTRICT;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS absent_class_log_id bigint REFERENCES public.class_logs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_class_logs_schedule_entry_v2 ON public.class_logs(schedule_entry_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_absent_log_v2 ON public.schedule_entries(absent_class_log_id);
-- No automatic backfill: legacy date-only links can be ambiguous.
CREATE OR REPLACE FUNCTION public.schedule_has_log_v2(s public.schedule_entries)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.class_logs l WHERE l.schedule_entry_id=s.id OR (
 l.schedule_entry_id IS NULL AND l.class_date=s.date AND l.staff_id=s.teacher_id AND l.child_id=s.child_id
 AND coalesce(l.is_group,false)=coalesce(s.is_group,false)
 AND (NOT coalesce(s.is_group,false) OR coalesce(l.group_id,'')=coalesce(s.group_id,''))
 AND (l.class_time IS NULL OR to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'))))
$$;
REVOKE ALL ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) TO service_role;


-- 005_atomic_schedule_save.sql
CREATE OR REPLACE FUNCTION public.save_schedule_batch_v2(p_rows jsonb,p_replace_ids uuid[],p_actor bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; s public.schedule_entries; actor_role text; n integer:=0; absence public.class_logs; minutes integer; booked integer;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO actor_role FROM staff_accounts WHERE id=p_actor AND is_active;
 IF actor_role IS NULL THEN RAISE EXCEPTION '접근 권한이 없습니다.'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION '일정을 확인하세요.'; END IF;
 FOR s IN SELECT * FROM schedule_entries WHERE id=ANY(p_replace_ids) FOR UPDATE LOOP
  IF actor_role<>'admin' AND s.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 일정만 수정할 수 있습니다.'; END IF;
  IF schedule_has_log_v2(s) THEN RAISE EXCEPTION '출결이 있는 일정은 변경할 수 없습니다. 기록을 먼저 확인하세요.'; END IF;
  IF s.regular_rule_id IS NOT NULL OR s.regular_group_rule_id IS NOT NULL OR coalesce(s.note,'') ~ '^\[정기(수업|그룹):' THEN RAISE EXCEPTION '정기수업은 정기수업 관리 화면에서 변경하세요.'; END IF;
 END LOOP;
 UPDATE schedule_entries SET is_active=false,cancelled_reason='개별 일정 수정' WHERE id=ANY(p_replace_ids);
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  s:=jsonb_populate_record(NULL::public.schedule_entries,r);
  IF actor_role<>'admin' AND s.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 일정만 저장할 수 있습니다.'; END IF;
  IF s.date IS NULL OR s.time_slot !~ '^([01][0-9]|2[0-3]):00$' OR s.time_slot IS NULL OR coalesce(s.minute_slot,0) NOT IN (0,10,20,30,40,50) THEN RAISE EXCEPTION '날짜와 시간을 확인하세요.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM children WHERE id=s.child_id AND is_active) OR NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=s.teacher_id AND is_active) THEN RAISE EXCEPTION '학생과 담당자를 확인하세요.'; END IF;
  IF EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.date=s.date AND e.time_slot=s.time_slot AND coalesce(e.minute_slot,0)=coalesce(s.minute_slot,0)
   AND (e.child_id=s.child_id OR e.teacher_id=s.teacher_id)
   AND NOT (coalesce(s.is_group,false) AND coalesce(e.is_group,false) AND s.group_id IS NOT NULL AND e.group_id=s.group_id AND (e.child_id<>s.child_id OR e.teacher_id<>s.teacher_id))) THEN RAISE EXCEPTION '같은 시간의 학생 또는 담당자 일정이 이미 있습니다.'; END IF;
  IF s.absent_class_log_id IS NOT NULL THEN
   SELECT * INTO absence FROM class_logs WHERE id=s.absent_class_log_id FOR UPDATE;
   IF absence.id IS NULL OR absence.child_id<>s.child_id OR absence.status NOT IN ('absent','same_day_absent') THEN RAISE EXCEPTION '연결할 결석 수업을 확인하세요.'; END IF;
   IF s.date<absence.class_date THEN RAISE EXCEPTION '보강일은 원래 결석일 이후여야 합니다.'; END IF;
   minutes:=CASE WHEN s.voucher_type='시간보강' OR coalesce(s.note,'') LIKE '%[시간보강:%' THEN substring(s.note from '\[시간보강:([0-9]+)분\]')::integer ELSE 40 END;
   IF minutes IS NULL OR minutes NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION '보강은 1~40분입니다.'; END IF;
   SELECT coalesce(sum(CASE WHEN e.voucher_type='시간보강' OR coalesce(e.note,'') LIKE '%[시간보강:%'
     THEN coalesce(substring(e.note from '\[시간보강:([0-9]+)분\]')::integer,40) ELSE 40 END),0)::integer INTO booked
   FROM schedule_entries e
   WHERE e.is_active AND e.child_id=s.child_id AND (
     e.absent_class_log_id=absence.id OR
     (e.absent_class_log_id IS NULL AND (coalesce(e.note,'') LIKE '%[결석기록:'||absence.id||']%' OR
       (coalesce(e.note,'') LIKE '%[결석일:'||absence.class_date||']%' AND coalesce(e.note,'') NOT LIKE '%[결석기록:%'))))
   AND NOT EXISTS(SELECT 1 FROM class_logs l WHERE l.schedule_entry_id=e.id AND l.status IN ('absent','same_day_absent'));
   IF booked+minutes>40 THEN RAISE EXCEPTION '기존 완료 또는 예약 보강을 합하면 40분을 초과합니다.'; END IF;
  END IF;
  INSERT INTO schedule_entries(date,time_slot,minute_slot,room_number,teacher_id,teacher_name,class_type,child_id,voucher_type,status,note,is_active,is_group,group_id,group_name,absent_class_log_id)
  VALUES(s.date,s.time_slot,coalesce(s.minute_slot,0),coalesce(s.room_number,1),s.teacher_id,(SELECT name FROM staff_accounts WHERE id=s.teacher_id),CASE WHEN coalesce(s.is_group,false) THEN 'group' ELSE 'individual' END,s.child_id,coalesce(s.voucher_type,'일반'),coalesce(s.status,'scheduled'),s.note,true,coalesce(s.is_group,false),s.group_id,s.group_name,s.absent_class_log_id);
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.save_schedule_batch_v2(jsonb,uuid[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_schedule_batch_v2(jsonb,uuid[],bigint) TO service_role;


-- 006_atomic_attendance.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_logs_schedule_entry_v2 ON public.class_logs(schedule_entry_id) WHERE schedule_entry_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.record_attendance_v2(p_ids uuid[],p_status text,p_actor bigint,p_makeup jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.schedule_entries; actor_role text; log_id bigint; saved integer:=0; makeup_row jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO actor_role FROM staff_accounts WHERE id=p_actor AND is_active;
 IF actor_role IS NULL THEN RAISE EXCEPTION '접근 권한이 없습니다.'; END IF;
 IF p_status NOT IN ('attended','absent','same_day_absent','makeup') OR p_status IS NULL OR coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION '출결 상태와 일정을 확인하세요.'; END IF;
 FOR s IN SELECT * FROM schedule_entries WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE LOOP
  IF NOT coalesce(s.is_active,false) THEN RAISE EXCEPTION '취소된 일정에는 출결을 입력할 수 없습니다.'; END IF;
  IF actor_role<>'admin' AND s.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 수업만 처리할 수 있습니다.'; END IF;
  SELECT l.id INTO log_id FROM class_logs l WHERE l.schedule_entry_id=s.id OR (l.schedule_entry_id IS NULL
    AND l.class_date=s.date AND l.staff_id=s.teacher_id AND l.child_id=s.child_id
    AND coalesce(l.is_group,false)=coalesce(s.is_group,false)
    AND (NOT coalesce(s.is_group,false) OR coalesce(l.group_id,'')=coalesce(s.group_id,''))
    AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'))
   ORDER BY l.updated_at DESC NULLS LAST,l.id DESC LIMIT 1 FOR UPDATE;
  IF log_id IS NOT NULL AND p_status NOT IN ('absent','same_day_absent') AND EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.absent_class_log_id=log_id) THEN
   RAISE EXCEPTION '이 결석에 연결된 보강이 있습니다. 연결된 보강을 먼저 확인하세요.';
  END IF;
  IF log_id IS NULL THEN
   INSERT INTO class_logs(schedule_entry_id,staff_id,child_id,class_date,class_time,status,voucher_type,is_group,group_id,group_name)
   VALUES(s.id,s.teacher_id,s.child_id,s.date,(s.date::text||' '||left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'))::timestamp AT TIME ZONE 'Asia/Seoul',p_status,s.voucher_type,coalesce(s.is_group,false),s.group_id,s.group_name) RETURNING id INTO log_id;
  ELSE
   UPDATE class_logs SET schedule_entry_id=s.id,status=p_status,voucher_type=s.voucher_type,is_group=coalesce(s.is_group,false),group_id=s.group_id,group_name=s.group_name,updated_at=now() WHERE id=log_id;
  END IF;
  IF p_makeup IS NOT NULL AND p_makeup <> 'null'::jsonb THEN
   IF p_status NOT IN ('absent','same_day_absent') OR coalesce(s.is_group,false) OR cardinality(p_ids)<>1 THEN RAISE EXCEPTION '개인 수업 결석에만 보강을 함께 예약할 수 있습니다.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.absent_class_log_id=log_id AND e.date=(p_makeup->>'date')::date AND e.time_slot=p_makeup->>'timeSlot' AND coalesce(e.minute_slot,0)=coalesce((p_makeup->>'minuteSlot')::integer,0)) THEN
    makeup_row:=jsonb_build_object('date',p_makeup->>'date','time_slot',p_makeup->>'timeSlot','minute_slot',coalesce((p_makeup->>'minuteSlot')::integer,0),'teacher_id',s.teacher_id,'child_id',s.child_id,'voucher_type',s.voucher_type,'status','makeup','note','[보강] [결석일:'||s.date||'] [결석기록:'||log_id||']','absent_class_log_id',log_id,'is_group',false);
    PERFORM save_schedule_batch_v2(jsonb_build_array(makeup_row),ARRAY[]::uuid[],p_actor);
   END IF;
  END IF;
  saved:=saved+1;
 END LOOP;
 IF saved<>cardinality(p_ids) THEN RAISE EXCEPTION '일정이 변경되었습니다. 새로고침 후 다시 시도하세요.'; END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.record_attendance_v2(uuid[],text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance_v2(uuid[],text,bigint,jsonb) TO service_role;


-- 007_monthly_lessons.sql
CREATE TABLE IF NOT EXISTS public.monthly_lesson_plans (
 month date NOT NULL CHECK (extract(day from month)=1),
 child_id bigint NOT NULL REFERENCES public.children(id) ON DELETE RESTRICT,
 teacher_id bigint NOT NULL REFERENCES public.staff_accounts(id) ON DELETE RESTRICT,
 voucher_type text NOT NULL,
 target smallint NOT NULL DEFAULT 4 CHECK(target IN (3,4)),
 closed boolean NOT NULL DEFAULT false, reason text NOT NULL DEFAULT '',
 updated_by bigint REFERENCES public.staff_accounts(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(month,child_id,teacher_id,voucher_type)
);
ALTER TABLE public.monthly_lesson_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_lesson_plans FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.monthly_lesson_plans TO service_role;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS regular_credit_month date;
CREATE INDEX IF NOT EXISTS idx_schedule_regular_credit ON public.schedule_entries(regular_credit_month) WHERE regular_credit_month IS NOT NULL;
CREATE OR REPLACE FUNCTION public.is_regular_lesson_v3(s public.schedule_entries)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(s.voucher_type,'')<>'시간보강' AND coalesce(s.status,'')<>'makeup'
 AND coalesce(s.note,'') !~ '\[보강\]|\[시간보강:' AND s.absent_class_log_id IS NULL
$$;
-- Shared lock serializes month changes with schedule and attendance RPCs.
CREATE OR REPLACE FUNCTION public.guard_monthly_schedule_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.schedule_entries;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 IF current_setting('role',true) IN ('anon','authenticated') THEN
  IF TG_OP='INSERT' AND NEW.regular_credit_month IS NOT NULL THEN RAISE EXCEPTION '이월 배정은 관리자 화면에서 처리하세요.'; END IF;
  IF TG_OP='UPDATE' AND NEW.regular_credit_month IS DISTINCT FROM OLD.regular_credit_month THEN RAISE EXCEPTION '이월 배정은 관리자 화면에서 처리하세요.'; END IF;
 END IF;
 IF TG_OP<>'INSERT' THEN
  s:=OLD;
  IF s.is_active AND is_regular_lesson_v3(s) AND EXISTS(SELECT 1 FROM monthly_lesson_plans p WHERE p.closed AND p.month=coalesce(s.regular_credit_month,date_trunc('month',s.date)::date) AND p.child_id=s.child_id AND p.teacher_id=s.teacher_id AND p.voucher_type=s.voucher_type) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION '마감된 월입니다. 월별 수업 관리에서 마감을 해제하세요.'; END IF;
   IF ROW(NEW.date,NEW.child_id,NEW.teacher_id,NEW.voucher_type,NEW.is_active,NEW.regular_credit_month,NEW.note,NEW.status,NEW.time_slot,NEW.minute_slot) IS DISTINCT FROM ROW(OLD.date,OLD.child_id,OLD.teacher_id,OLD.voucher_type,OLD.is_active,OLD.regular_credit_month,OLD.note,OLD.status,OLD.time_slot,OLD.minute_slot) THEN RAISE EXCEPTION '마감된 월입니다. 월별 수업 관리에서 마감을 해제하세요.'; END IF;
  END IF;
  IF s.regular_credit_month IS NOT NULL THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION '이월 배정을 먼저 해제하세요.'; END IF;
   IF ROW(NEW.date,NEW.child_id,NEW.teacher_id,NEW.voucher_type,NEW.is_active,NEW.time_slot,NEW.minute_slot) IS DISTINCT FROM ROW(OLD.date,OLD.child_id,OLD.teacher_id,OLD.voucher_type,OLD.is_active,OLD.time_slot,OLD.minute_slot) THEN RAISE EXCEPTION '이월 배정을 먼저 해제한 뒤 일정을 변경하세요.'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  s:=NEW;
  IF s.regular_credit_month IS NOT NULL AND (NOT is_regular_lesson_v3(s) OR s.regular_credit_month<>(date_trunc('month',s.date)-interval '1 month')::date) THEN RAISE EXCEPTION '정규수업만 바로 전월에 배정할 수 있습니다.'; END IF;
  IF s.is_active AND is_regular_lesson_v3(s) AND (TG_OP='INSERT' OR ROW(NEW.date,NEW.child_id,NEW.teacher_id,NEW.voucher_type,NEW.is_active,NEW.regular_credit_month) IS DISTINCT FROM ROW(OLD.date,OLD.child_id,OLD.teacher_id,OLD.voucher_type,OLD.is_active,OLD.regular_credit_month)) AND EXISTS(SELECT 1 FROM monthly_lesson_plans p WHERE p.closed AND p.month=coalesce(s.regular_credit_month,date_trunc('month',s.date)::date) AND p.child_id=s.child_id AND p.teacher_id=s.teacher_id AND p.voucher_type=s.voucher_type) THEN RAISE EXCEPTION '마감된 월에는 일정을 추가할 수 없습니다.'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_monthly_schedule_v3 ON public.schedule_entries;
CREATE TRIGGER guard_monthly_schedule_v3 BEFORE INSERT OR UPDATE OR DELETE ON public.schedule_entries FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_schedule_v3();
CREATE OR REPLACE FUNCTION public.guard_monthly_attendance_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.class_logs; i integer;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 FOR i IN 1..2 LOOP
  IF i=1 AND TG_OP='INSERT' OR i=2 AND TG_OP='DELETE' THEN CONTINUE; END IF;
  IF i=1 THEN l:=OLD; ELSE l:=NEW; END IF;
  IF EXISTS(SELECT 1 FROM schedule_entries s JOIN monthly_lesson_plans p ON p.month=coalesce(s.regular_credit_month,date_trunc('month',s.date)::date) AND p.child_id=s.child_id AND p.teacher_id=s.teacher_id AND p.voucher_type=s.voucher_type AND p.closed
    WHERE s.is_active AND is_regular_lesson_v3(s) AND (s.id=l.schedule_entry_id OR (l.schedule_entry_id IS NULL AND s.date=l.class_date AND s.child_id=l.child_id AND s.teacher_id=l.staff_id AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0')))) THEN RAISE EXCEPTION '마감된 월의 출결입니다. 월별 수업 관리에서 마감을 해제하세요.'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_monthly_attendance_v3 ON public.class_logs;
CREATE TRIGGER guard_monthly_attendance_v3 BEFORE INSERT OR UPDATE OR DELETE ON public.class_logs FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_attendance_v3();
CREATE OR REPLACE FUNCTION public.manage_monthly_lessons_v3(p jsonb,p_actor bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date; cid bigint; tid bigint; v text; n integer; t integer; s public.schedule_entries; before_data jsonb; act text:=p->>'action';
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 IF NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=p_actor AND is_active AND role='admin') THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 IF act IN ('allocate','unallocate') THEN
  SELECT * INTO STRICT s FROM schedule_entries WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT s.is_active OR NOT is_regular_lesson_v3(s) THEN RAISE EXCEPTION '활성 정규수업만 배정할 수 있습니다. 보강은 제외됩니다.'; END IF;
  cid:=s.child_id;tid:=s.teacher_id;v:=s.voucher_type;
  m:=(date_trunc('month',s.date)-interval '1 month')::date;
  IF act='allocate' THEN
   IF s.regular_credit_month=m THEN RETURN; END IF;
   SELECT coalesce((SELECT target FROM monthly_lesson_plans WHERE month=m AND child_id=cid AND teacher_id=tid AND voucher_type=v),4) INTO t;
   SELECT count(*) INTO n FROM schedule_entries e WHERE e.is_active AND is_regular_lesson_v3(e) AND e.child_id=cid AND e.teacher_id=tid AND e.voucher_type=v AND coalesce(e.regular_credit_month,date_trunc('month',e.date)::date)=m;
   IF n>=t THEN RAISE EXCEPTION '전월 정규수업 목표가 이미 채워져 있습니다.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM monthly_lesson_plans WHERE month=m AND child_id=cid AND teacher_id=tid AND voucher_type=v) AND n=0 THEN RAISE EXCEPTION '전월 수업이 없습니다. 전월 화면에서 해당 수업의 목표를 먼저 확인하세요.'; END IF;
  END IF;
  before_data:=to_jsonb(s);
  UPDATE schedule_entries SET regular_credit_month=CASE WHEN act='allocate' THEN m ELSE NULL END WHERE id=s.id;
  INSERT INTO audit_logs(action_type,actor_staff_id,target_table,before_data,after_data) VALUES('monthly_'||act,p_actor,'schedule_entries',before_data,jsonb_build_object('id',s.id,'month',CASE WHEN act='allocate' THEN m ELSE NULL END));
  RETURN;
 END IF;
 IF coalesce(p->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '월을 확인하세요.'; END IF;
 m:=((p->>'month')||'-01')::date;cid:=(p->>'childId')::bigint;tid:=(p->>'teacherId')::bigint;v:=p->>'voucherType';
 IF cid IS NULL OR tid IS NULL OR v IS NULL OR NOT EXISTS(SELECT 1 FROM children WHERE id=cid) OR NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=tid) THEN RAISE EXCEPTION '학생/담당자/바우처를 확인하세요.'; END IF;
 SELECT to_jsonb(x) INTO before_data FROM monthly_lesson_plans x WHERE month=m AND child_id=cid AND teacher_id=tid AND voucher_type=v;
 IF act='target' THEN
  t:=(p->>'target')::integer;
  IF t IS NULL OR t NOT IN (3,4) OR (t=3 AND length(trim(coalesce(p->>'reason','')))=0) THEN RAISE EXCEPTION '목표는 3회 또는 4회이며 3회 예외는 사유가 필요합니다.'; END IF;
  IF coalesce((before_data->>'closed')::boolean,false) THEN RAISE EXCEPTION '마감을 먼저 해제하세요.'; END IF;
  INSERT INTO monthly_lesson_plans(month,child_id,teacher_id,voucher_type,target,reason,updated_by) VALUES(m,cid,tid,v,t,coalesce(p->>'reason',''),p_actor)
  ON CONFLICT(month,child_id,teacher_id,voucher_type) DO UPDATE SET target=excluded.target,reason=excluded.reason,updated_by=p_actor,updated_at=now();
 ELSIF act IN ('close','reopen') THEN
  IF act='close' THEN
   SELECT coalesce((SELECT target FROM monthly_lesson_plans WHERE month=m AND child_id=cid AND teacher_id=tid AND voucher_type=v),4) INTO t;
   SELECT count(*) INTO n FROM schedule_entries e WHERE e.is_active AND is_regular_lesson_v3(e) AND e.child_id=cid AND e.teacher_id=tid AND e.voucher_type=v AND coalesce(e.regular_credit_month,date_trunc('month',e.date)::date)=m;
   IF n<>t THEN RAISE EXCEPTION '배정된 정규수업 횟수를 목표와 맞춘 뒤 마감하세요.'; END IF;
   IF EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND is_regular_lesson_v3(e) AND e.child_id=cid AND e.teacher_id=tid AND e.voucher_type=v AND coalesce(e.regular_credit_month,date_trunc('month',e.date)::date)=m AND (e.date>(now() AT TIME ZONE 'Asia/Seoul')::date OR NOT EXISTS(SELECT 1 FROM class_logs l WHERE (l.schedule_entry_id=e.id OR (l.schedule_entry_id IS NULL AND l.class_date=e.date AND l.staff_id=e.teacher_id AND l.child_id=e.child_id AND coalesce(l.is_group,false)=coalesce(e.is_group,false) AND (NOT coalesce(e.is_group,false) OR coalesce(l.group_id,'')=coalesce(e.group_id,'')) AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(e.time_slot,2)||':'||lpad(coalesce(e.minute_slot,0)::text,2,'0'))) AND l.status IN ('attended','absent','same_day_absent')))) THEN RAISE EXCEPTION '미래 일정 또는 미처리 출결이 있습니다.'; END IF;
  END IF;
  INSERT INTO monthly_lesson_plans(month,child_id,teacher_id,voucher_type,closed,updated_by) VALUES(m,cid,tid,v,act='close',p_actor)
  ON CONFLICT(month,child_id,teacher_id,voucher_type) DO UPDATE SET closed=excluded.closed,updated_by=p_actor,updated_at=now();
 ELSE RAISE EXCEPTION '지원하지 않는 요청입니다.';
 END IF;
 INSERT INTO audit_logs(action_type,actor_staff_id,target_table,before_data,after_data) VALUES('monthly_'||act,p_actor,'monthly_lesson_plans',before_data,p);
END $$;
REVOKE ALL ON FUNCTION public.manage_monthly_lessons_v3(jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_monthly_lessons_v3(jsonb,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.guard_monthly_schedule_v3(),public.guard_monthly_attendance_v3(),public.is_regular_lesson_v3(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_regular_lesson_v3(public.schedule_entries) TO service_role;

COMMIT;
