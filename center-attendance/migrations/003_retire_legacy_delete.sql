-- Old deletion RPCs bypass the new effective-date and attendance protections.
-- Keep definitions for rollback review; revoke browser execution only.
BEGIN;
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('delete_unlogged_regular_class_schedules','delete_unlogged_regular_group_schedules')
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
 END LOOP;
END $$;
COMMIT;
