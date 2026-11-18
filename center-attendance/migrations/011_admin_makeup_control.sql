BEGIN;
CREATE OR REPLACE FUNCTION public.admin_manage_makeup_v5(p jsonb,p_actor bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s schedule_entries; original schedule_entries; a class_logs; logs_before jsonb; ids bigint[]; chosen bigint; source_id uuid; d date; hour text; minute integer; duration integer; teacher bigint; state text; memo text; reason text; original_date date; log_id bigint; created boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 IF NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=p_actor AND role='admin' AND is_active) THEN RAISE EXCEPTION '관리자만 수정할 수 있습니다.'; END IF;
 IF nullif(p->>'id','') IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM children WHERE id=(p->>'childId')::bigint) THEN RAISE EXCEPTION '학생을 확인하세요.'; END IF;
  INSERT INTO schedule_entries(date,time_slot,minute_slot,teacher_id,child_id,voucher_type,status,note,is_active)
  VALUES((p->>'date')::date,p->>'hour',(p->>'minute')::integer,(p->>'teacherId')::bigint,(p->>'childId')::bigint,coalesce(nullif(p->>'voucherType',''),'일반'),'makeup','[보강]',true) RETURNING * INTO s;
  created:=true;
 ELSE
  SELECT * INTO s FROM schedule_entries WHERE id=(p->>'id')::uuid FOR UPDATE;
 END IF;
 IF s.id IS NULL OR coalesce(s.is_group,false) OR is_regular_lesson_v3(s) THEN RAISE EXCEPTION '개인 보강 일정을 선택하세요.'; END IF;
 original:=s;
 reason:=trim(coalesce(p->>'reason',''));
 IF length(reason)<2 OR length(reason)>500 THEN RAISE EXCEPTION '변경 사유를 2~500자로 입력하세요.'; END IF;
 IF coalesce((p->>'override')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION '관리자 예외 처리 확인이 필요합니다.'; END IF;
 d:=(p->>'date')::date;hour:=p->>'hour';minute:=(p->>'minute')::integer;duration:=(p->>'minutes')::integer;teacher:=(p->>'teacherId')::bigint;state:=p->>'state';
 IF d IS NULL OR hour IS NULL OR hour !~ '^([01][0-9]|2[0-3]):00$' OR minute IS NULL OR minute NOT IN (0,10,20,30,40,50) OR duration IS NULL OR duration NOT BETWEEN 1 AND 1440 OR state IS NULL OR state NOT IN ('reserved','completed','missed','cancelled') THEN RAISE EXCEPTION '날짜·시간·진행 상태를 확인하세요.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=teacher AND is_active) THEN RAISE EXCEPTION '담당자를 확인하세요.'; END IF;
 chosen:=nullif(p->>'absenceId','')::bigint;
 source_id:=CASE WHEN coalesce((p->>'keepSource')::boolean,false) AND chosen IS NULL THEN s.makeup_source_schedule_id ELSE NULL END;
 original_date:=nullif(p->>'originalDate','')::date;
 IF chosen IS NOT NULL THEN
  SELECT * INTO a FROM class_logs WHERE id=chosen;
  IF a.id IS NULL OR a.child_id<>s.child_id OR a.status NOT IN ('absent','same_day_absent') OR coalesce(a.is_group,false) THEN RAISE EXCEPTION '같은 학생의 결석 수업을 선택하세요.'; END IF;
  original_date:=a.class_date;
 ELSIF source_id IS NOT NULL THEN
  SELECT date INTO original_date FROM schedule_entries WHERE id=source_id AND child_id=s.child_id;
 END IF;
 IF state<>'cancelled' AND EXISTS(SELECT 1 FROM class_logs l WHERE l.schedule_entry_id IS NULL AND l.child_id=s.child_id AND l.staff_id=teacher AND l.class_date=d AND NOT coalesce(l.is_group,false)
  AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(hour,2)||':'||lpad(minute::text,2,'0')
  AND EXISTS(SELECT 1 FROM schedule_entries other WHERE other.id<>s.id AND other.is_active AND other.child_id=s.child_id AND other.teacher_id=teacher AND other.date=d AND other.time_slot=hour AND coalesce(other.minute_slot,0)=minute)) THEN
  RAISE EXCEPTION '이 시간에는 일정 연결이 없는 기존 출결이 있습니다. 기존 일정의 출결을 먼저 확인·저장하여 연결한 후 수정하세요.';
 END IF;
 SELECT array_agg(l.id),jsonb_agg(to_jsonb(l)) INTO ids,logs_before FROM class_logs l WHERE l.schedule_entry_id=s.id OR
  (NOT created AND l.schedule_entry_id IS NULL AND l.child_id=s.child_id AND l.staff_id=s.teacher_id AND l.class_date=s.date AND NOT coalesce(l.is_group,false)
   AND to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'));
 -- Cancellation keeps attendance history intact. Reset/edit archives the old attendance in audit_logs.
 IF state<>'cancelled' AND EXISTS(SELECT 1 FROM schedule_entries WHERE absent_class_log_id=ANY(ids)) THEN RAISE EXCEPTION '이 출결에 연결된 다른 보강을 먼저 연결 해제하세요.'; END IF;
 memo:=CASE WHEN duration=40 THEN '[보강]' ELSE '[시간보강:'||duration||'분]' END
  ||CASE WHEN original_date IS NOT NULL THEN ' [결석일:'||original_date||']' ELSE '' END
  ||CASE WHEN chosen IS NOT NULL THEN ' [결석기록:'||chosen||']' ELSE '' END
  ||CASE WHEN source_id IS NOT NULL THEN ' [사전보강:'||source_id||']' ELSE '' END
  ||' [관리자수정] '||replace(replace(reason,'[','('),']',')');
 IF state='cancelled' THEN
  UPDATE schedule_entries SET is_active=false,cancelled_reason=reason,updated_at=now() WHERE id=s.id;
 ELSE
  DELETE FROM class_logs WHERE id=ANY(ids);
  UPDATE schedule_entries SET date=d,time_slot=hour,minute_slot=minute,teacher_id=teacher,teacher_name=(SELECT name FROM staff_accounts WHERE id=teacher),
   voucher_type=coalesce(nullif(p->>'voucherType',''),s.voucher_type),status='makeup',note=memo,is_active=true,cancelled_reason=NULL,
   absent_class_log_id=chosen,makeup_source_schedule_id=source_id,updated_at=now() WHERE id=s.id;
  IF state IN ('completed','missed') THEN
   INSERT INTO class_logs(schedule_entry_id,staff_id,child_id,class_date,class_time,status,voucher_type,is_group)
   VALUES(s.id,teacher,s.child_id,d,(d::text||' '||left(hour,2)||':'||lpad(minute::text,2,'0'))::timestamp AT TIME ZONE 'Asia/Seoul',CASE WHEN state='completed' THEN 'makeup' ELSE 'absent' END,coalesce(nullif(p->>'voucherType',''),s.voucher_type),false) RETURNING id INTO log_id;
  END IF;
 END IF;
 SELECT * INTO s FROM schedule_entries WHERE id=original.id;
 INSERT INTO audit_logs(action_type,actor_staff_id,target_table,before_data,after_data)
 VALUES('admin_makeup_override',p_actor,'schedule_entries',jsonb_build_object('schedule',CASE WHEN created THEN NULL ELSE to_jsonb(original) END,'attendance',coalesce(logs_before,'[]'::jsonb)),jsonb_build_object('schedule',to_jsonb(s),'state',state,'reason',reason,'attendance_id',log_id));
END $$;
REVOKE ALL ON FUNCTION public.admin_manage_makeup_v5(jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_makeup_v5(jsonb,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
