export function roundMoney(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function roundQty(value: number): string {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

export function parseMoney(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? 0 : num;
}

export function sumMoney(...values: number[]): string {
  const total = values.reduce((a, b) => a + b, 0);
  return roundMoney(total);
}

export function moneyEquals(a: string | number, b: string | number): boolean {
  return roundMoney(parseMoney(String(a))) === roundMoney(parseMoney(String(b)));
}
