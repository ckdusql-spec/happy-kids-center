-- Read-only deployment preflight. Export these results before applying migrations.
-- No personal names, passwords or row contents are exported.
SELECT 'legacy_weekly_schedules' AS check_name,count(*) AS count FROM public.weekly_schedules
UNION ALL
SELECT 'active_untagged_individual',count(*) FROM public.schedule_entries
WHERE is_active AND NOT coalesce(is_group,false) AND coalesce(note,'') !~ '^\[정기수업:[0-9]+\]'
UNION ALL
SELECT 'active_untagged_group',count(*) FROM public.schedule_entries
WHERE is_active AND coalesce(is_group,false) AND coalesce(note,'') !~ '^\[정기그룹:[0-9]+\]';

-- Duplicated attendance candidates. Review rather than automatically delete.
SELECT staff_id,child_id,class_date,class_time,coalesce(is_group,false) AS is_group,
       coalesce(group_id,'') AS group_id,count(*) AS records
FROM public.class_logs
GROUP BY staff_id,child_id,class_date,class_time,coalesce(is_group,false),coalesce(group_id,'')
HAVING count(*)>1;

-- Legacy date-only makeup links cannot distinguish these separate lessons.
SELECT child_id,class_date,count(DISTINCT (staff_id,class_time)) AS absent_lessons
FROM public.class_logs WHERE status IN ('absent','same_day_absent') AND NOT coalesce(is_group,false)
GROUP BY child_id,class_date HAVING count(DISTINCT (staff_id,class_time))>1;

SELECT c.relname,c.relrowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
