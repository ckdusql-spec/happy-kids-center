'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AdvanceMakeupBooking from './AdvanceMakeupBooking'
import MakeupManager from './MakeupManager'

const items = [
  { href: '/admin', key: 'schedule', title: '시간표 · 출결', hint: '일정과 출결 처리', icon: '▦' },
  { href: '/admin/regular', key: 'regular', title: '정기수업 관리', hint: '반복 일정 등록·변경', icon: '↻' },
  { href: '/admin/monthly-lessons', key: 'monthly', title: '연간 수업 · 이월', hint: '횟수·이월·보강 내역', icon: '◷' },
  { href: '/admin?section=children', key: 'children', title: '학생 관리', hint: '학생 정보와 바우처', icon: '○' },
  { href: '/admin?section=staff', key: 'staff', title: '선생님 관리', hint: '담당 선생님 정보', icon: '◇' },
  { href: '/admin?section=summary', key: 'summary', title: '월 정산', hint: '월별 정산 확인', icon: '≡' },
]

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [section, setSection] = useState('schedule')
  useEffect(() => { setSection(new URLSearchParams(window.location.search).get('section') || 'schedule') }, [pathname])
  const active = pathname === '/admin/regular' ? 'regular' : pathname === '/admin/monthly-lessons' ? 'monthly' : pathname === '/admin' ? section : ''
  return <div className="center-workspace">
    <a className="workspace-skip" href="#workspace-content">본문 바로가기</a>
    <aside className="workspace-sidebar">
      <a href="/admin" className="workspace-brand"><span className="workspace-brand-icon" aria-hidden="true">✦</span><span>행복한아이<small>발달센터 · 관리자</small></span></a>
      <p className="workspace-menu-label">센터 관리</p>
      <nav aria-label="관리자 주요 메뉴">{items.map(item => <a key={item.key} href={item.href} aria-current={active === item.key ? 'page' : undefined} className="workspace-nav-item"><span aria-hidden="true" className="workspace-nav-icon">{item.icon}</span><span>{item.title}<small>{item.hint}</small></span></a>)}</nav>
      <MakeupManager/><AdvanceMakeupBooking/><div className="workspace-note"><strong>수업 횟수 안내</strong><p>정규수업 월 4회 · 보강 제외<br/>보강은 40분 기준으로 확인합니다.</p></div>
    </aside>
    <div id="workspace-content" tabIndex={-1} className="workspace-content">{children}</div>
  </div>
}
