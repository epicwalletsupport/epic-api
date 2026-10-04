export function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
