import { createClient } from "@/lib/supabase/server";
import { ReturnsClient, type SaleOption, type SaleItemLine } from "@/components/returns/ReturnsClient";
import { getSessionProfile } from "@/lib/auth";

export default async function ReturnsPage() {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const isAdmin = profile?.role === "admin";
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const earliestEligible = new Date(now - 5 * dayMs).toISOString();
  const latestEligible = new Date(now - 3 * dayMs).toISOString();
  const { data: raw } = await supabase
    .from("sales")
    .select(
      `
      id,
      receipt_number,
      created_at,
      sale_items ( id, quantity, price, product_id, products ( name ) )
    `
    )
    .gte("created_at", earliestEligible)
    .lte("created_at", latestEligible)
    .order("created_at", { ascending: false })
    .limit(10);

  const sales: SaleOption[] = (raw ?? []).map((s: Record<string, unknown>) => {
    const itemsRaw = (s.sale_items ?? []) as Record<string, unknown>[];
    const sale_items: SaleItemLine[] = itemsRaw.map((it) => {
      const prod = it.products as { name: string } | { name: string }[] | null | undefined;
      const products =
        prod == null
          ? null
          : Array.isArray(prod)
            ? prod[0] ?? null
            : prod;
      return {
        id: String(it.id),
        product_id: (it.product_id as string | null) ?? null,
        quantity: Number(it.quantity),
        price: it.price as string | number,
        products,
      };
    });

    return {
      id: String(s.id),
      receipt_number: String(s.receipt_number),
      created_at: String(s.created_at),
      sale_items,
    };
  });

  const { data: rawReturns } = await supabase
    .from("returns")
    .select(
      `
      id,
      created_at,
      reason,
      sales ( receipt_number ),
      return_items ( quantity, action, products ( name ) )
    `
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const recentReturns = (rawReturns ?? []).map((r: Record<string, unknown>) => {
    const receiptSource = r.sales as { receipt_number: string } | { receipt_number: string }[] | null;
    const receipt = Array.isArray(receiptSource)
      ? (receiptSource[0]?.receipt_number ?? "-")
      : (receiptSource?.receipt_number ?? "-");
    const linesRaw = (r.return_items ?? []) as Record<string, unknown>[];
    const totalQty = linesRaw.reduce((acc, it) => acc + Number(it.quantity ?? 0), 0);
    return {
      id: String(r.id),
      created_at: String(r.created_at),
      reason: String((r.reason as string | null) ?? ""),
      receipt_number: receipt,
      totalQty,
    };
  });

  return <ReturnsClient sales={sales} isAdmin={isAdmin} recentReturns={recentReturns} />;
}

