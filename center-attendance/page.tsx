'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function HomePage() {
  const router = useRouter()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const savedLoginId = localStorage.getItem('savedLoginId')
    if (savedLoginId) {
      setLoginId(savedLoginId)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      })

      const json = await res.json()

      if (!json.ok) {
        setMessage(json.message ?? '로그인에 실패했습니다.')
        return
      }

      localStorage.setItem('savedLoginId', loginId)

      if (json.user?.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/employee')
      }
    } catch {
      setMessage('서버 연결 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fffaf5_0%,#f9fff8_45%,#fff7fb_100%)]">
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-8">
        <div className="absolute left-[-50px] top-[90px] h-48 w-48 rounded-full bg-orange-100/70 blur-3xl" />
        <div className="absolute right-[-40px] top-[130px] h-56 w-56 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="absolute bottom-[70px] left-[8%] h-44 w-44 rounded-full bg-purple-100/60 blur-3xl" />
        <div className="absolute bottom-[80px] right-[10%] h-52 w-52 rounded-full bg-pink-100/50 blur-3xl" />

        <div className="relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/70 bg-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="grid md:grid-cols-[1.05fr_0.95fr]">
            <section className="flex flex-col justify-center px-6 py-10 md:px-10">
              <div className="mb-8 flex justify-center md:justify-start">
                <Image
                  src="/logo-center.jpg"
                  alt="행복한아이 발달센터 탕정점"
                  width={520}
                  height={140}
                  priority
                  className="h-auto w-auto max-w-full"
                />
              </div>

              <div className="mb-6">
                <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  행복한아이 발달센터 탕정점
                </div>

                <h1 className="text-3xl font-bold leading-tight text-slate-800 md:text-4xl">
                
                  <br />
                  출결 · 수업관리 시스템
                </h1>
              </div>

       
            </section>

            <section className="flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,250,245,0.95)_0%,rgba(255,255,255,0.92)_45%,rgba(248,255,250,0.95)_100%)] px-5 py-8 md:px-8">
              <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.06)] backdrop-blur">
                <div className="mb-6 text-center">
                  <div className="text-2xl font-bold text-slate-800">로그인</div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="아이디"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-orange-400 px-4 py-3 text-base font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? '로그인 중...' : '로그인'}
                  </button>
                </form>

                {message ? (
                  <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {message}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}