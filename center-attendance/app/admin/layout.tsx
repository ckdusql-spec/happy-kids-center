import WorkspaceShell from '@/components/WorkspaceShell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>
}
