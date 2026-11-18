BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='180s';
-- Keep absence history active for reporting, but release physical availability.
CREATE OR REPLACE FUNCTION public.schedule_occupies_slot_v6(s public.schedule_entries)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(s.is_active,false) AND coalesce(public.makeup_attendance_status_v4(s),'') NOT IN ('absent','same_day_absent')
$$;
REVOKE ALL ON FUNCTION public.schedule_occupies_slot_v6(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_occupies_slot_v6(public.schedule_entries) TO service_role;
DO $$ DECLARE definition text; old_text text; new_text text;
BEGIN
 SELECT pg_get_functiondef('public.save_schedule_batch_v2(jsonb,uuid[],bigint)'::regprocedure) INTO definition;
 old_text:='SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.date=s.date AND e.time_slot=s.time_slot';
 new_text:='SELECT 1 FROM schedule_entries e WHERE schedule_occupies_slot_v6(e) AND e.date=s.date AND e.time_slot=s.time_slot';
 IF position(new_text in definition)=0 THEN
  IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected save function version; nothing applied.'; END IF;
  EXECUTE replace(definition,old_text,new_text);
 END IF;
 SELECT pg_get_functiondef('public.apply_regular_change_v2(jsonb)'::regprocedure) INTO definition;
 old_text:='SELECT 1 FROM schedule_entries s WHERE s.is_active AND s.date=d AND s.time_slot=slot';
 new_text:='SELECT 1 FROM schedule_entries s WHERE schedule_occupies_slot_v6(s) AND s.date=d AND s.time_slot=slot';
 IF position(new_text in definition)=0 THEN
  IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected recurring function version; nothing applied.'; END IF;
  EXECUTE replace(definition,old_text,new_text);
 END IF;
 -- Ordinary attendance corrections cannot reclaim a slot already reused by another child.
 SELECT pg_get_functiondef('public.record_attendance_v2(uuid[],text,bigint,jsonb)'::regprocedure) INTO definition;
 IF position('결석 시간에 다른 일정이 등록되어' in definition)=0 THEN
  old_text:='SELECT l.id INTO log_id FROM class_logs l';
  IF position(old_text in definition)=0 THEN RAISE EXCEPTION 'Unexpected attendance function version; nothing applied.'; END IF;
  new_text:=$guard$IF p_status IN ('attended','makeup') AND coalesce(makeup_attendance_status_v4(s),'') IN ('absent','same_day_absent')
   AND EXISTS(SELECT 1 FROM schedule_entries e WHERE e.id<>s.id AND schedule_occupies_slot_v6(e) AND e.date=s.date AND e.time_slot=s.time_slot AND coalesce(e.minute_slot,0)=coalesce(s.minute_slot,0)
    AND (e.child_id=s.child_id OR e.teacher_id=s.teacher_id)
    AND NOT(coalesce(s.is_group,false) AND coalesce(e.is_group,false) AND s.group_id IS NOT NULL AND e.group_id=s.group_id AND (e.child_id<>s.child_id OR e.teacher_id<>s.teacher_id))) THEN
    RAISE EXCEPTION '결석 시간에 다른 일정이 등록되어 출석으로 되돌릴 수 없습니다. 대체 일정을 먼저 변경하거나 취소하세요.';
   END IF;
   SELECT l.id INTO log_id FROM class_logs l$guard$;
  EXECUTE replace(definition,old_text,new_text);
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
