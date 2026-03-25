import type { Metadata } from 'next'
import './globals.css'
import PwaRegister from './pwa-register'

export const metadata: Metadata = {
  title: '행복한아이 발달센터',
  description: '발달센터 시간표 및 출결 관리',
  manifest: '/manifest.json',
  themeColor: '#ffffff',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '행복한아이',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}