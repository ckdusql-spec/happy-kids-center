export type VoucherType =
  | '일반'
  | '디딤'
  | '아청심'
  | '드림스타트'
  | '배움'
  | '그룹'

export interface VoucherPrices {
  디딤?: number
  아청심?: number
  드림스타트?: number
  배움?: number
  그룹?: number
}

export interface Child {
  id: string
  name: string
  age: number
  vouchers: VoucherType[]
  basePrice: number
  voucherPrices: VoucherPrices
  createdAt?: string
}