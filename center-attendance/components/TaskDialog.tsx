'use client'
import { useEffect, useId, useRef } from 'react'

export default function TaskDialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    ref.current?.showModal()
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <dialog ref={ref} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose() }} className="task-dialog center-workspace">
    <header className="task-dialog-header"><div><h2 id={id}>{title}</h2><p>{description}</p></div><button type="button" onClick={onClose} aria-label="창 닫기">×</button></header>
    <div className="task-dialog-body">{children}</div>
  </dialog>
}
