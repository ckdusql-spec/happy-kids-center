BEGIN;
ALTER TABLE public.class_logs ADD COLUMN IF NOT EXISTS schedule_entry_id uuid REFERENCES public.schedule_entries(id) ON DELETE RESTRICT;
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS absent_class_log_id bigint REFERENCES public.class_logs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_class_logs_schedule_entry_v2 ON public.class_logs(schedule_entry_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_absent_log_v2 ON public.schedule_entries(absent_class_log_id);
-- No automatic backfill: legacy date-only links can be ambiguous.
CREATE OR REPLACE FUNCTION public.schedule_has_log_v2(s public.schedule_entries)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.class_logs l WHERE l.schedule_entry_id=s.id OR (
 l.schedule_entry_id IS NULL AND l.class_date=s.date AND l.staff_id=s.teacher_id AND l.child_id=s.child_id
 AND coalesce(l.is_group,false)=coalesce(s.is_group,false)
 AND (NOT coalesce(s.is_group,false) OR coalesce(l.group_id,'')=coalesce(s.group_id,''))
 AND (l.class_time IS NULL OR to_char(l.class_time AT TIME ZONE 'Asia/Seoul','HH24:MI')=left(s.time_slot,2)||':'||lpad(coalesce(s.minute_slot,0)::text,2,'0'))))
$$;
REVOKE ALL ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_has_log_v2(public.schedule_entries) TO service_role;
COMMIT;
