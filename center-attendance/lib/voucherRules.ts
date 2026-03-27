import type { Child, VoucherType } from '@/types/child'

export function resolveVoucherAmount(
  voucher: VoucherType,
  occurrence: number,
  child: Child,
  isGroup: boolean,
): number {
  if (isGroup) return child.voucherPrices['그룹'] ?? 0
  if (voucher === '일반') return child.basePrice
  if (voucher === '디딤') {
    return occurrence <= 3
      ? (child.voucherPrices['디딤'] ?? 0)
      : child.basePrice
  }
  return child.voucherPrices[voucher] ?? 0
}