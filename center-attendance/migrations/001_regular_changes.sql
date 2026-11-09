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
COMMIT;
