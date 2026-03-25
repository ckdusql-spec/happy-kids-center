import { supabaseAdmin } from '@/lib/supabaseAdmin'

type AuditLogInput = {
  actorStaffId?: number | null
  actionType: string
  targetTable: string
  targetId?: number | null
  beforeData?: unknown
  afterData?: unknown
}

export async function writeAuditLog(input: AuditLogInput) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_staff_id: input.actorStaffId ?? null,
    action_type: input.actionType,
    target_table: input.targetTable,
    target_id: input.targetId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
  })

  if (error) {
    console.error('audit log write failed:', error.message)
  }
}