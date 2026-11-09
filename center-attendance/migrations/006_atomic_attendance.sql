BEGIN;
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
COMMIT;
