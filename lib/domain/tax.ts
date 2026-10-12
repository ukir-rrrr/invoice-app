import { lineAmountYen, taxOnce } from './money';
import type { CalculateTotalsResult, TaxBucket, TaxLineInput, TaxCategory } from './types';

const RATE_BY_CATEGORY: Record<TaxCategory, 0 | 8 | 10> = {
  standard_10: 10,
  reduced_8: 8,
  non_taxable: 0,
};

export function calculateTotals(lines: TaxLineInput[]): CalculateTotalsResult {
  const lineAmounts = lines.map((line) => lineAmountYen(line.unitPriceYen, line.quantityMilli));

  const baseByCategory = new Map<TaxCategory, number>();
  for (let i = 0; i < lines.length; i++) {
    const cat = lines[i].taxCategory;
    const prev = baseByCategory.get(cat) ?? 0;
    baseByCategory.set(cat, prev + lineAmounts[i]);
  }

  const buckets: TaxBucket[] = [];
  let hasReduced8 = false;

  for (const [taxCategory, baseYen] of baseByCategory.entries()) {
    if (taxCategory === 'reduced_8') {
      hasReduced8 = true;
    }
    const rate = RATE_BY_CATEGORY[taxCategory];
    const taxYen = taxOnce(baseYen, rate);
    if (baseYen === 0 && taxYen === 0) {
      continue;
    }
    buckets.push({ taxCategory, baseYen, taxYen });
  }

  buckets.sort((a, b) => {
    const order: TaxCategory[] = ['standard_10', 'reduced_8', 'non_taxable'];
    return order.indexOf(a.taxCategory) - order.indexOf(b.taxCategory);
  });

  const subtotalYen = lineAmounts.reduce((sum, n) => sum + n, 0);
  const taxYen = buckets.reduce((sum, b) => sum + b.taxYen, 0);
  const totalYen = subtotalYen + taxYen;

  return {
    lineAmounts,
    buckets,
    subtotalYen,
    taxYen,
    totalYen,
    hasReduced8,
  };
}
