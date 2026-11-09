BEGIN;
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
