BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(406040);
DO $$
DECLARE definition text; old_text text := 'IF s.date<absence.class_date THEN RAISE EXCEPTION ''보강일은 원래 결석일 이후여야 합니다.''; END IF;';
BEGIN
 definition:=pg_get_functiondef('public.save_schedule_batch_v2(jsonb,uuid[],bigint)'::regprocedure);
 IF position(old_text in definition)>0 THEN
  EXECUTE replace(definition,old_text,'-- Early linked makeup is allowed; capacity and collision checks remain.');
 ELSIF position('Early linked makeup is allowed' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected schedule function version. Nothing applied.';
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
