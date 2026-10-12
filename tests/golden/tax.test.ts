import { calculateTotals } from '@/lib/domain/tax';
import type { TaxLineInput } from '@/lib/domain/types';

function line(
  unitPriceYen: number,
  tax: TaxLineInput['taxCategory'],
  quantityMilli = 1000,
): TaxLineInput {
  return { unitPriceYen, quantityMilli, taxCategory: tax };
}

describe('calculateTotals golden', () => {
  it('T01 税抜1000・10%・数量1000', () => {
    const r = calculateTotals([line(1000, 'standard_10')]);
    expect(r.buckets.find((b) => b.taxCategory === 'standard_10')?.taxYen).toBe(100);
    expect(r.totalYen).toBe(1100);
  });

  it('T02 税抜101・10%', () => {
    const r = calculateTotals([line(101, 'standard_10')]);
    expect(r.buckets[0].taxYen).toBe(10);
    expect(r.totalYen).toBe(111);
  });

  it('T03 税抜99・10%', () => {
    const r = calculateTotals([line(99, 'standard_10')]);
    expect(r.buckets[0].taxYen).toBe(9);
    expect(r.totalYen).toBe(108);
  });

  it('T04 55+55 課税標準110 税11', () => {
    const r = calculateTotals([line(55, 'standard_10'), line(55, 'standard_10')]);
    const b = r.buckets.find((x) => x.taxCategory === 'standard_10');
    expect(b?.baseYen).toBe(110);
    expect(b?.taxYen).toBe(11);
  });

  it('T05 101×10行 課税標準1010 税101', () => {
    const lines = Array.from({ length: 10 }, () => line(101, 'standard_10'));
    const r = calculateTotals(lines);
    const b = r.buckets.find((x) => x.taxCategory === 'standard_10');
    expect(b?.baseYen).toBe(1010);
    expect(b?.taxYen).toBe(101);
  });

  it('T06 10%1000と8%800', () => {
    const r = calculateTotals([line(1000, 'standard_10'), line(800, 'reduced_8')]);
    const t10 = r.buckets.find((b) => b.taxCategory === 'standard_10');
    const t8 = r.buckets.find((b) => b.taxCategory === 'reduced_8');
    expect(t10?.taxYen).toBe(100);
    expect(t8?.taxYen).toBe(64);
    expect(r.totalYen).toBe(1964);
  });

  it('T07 税抜108・8%', () => {
    const r = calculateTotals([line(108, 'reduced_8')]);
    expect(r.buckets[0].taxYen).toBe(8);
    expect(r.totalYen).toBe(116);
  });

  it('T08 対象外200と標準100', () => {
    const r = calculateTotals([line(200, 'non_taxable'), line(100, 'standard_10')]);
    expect(r.buckets.find((b) => b.taxCategory === 'non_taxable')?.baseYen).toBe(200);
    expect(r.buckets.find((b) => b.taxCategory === 'standard_10')?.taxYen).toBe(10);
    expect(r.totalYen).toBe(310);
  });

  it('T09 数量1500・単価1000', () => {
    const r = calculateTotals([line(1000, 'standard_10', 1500)]);
    expect(r.lineAmounts[0]).toBe(1500);
    expect(r.buckets[0].taxYen).toBe(150);
    expect(r.totalYen).toBe(1650);
  });

  it('T10 数量1500・単価1', () => {
    const r = calculateTotals([line(1, 'standard_10', 1500)]);
    expect(r.lineAmounts[0]).toBe(1);
    expect(r.buckets[0].taxYen).toBe(0);
    expect(r.totalYen).toBe(1);
  });

  it('T11 値引き行', () => {
    const r = calculateTotals([line(10000, 'standard_10'), line(-500, 'standard_10')]);
    const b = r.buckets.find((x) => x.taxCategory === 'standard_10');
    expect(b?.baseYen).toBe(9500);
    expect(b?.taxYen).toBe(950);
    expect(r.totalYen).toBe(10450);
  });

  it('T12 税抜1・10%', () => {
    const r = calculateTotals([line(1, 'standard_10')]);
    expect(r.buckets[0].taxYen).toBe(0);
    expect(r.totalYen).toBe(1);
  });

  it('T13 行0', () => {
    const r = calculateTotals([]);
    expect(r.buckets).toHaveLength(0);
    expect(r.totalYen).toBe(0);
  });

  it('T14 単価-101', () => {
    const r = calculateTotals([line(-101, 'standard_10')]);
    const b = r.buckets.find((x) => x.taxCategory === 'standard_10');
    expect(b?.baseYen).toBe(-101);
    expect(b?.taxYen).toBe(-11);
    expect(r.totalYen).toBe(-112);
  });

  it('T15 大きな税抜', () => {
    const r = calculateTotals([line(1234567, 'standard_10')]);
    expect(r.buckets[0].taxYen).toBe(123456);
    expect(r.totalYen).toBe(1358023);
  });

  it('T16 8%行なし', () => {
    const r = calculateTotals([line(100, 'standard_10')]);
    expect(r.buckets.find((b) => b.taxCategory === 'reduced_8')).toBeUndefined();
  });
});
