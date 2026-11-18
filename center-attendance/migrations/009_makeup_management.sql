BEGIN;
CREATE OR REPLACE FUNCTION public.makeup_attendance_status_v4(s public.schedule_entries)
RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT l.status FROM class_logs l WHERE l.schedule_entry_id=s.id OR (l.schedule_entry_id IS NULL AND l.child_id=s.child_id AND l.staff_id=s.teacher_id AND l.class_date=s.date AND coalesce(l.is_group,false)=coalesce(s.is_group,false) AND (NOT coalesce(s.is_group,false) OR coalesce(l.group_id,'')=coalesce(s.group_id,'')) AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0')) ORDER BY l.updated_at DESC NULLS LAST,l.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.makeup_attendance_status_v4(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.makeup_attendance_status_v4(public.schedule_entries) TO service_role;
CREATE OR REPLACE FUNCTION public.manage_makeup_v4(p_id uuid,p_action text,p_absence bigint,p_actor bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s schedule_entries; a class_logs; role_name text; used integer; minutes integer;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO role_name FROM staff_accounts WHERE id=p_actor AND is_active;
 SELECT * INTO s FROM schedule_entries WHERE id=p_id FOR UPDATE;
 IF role_name IS NULL OR s.id IS NULL OR NOT coalesce(s.is_active,false) OR (role_name<>'admin' AND s.teacher_id<>p_actor) THEN RAISE EXCEPTION '보강 일정과 권한을 확인하세요.'; END IF;
 IF coalesce(s.is_group,false) OR is_regular_lesson_v3(s) THEN RAISE EXCEPTION '개인 보강 일정만 처리할 수 있습니다.'; END IF;
 IF p_action='cancel' THEN PERFORM cancel_occurrences_v2(ARRAY[s.id],p_actor); RETURN; END IF;
 IF p_action='complete' THEN
  IF s.date>(now() AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION '미래 보강은 완료 처리할 수 없습니다.'; END IF;
  IF schedule_has_log_v2(s) THEN RAISE EXCEPTION '이미 출결이 기록되어 있습니다. 기존 출결 수정에서 확인하세요.'; END IF;
  PERFORM record_attendance_v2(ARRAY[s.id],'makeup',p_actor); RETURN;
 END IF;
 IF p_action='link' THEN
  IF role_name<>'admin' THEN RAISE EXCEPTION '결석 연결 정리는 관리자만 가능합니다.'; END IF;
  IF s.absent_class_log_id IS NOT NULL OR s.makeup_source_schedule_id IS NOT NULL THEN RAISE EXCEPTION '이미 연결된 보강은 다시 연결할 수 없습니다.'; END IF;
  SELECT * INTO a FROM class_logs WHERE id=p_absence FOR UPDATE;
  IF a.id IS NULL OR a.child_id<>s.child_id OR a.status NOT IN ('absent','same_day_absent') OR coalesce(a.is_group,false) OR a.class_date::text IS DISTINCT FROM substring(s.note from '\[결석일:([0-9-]+)\]') THEN RAISE EXCEPTION '같은 학생·결석일의 결석 수업을 선택하세요.'; END IF;
  minutes:=CASE WHEN s.note LIKE '%[시간보강:%' THEN coalesce(substring(s.note from '\[시간보강:([0-9]+)분\]')::integer,40) ELSE 40 END;
  SELECT coalesce(sum(CASE WHEN e.note LIKE '%[시간보강:%' THEN coalesce(substring(e.note from '\[시간보강:([0-9]+)분\]')::integer,40) ELSE 40 END),0) INTO used FROM schedule_entries e WHERE e.is_active AND e.id<>s.id AND e.child_id=s.child_id AND (e.absent_class_log_id=a.id OR e.note LIKE '%[결석기록:'||a.id||']%') AND coalesce(makeup_attendance_status_v4(e),'') NOT IN ('absent','same_day_absent');
  IF used+minutes>40 THEN RAISE EXCEPTION '이 결석에 이미 연결된 보강을 합하면 40분을 초과합니다.'; END IF;
  UPDATE schedule_entries SET absent_class_log_id=a.id WHERE id=s.id;
  INSERT INTO audit_logs(action_type,actor_staff_id,target_table,before_data,after_data) VALUES('makeup_link_reviewed',p_actor,'schedule_entries',to_jsonb(s),jsonb_build_object('id',s.id,'absence_id',a.id)); RETURN;
 END IF;
 RAISE EXCEPTION '지원하지 않는 처리입니다.';
END $$;
REVOKE ALL ON FUNCTION public.manage_makeup_v4(uuid,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_makeup_v4(uuid,text,bigint,bigint) TO service_role;
-- Keep actual double-booking prevention but identify the conflicting date/time.
DO $$ DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_schedule_batch_v2(jsonb,uuid[],bigint)'::regprocedure) INTO definition;
 definition:=replace(definition,'AND NOT EXISTS(SELECT 1 FROM class_logs l WHERE l.schedule_entry_id=e.id AND l.status IN (''absent'',''same_day_absent''))','AND coalesce(makeup_attendance_status_v4(e),'''') NOT IN (''absent'',''same_day_absent'')');
 definition:=replace(definition,'RAISE EXCEPTION ''같은 시간의 학생 또는 담당자 일정이 이미 있습니다.'';', 'RAISE EXCEPTION ''% %:%에 학생 또는 선생님의 기존 일정이 있습니다. 보강 관리/시간표에서 해당 예약을 확인하고 취소하거나 다른 시간을 선택하세요.'',s.date,left(s.time_slot,2),lpad(coalesce(s.minute_slot,0)::text,2,''0'');');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.reserve_advance_makeup_v3(uuid,date,text,integer,integer,text,bigint)'::regprocedure) INTO definition;
 definition:=replace(definition,'AND NOT EXISTS(SELECT 1 FROM class_logs l WHERE l.schedule_entry_id=e.id AND l.status IN (''absent'',''same_day_absent''))','AND coalesce(makeup_attendance_status_v4(e),'''') NOT IN (''absent'',''same_day_absent'')');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
