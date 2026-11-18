BEGIN;
CREATE TABLE IF NOT EXISTS public.makeup_balance_visibility (
 absence_id bigint PRIMARY KEY REFERENCES public.class_logs(id) ON DELETE CASCADE,
 hidden boolean NOT NULL DEFAULT true,
 reason text NOT NULL,
 actor_id bigint NOT NULL REFERENCES public.staff_accounts(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.makeup_balance_visibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.makeup_balance_visibility FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.makeup_balance_visibility TO service_role;
CREATE OR REPLACE FUNCTION public.set_makeup_balance_visibility(p_absence bigint,p_child bigint,p_hidden boolean,p_reason text,p_actor bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 IF NOT EXISTS(SELECT 1 FROM staff_accounts WHERE id=p_actor AND role='admin' AND is_active) THEN RAISE EXCEPTION '관리자만 목록을 정리할 수 있습니다.'; END IF;
 IF p_hidden IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION '사유를 2~500자로 입력하세요.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM class_logs WHERE id=p_absence AND child_id=p_child AND status IN ('absent','same_day_absent') AND NOT coalesce(is_group,false)) THEN RAISE EXCEPTION '해당 학생의 결석 기록을 확인하세요.'; END IF;
 SELECT to_jsonb(v) INTO previous FROM makeup_balance_visibility v WHERE absence_id=p_absence;
 INSERT INTO makeup_balance_visibility(absence_id,hidden,reason,actor_id) VALUES(p_absence,p_hidden,trim(p_reason),p_actor)
 ON CONFLICT(absence_id) DO UPDATE SET hidden=excluded.hidden,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=now();
 INSERT INTO audit_logs(action_type,actor_staff_id,target_table,target_id,before_data,after_data)
 VALUES('makeup_balance_visibility',p_actor,'makeup_balance_visibility',p_absence,previous,jsonb_build_object('hidden',p_hidden,'reason',trim(p_reason),'child_id',p_child));
END $$;
REVOKE ALL ON FUNCTION public.set_makeup_balance_visibility(bigint,bigint,boolean,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_makeup_balance_visibility(bigint,bigint,boolean,text,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
