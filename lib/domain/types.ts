export type Yen = number & { readonly __brand: 'Yen' };
export type QuantityMilli = number & { readonly __brand: 'QuantityMilli' };

export type TaxCategory = 'standard_10' | 'reduced_8' | 'non_taxable';

export type DocumentKind = 'quote' | 'invoice';
export type DocumentStatus = 'draft' | 'issued' | 'voided';

export type TaxLineInput = {
  unitPriceYen: number;
  quantityMilli: number;
  taxCategory: TaxCategory;
};

export type TaxBucket = {
  taxCategory: TaxCategory;
  baseYen: number;
  taxYen: number;
};

export type CalculateTotalsResult = {
  lineAmounts: number[];
  buckets: TaxBucket[];
  subtotalYen: number;
  taxYen: number;
  totalYen: number;
  hasReduced8: boolean;
};
