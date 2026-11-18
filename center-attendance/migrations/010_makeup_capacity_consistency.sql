BEGIN;
-- One authoritative absence per booking; date-only legacy links must be unique.
CREATE OR REPLACE FUNCTION public.makeup_absence_v5(s public.schedule_entries)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE result_id bigint; candidates integer;
BEGIN
 IF s.absent_class_log_id IS NOT NULL THEN RETURN s.absent_class_log_id; END IF;
 result_id:=substring(s.note from '\[결석기록:([0-9]+)\]')::bigint;
 IF result_id IS NOT NULL THEN RETURN result_id; END IF;
 IF s.makeup_source_schedule_id IS NOT NULL THEN RETURN NULL; END IF;
 SELECT count(*),min(l.id) INTO candidates,result_id FROM class_logs l
 WHERE l.child_id=s.child_id AND l.class_date::text=substring(s.note from '\[결석일:([0-9-]+)\]')
 AND NOT coalesce(l.is_group,false) AND l.status IN ('absent','same_day_absent')
 AND EXISTS(SELECT 1 FROM schedule_entries src WHERE src.is_active AND is_regular_lesson_v3(src)
  AND (l.schedule_entry_id=src.id OR (l.schedule_entry_id IS NULL AND src.child_id=l.child_id AND src.teacher_id=l.staff_id AND src.date=l.class_date
   AND NOT coalesce(src.is_group,false) AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(src.time_slot,2)||':'||lpad(coalesce(src.minute_slot,0)::text,2,'0')))
  AND NOT EXISTS(SELECT 1 FROM class_logs newer WHERE newer.id<>l.id
   AND (newer.schedule_entry_id=src.id OR (newer.schedule_entry_id IS NULL AND newer.child_id=l.child_id AND newer.staff_id=l.staff_id AND newer.class_date=l.class_date AND newer.class_time=l.class_time AND NOT coalesce(newer.is_group,false)))
   AND (coalesce(newer.updated_at,newer.created_at,'epoch'::timestamptz),newer.id)>(coalesce(l.updated_at,l.created_at,'epoch'::timestamptz),l.id)));
 IF candidates=1 THEN RETURN result_id; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.makeup_absence_v5(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.makeup_absence_v5(public.schedule_entries) TO service_role;

DO $$ DECLARE definition text; old_predicate text;
BEGIN
 SELECT pg_get_functiondef('public.save_schedule_batch_v2(jsonb,uuid[],bigint)'::regprocedure) INTO definition;
 old_predicate:=$predicate$e.absent_class_log_id=absence.id OR
     (e.absent_class_log_id IS NULL AND (coalesce(e.note,'') LIKE '%[결석기록:'||absence.id||']%' OR
       (coalesce(e.note,'') LIKE '%[결석일:'||absence.class_date||']%' AND coalesce(e.note,'') NOT LIKE '%[결석기록:%')))$predicate$;
 IF position('makeup_absence_v5(e)=absence.id' in definition)=0 THEN
  IF position(old_predicate in definition)=0 THEN RAISE EXCEPTION 'Unexpected schedule function version. No changes applied.'; END IF;
  definition:=replace(definition,old_predicate,'makeup_absence_v5(e)=absence.id');
  definition:=replace(definition,'IF s.date<absence.class_date THEN', $guard$
   IF EXISTS(SELECT 1 FROM schedule_entries src WHERE src.is_active AND NOT is_regular_lesson_v3(src) AND
    (src.id=absence.schedule_entry_id OR (absence.schedule_entry_id IS NULL AND src.child_id=absence.child_id AND src.teacher_id=absence.staff_id AND src.date=absence.class_date AND to_char(absence.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(src.time_slot,2)||':'||lpad(coalesce(src.minute_slot,0)::text,2,'0')))) THEN
    RAISE EXCEPTION '보강 결석은 새 40분을 만들지 않습니다. 원래 정규수업 결석을 선택하세요.';
   END IF;
   IF EXISTS(SELECT 1 FROM schedule_entries e WHERE e.is_active AND e.child_id=s.child_id AND NOT is_regular_lesson_v3(e)
    AND e.absent_class_log_id IS NULL AND e.makeup_source_schedule_id IS NULL AND coalesce(e.note,'') NOT LIKE '%[결석기록:%'
    AND substring(e.note from '\[결석일:([0-9-]+)\]')=absence.class_date::text AND makeup_absence_v5(e) IS NULL
    AND coalesce(makeup_attendance_status_v4(e),'') NOT IN ('absent','same_day_absent')) THEN
    RAISE EXCEPTION '% 결석에 연결이 불명확한 기존 보강이 있습니다. 보강 관리에서 원래 수업을 연결하세요.',absence.class_date;
   END IF;
   IF s.date<absence.class_date THEN$guard$);
  EXECUTE definition;
 END IF;
 SELECT pg_get_functiondef('public.manage_makeup_v4(uuid,text,bigint,bigint)'::regprocedure) INTO definition;
 definition:=replace(definition,'(e.absent_class_log_id=a.id OR e.note LIKE ''%[결석기록:''||a.id||'']%'')','(makeup_absence_v5(e)=a.id)');
 definition:=replace(definition,'IF used+minutes>40 THEN','IF coalesce(makeup_attendance_status_v4(s),'''') IN (''absent'',''same_day_absent'') THEN minutes:=0; END IF; IF used+minutes>40 THEN');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.record_attendance_v2(uuid[],text,bigint,jsonb)'::regprocedure) INTO definition;
 IF position('다시 완료하면 40분' in definition)=0 THEN
  definition:=replace(definition,'IF log_id IS NULL THEN',$guard$
   IF NOT is_regular_lesson_v3(s) AND p_status IN ('attended','makeup')
    AND coalesce(makeup_attendance_status_v4(s),'') IN ('absent','same_day_absent')
    AND (SELECT coalesce(sum(CASE WHEN e.note LIKE '%[시간보강:%' THEN coalesce(substring(e.note from '\[시간보강:([0-9]+)분\]')::integer,40) ELSE 40 END),0)
      FROM schedule_entries e WHERE e.is_active AND NOT is_regular_lesson_v3(e)
      AND (e.id=s.id OR ((makeup_absence_v5(e)=makeup_absence_v5(s) OR (s.makeup_source_schedule_id IS NOT NULL AND e.makeup_source_schedule_id=s.makeup_source_schedule_id))
       AND coalesce(makeup_attendance_status_v4(e),'') NOT IN ('absent','same_day_absent'))))>40 THEN
    RAISE EXCEPTION '다른 보강 예약·완료가 있어 이 보강을 다시 완료하면 40분을 초과합니다. 연결된 보강을 먼저 확인하세요.';
   END IF;
   IF log_id IS NULL THEN$guard$);
  EXECUTE definition;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
