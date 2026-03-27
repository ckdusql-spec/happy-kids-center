'use client'

import { useState } from 'react'
import type { Child, VoucherType } from '@/types/child'

const VOUCHERS: VoucherType[] = ['디딤', '아청심', '드림스타트', '배움']

interface Props {
  initialValue?: Partial<Child>
  onSubmit: (value: Partial<Child>) => void
}

export default function ChildForm({ initialValue, onSubmit }: Props) {
  const [form, setForm] = useState<Partial<Child>>({
    name: initialValue?.name ?? '',
    age: initialValue?.age ?? 0,
    vouchers: initialValue?.vouchers ?? [],
    basePrice: initialValue?.basePrice ?? 0,
    voucherPrices: initialValue?.voucherPrices ?? {},
  })

  const toggleVoucher = (voucher: VoucherType) => {
    const current = form.vouchers ?? []
    const next = current.includes(voucher)
      ? current.filter((v) => v !== voucher)
      : [...current, voucher]
    setForm({ ...form, vouchers: next })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <input
        className="border p-2 rounded w-full"
        placeholder="학생 이름"
        value={form.name ?? ''}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <input
        className="border p-2 rounded w-full"
        type="number"
        placeholder="나이"
        value={form.age ?? 0}
        onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
      />

      <div className="space-y-2">
        <div className="font-medium">바우처 선택</div>
        {VOUCHERS.map((voucher) => (
          <label key={voucher} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(form.vouchers ?? []).includes(voucher)}
              onChange={() => toggleVoucher(voucher)}
            />
            {voucher}
          </label>
        ))}
      </div>

      <input
        className="border p-2 rounded w-full"
        type="number"
        placeholder="일반금액"
        value={form.basePrice ?? 0}
        onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
      />

      {['디딤', '아청심', '드림스타트', '배움', '그룹'].map((voucher) => (
        <input
          key={voucher}
          className="border p-2 rounded w-full"
          type="number"
          placeholder={`${voucher} 금액`}
          value={form.voucherPrices?.[voucher as keyof typeof form.voucherPrices] ?? 0}
          onChange={(e) =>
            setForm({
              ...form,
              voucherPrices: {
                ...(form.voucherPrices ?? {}),
                [voucher]: Number(e.target.value),
              },
            })
          }
        />
      ))}

      <button className="bg-black text-white px-4 py-2 rounded" type="submit">
        저장
      </button>
    </form>
  )
}