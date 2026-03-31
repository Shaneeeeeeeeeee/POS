import type { Product } from "@/types/database";

export type BatchWithProduct = {
  id: string;
  remaining_quantity: number;
  expiration_date: string | null;
  products: { name: string; category: string | null } | null;
};

export type LowStockLine = {
  productId: string;
  name: string;
  stock: number;
  /** Effective threshold: `min_stock_level` or 0 when the field is null. */
  minAlert: number;
  /** True only when `min_stock_level` was null (0 was assumed). */
  usedDefaultMin: boolean;
};

export type InventoryInsights = {
  /**
   * Categories with at least one SKU where **stock ≤ min stock alert**.
   * `minAlert` in each line is `min_stock_level` from the catalog, or **0** if unset.
   */
  lowStockByCategory: {
    category: string;
    totalSkus: number;
    lowStockSkus: number;
    pct: number;
    /** Every SKU in this category that matched the low rule (for display). */
    lines: LowStockLine[];
  }[];
  /** Lots past expiration (remaining &gt; 0), most expired first. */
  expiredBatches: {
    batchId: string;
    productName: string;
    category: string | null;
    expirationDate: string;
    remaining: number;
    daysPast: number;
  }[];
  /** Remaining &gt; 0, expiring within next 30 days, soonest first. */
  expiringSoonBatches: {
    batchId: string;
    productName: string;
    category: string | null;
    expirationDate: string;
    remaining: number;
    daysLeft: number;
  }[];
};

export function computeInventoryInsights(
  products: Product[],
  batches: BatchWithProduct[]
): InventoryInsights {
  const byCat = new Map<
    string,
    { totalSkus: number; lowStockSkus: number; lines: LowStockLine[] }
  >();
  for (const p of products) {
    const c = p.category?.trim() || "Uncategorized";
    if (!byCat.has(c)) byCat.set(c, { totalSkus: 0, lowStockSkus: 0, lines: [] });
    const g = byCat.get(c)!;
    g.totalSkus++;
    const minAlert = p.min_stock_level ?? 0;
    if (p.stock_quantity <= minAlert) {
      g.lowStockSkus++;
      g.lines.push({
        productId: p.id,
        name: p.name,
        stock: p.stock_quantity,
        minAlert,
        usedDefaultMin: p.min_stock_level === null,
      });
    }
  }

  const lowStockByCategory = [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      totalSkus: v.totalSkus,
      lowStockSkus: v.lowStockSkus,
      pct: v.totalSkus > 0 ? Math.round((v.lowStockSkus / v.totalSkus) * 1000) / 10 : 0,
      lines: v.lines.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    }))
    .filter((x) => x.lowStockSkus > 0)
    .sort((a, b) => b.pct - a.pct || b.lowStockSkus - a.lowStockSkus);

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayMs = 86_400_000;

  const active = batches.filter((b) => (b.remaining_quantity ?? 0) > 0);
  const withExp = active
    .filter((b) => b.expiration_date)
    .map((b) => {
      const exp = new Date(b.expiration_date as string);
      exp.setHours(12, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / dayMs);
      return {
        batchId: b.id,
        productName: b.products?.name ?? "—",
        category: b.products?.category ?? null,
        expirationDate: (b.expiration_date as string).slice(0, 10),
        remaining: b.remaining_quantity,
        days,
      };
    });

  const expiredBatches = withExp
    .filter((x) => x.days < 0)
    .map(({ days, ...rest }) => ({ ...rest, daysPast: -days }))
    .sort((a, b) => b.daysPast - a.daysPast);

  const expiringSoonBatches = withExp
    .filter((x) => x.days >= 0 && x.days <= 30)
    .map(({ days, ...rest }) => ({ ...rest, daysLeft: days }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return { lowStockByCategory, expiredBatches, expiringSoonBatches };
}
