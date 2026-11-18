-- Additive update. Original attendance is never pre-marked absent.
BEGIN;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS makeup_source_schedule_id uuid REFERENCES public.schedule_entries(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_makeup_source_schedule ON public.schedule_entries(makeup_source_schedule_id);

CREATE OR REPLACE FUNCTION public.reserve_advance_makeup_v3(p_source uuid,p_date date,p_hour text,p_minute integer,p_minutes integer,p_reason text,p_actor bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src schedule_entries; actor_role text; booked integer; result_id uuid; token text; memo text;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO actor_role FROM staff_accounts WHERE id=p_actor AND is_active;
 SELECT * INTO src FROM schedule_entries WHERE id=p_source FOR UPDATE;
 IF actor_role IS NULL OR src.id IS NULL OR NOT coalesce(src.is_active,false) THEN RAISE EXCEPTION '수업과 접근 권한을 확인하세요.'; END IF;
 IF actor_role<>'admin' AND src.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 수업만 예약할 수 있습니다.'; END IF;
 IF coalesce(src.is_group,false) OR NOT is_regular_lesson_v3(src) OR src.makeup_source_schedule_id IS NOT NULL THEN RAISE EXCEPTION '개인 정규수업을 선택하세요.'; END IF;
 IF schedule_has_log_v2(src) THEN RAISE EXCEPTION '이미 출결 처리된 수업입니다. 기존 결석 보강 입력을 이용하세요.'; END IF;
 IF p_minutes IS NULL OR p_minutes NOT IN (10,20,30,40) OR length(trim(coalesce(p_reason,'')))=0 OR length(p_reason)>500 THEN RAISE EXCEPTION '예약 사유와 보강 시간(10~40분)을 확인하세요.'; END IF;
 IF p_date IS NULL OR p_date < (now() AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION '보강 예약일은 오늘 이후로 선택하세요.'; END IF;
 IF EXISTS(SELECT 1 FROM monthly_lesson_plans WHERE child_id=src.child_id AND teacher_id=src.teacher_id AND voucher_type=src.voucher_type AND month=coalesce(src.regular_credit_month,date_trunc('month',src.date)::date) AND closed) THEN RAISE EXCEPTION '마감된 수업은 예약할 수 없습니다.'; END IF;
 SELECT coalesce(sum(CASE WHEN coalesce(e.note,'') LIKE '%[시간보강:%' THEN coalesce(substring(e.note from '\[시간보강:([0-9]+)분\]')::integer,40) ELSE 40 END),0)::integer INTO booked
 FROM schedule_entries e WHERE e.is_active AND e.makeup_source_schedule_id=src.id
 AND NOT EXISTS(SELECT 1 FROM class_logs l WHERE l.schedule_entry_id=e.id AND l.status IN ('absent','same_day_absent'));
 IF booked+p_minutes>40 THEN RAISE EXCEPTION '이 수업의 완료·예약 보강 합계가 40분을 초과합니다.'; END IF;
 token:=gen_random_uuid()::text;
 memo:=CASE WHEN p_minutes=40 THEN '[보강]' ELSE '[시간보강:'||p_minutes||'분]' END||' [결석일:'||src.date||'] [사전보강:'||src.id||'] [예약번호:'||token||'] 사유: '||replace(replace(trim(p_reason),'[','('),']',')');
 PERFORM save_schedule_batch_v2(jsonb_build_array(jsonb_build_object('date',p_date,'time_slot',p_hour,'minute_slot',p_minute,'teacher_id',src.teacher_id,'child_id',src.child_id,'voucher_type',src.voucher_type,'status','makeup','note',memo,'is_group',false)),ARRAY[]::uuid[],p_actor);
 SELECT id INTO STRICT result_id FROM schedule_entries WHERE note=memo AND is_active;
 UPDATE schedule_entries SET makeup_source_schedule_id=src.id WHERE id=result_id;
 INSERT INTO audit_logs(action_type,actor_staff_id,target_table,after_data) VALUES('advance_makeup_reserved',p_actor,'schedule_entries',jsonb_build_object('source',src.id,'makeup',result_id,'minutes',p_minutes));
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_advance_makeup_v3(uuid,date,text,integer,integer,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_advance_makeup_v3(uuid,date,text,integer,integer,text,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.link_advance_makeup_attendance_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 -- Include old attendance entry points that did not provide a schedule id.
 FOR source_id IN SELECT s.id FROM schedule_entries s WHERE s.is_active AND (
 s.id=NEW.schedule_entry_id OR (NEW.schedule_entry_id IS NULL AND s.child_id=NEW.child_id AND s.teacher_id=NEW.staff_id AND s.date=NEW.class_date AND NOT coalesce(s.is_group,false) AND to_char(NEW.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'))) LOOP
  IF EXISTS(SELECT 1 FROM schedule_entries WHERE is_active AND makeup_source_schedule_id=source_id) THEN
   IF NEW.status NOT IN ('absent','same_day_absent') THEN RAISE EXCEPTION '사전 예약한 보강이 있습니다. 보강 취소·정리 후 출석 처리하세요.'; END IF;
   UPDATE schedule_entries SET absent_class_log_id=NEW.id WHERE makeup_source_schedule_id=source_id;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS link_advance_makeup_attendance_v3 ON public.class_logs;
CREATE TRIGGER link_advance_makeup_attendance_v3 AFTER INSERT OR UPDATE ON public.class_logs FOR EACH ROW EXECUTE FUNCTION public.link_advance_makeup_attendance_v3();

CREATE OR REPLACE FUNCTION public.guard_advance_makeup_source_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF ROW(OLD.date,OLD.time_slot,OLD.minute_slot,OLD.teacher_id,OLD.child_id,OLD.voucher_type,OLD.is_active) IS DISTINCT FROM ROW(NEW.date,NEW.time_slot,NEW.minute_slot,NEW.teacher_id,NEW.child_id,NEW.voucher_type,NEW.is_active)
 AND EXISTS(SELECT 1 FROM schedule_entries WHERE is_active AND makeup_source_schedule_id=OLD.id) THEN RAISE EXCEPTION '연결된 사전 보강을 먼저 취소·정리한 후 원래 수업을 변경하세요.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_advance_makeup_source_v3 ON public.schedule_entries;
CREATE TRIGGER guard_advance_makeup_source_v3 BEFORE UPDATE ON public.schedule_entries FOR EACH ROW EXECUTE FUNCTION public.guard_advance_makeup_source_v3();
REVOKE ALL ON FUNCTION public.link_advance_makeup_attendance_v3(),public.guard_advance_makeup_source_v3() FROM PUBLIC,anon,authenticated;

-- The existing edit endpoint must not replace a linked booking with an unlinked row.
DO $$ DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_schedule_batch_v2(jsonb,uuid[],bigint)'::regprocedure) INTO definition;
 IF position('사전 보강은 취소 후 다시 예약' in definition)=0 THEN
 definition:=replace(definition,'IF schedule_has_log_v2(s) THEN', 'IF s.makeup_source_schedule_id IS NOT NULL THEN RAISE EXCEPTION ''사전 보강은 취소 후 다시 예약하세요.''; END IF; IF schedule_has_log_v2(s) THEN');
 EXECUTE definition;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
