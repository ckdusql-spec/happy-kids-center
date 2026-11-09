BEGIN;
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
COMMIT;
