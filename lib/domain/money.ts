export function divFloor(n: bigint, d: bigint): bigint {
  if (d <= 0n) {
    throw new Error('divisor');
  }
  const q = n / d;
  const r = n % d;
  if (r !== 0n && n < 0n) {
    return q - 1n;
  }
  return q;
}

export function lineAmountYen(unitPriceYen: number, quantityMilli: number): number {
  return Number(divFloor(BigInt(unitPriceYen) * BigInt(quantityMilli), 1000n));
}

export function taxOnce(baseYen: number, rate: 0 | 8 | 10): number {
  return Number(divFloor(BigInt(baseYen) * BigInt(rate), 100n));
}
