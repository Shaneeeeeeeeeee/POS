import { createClient } from "@/lib/supabase/server";
import { RestockClient } from "@/components/restock/RestockClient";

export default async function RestockPage() {
  const supabase = await createClient();

  const { data: suppliers } = await supabase.from("suppliers").select("*").order("name");
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("id, supplier_id, status, created_by, created_at, suppliers(name)")
    .order("created_at", { ascending: false })
    .limit(40);

  const orders = (ordersRaw ?? []).map((o: any) => ({
    id: o.id as string,
    supplier_id: o.supplier_id as string | null,
    status: o.status as "pending" | "received",
    created_by: o.created_by as string | null,
    created_at: o.created_at as string,
    supplierName: (o.suppliers?.name as string | undefined) ?? null,
  }));

  const ids = orders.map((o) => o.id);

  let orderItemsRaw: Record<string, unknown>[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, quantity, products(id, name)")
      .in("order_id", ids);
    orderItemsRaw = (data ?? []) as Record<string, unknown>[];
  }

  const { data: products } = await supabase.from("products").select("*").order("name");

  const pendingOrderIds = new Set(orders.filter((o) => o.status === "pending").map((o) => o.id));
  const pendingProductIds = new Set<string>();
  for (const r of orderItemsRaw) {
    const oid = r.order_id as string | undefined;
    const pid = r.product_id as string | null | undefined;
    if (oid && pid && pendingOrderIds.has(oid)) pendingProductIds.add(pid);
  }

  const lowStock = (products ?? [])
    .map((p) => {
      const min = p.min_stock_level ?? 0;
      return {
        id: p.id,
        name: p.name,
        category: p.category ?? "Uncategorized",
        stock: p.stock_quantity,
        min,
      };
    })
    .filter((p) => p.stock <= p.min)
    .filter((p) => !pendingProductIds.has(p.id))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const normalized = orderItemsRaw.map((row) => {
    const prod = row.products as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null
      | undefined;
    const resolved =
      prod == null ? null : Array.isArray(prod) ? (prod[0] ?? null) : prod;
    return {
      id: row.id as string,
      order_id: row.order_id as string,
      product_id: row.product_id as string | null,
      quantity: row.quantity as number,
      products: resolved,
    };
  });

  return (
    <RestockClient
      suppliers={suppliers ?? []}
      orders={orders ?? []}
      orderItems={normalized}
      products={products ?? []}
      lowStock={lowStock}
    />
  );
}
