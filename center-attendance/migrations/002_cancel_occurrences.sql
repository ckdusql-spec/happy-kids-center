BEGIN;
CREATE OR REPLACE FUNCTION public.cancel_occurrences_v2(p_ids uuid[], p_actor bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.schedule_entries; actor_role text; series uuid; rid bigint; count_cancelled integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(406040);
 SELECT role INTO actor_role FROM staff_accounts WHERE id=p_actor AND is_active;
 IF actor_role IS NULL THEN RAISE EXCEPTION '접근 권한이 없습니다.'; END IF;
 IF cardinality(p_ids)>100 OR cardinality(p_ids)=0 THEN RAISE EXCEPTION '취소할 일정을 확인하세요.'; END IF;
 FOR s IN SELECT * FROM schedule_entries WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE LOOP
   IF actor_role<>'admin' AND s.teacher_id<>p_actor THEN RAISE EXCEPTION '본인 일정만 취소할 수 있습니다.'; END IF;
   IF NOT coalesce(s.is_active,false) THEN CONTINUE; END IF;
   IF schedule_has_log_v2(s) THEN RAISE EXCEPTION '출결이 있는 일정은 삭제할 수 없습니다. 출결 기록을 확인하세요.'; END IF;
   series:=NULL;
   IF coalesce(s.is_group,false) THEN
     rid:=coalesce(s.regular_group_rule_id,substring(coalesce(s.note,'') from '^\[정기그룹:([0-9]+)\]')::bigint);
     SELECT series_id INTO series FROM regular_group_classes WHERE id=rid;
   ELSE
     rid:=coalesce(s.regular_rule_id,substring(coalesce(s.note,'') from '^\[정기수업:([0-9]+)\]')::bigint);
     SELECT series_id INTO series FROM regular_classes WHERE id=rid;
   END IF;
   IF series IS NOT NULL AND s.child_id IS NOT NULL THEN
     INSERT INTO regular_exceptions_v2 VALUES(series,s.date,s.child_id) ON CONFLICT DO NOTHING;
   END IF;
   UPDATE schedule_entries SET is_active=false,cancelled_reason='개별 회차 취소' WHERE id=s.id;
   count_cancelled:=count_cancelled+1;
 END LOOP;
 RETURN count_cancelled;
END $$;
REVOKE ALL ON FUNCTION public.cancel_occurrences_v2(uuid[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_occurrences_v2(uuid[],bigint) TO service_role;
COMMIT;
