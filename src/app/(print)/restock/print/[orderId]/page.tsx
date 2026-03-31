import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/login");
  }

  const { orderId } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, created_at, suppliers(name, contact_info)")
    .eq("id", orderId)
    .single();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, quantity, products(name)")
    .eq("order_id", orderId)
    .order("id", { ascending: true });

  const supplierName = (order as any)?.suppliers?.name ?? "Supplier";
  const supplierContact = (order as any)?.suppliers?.contact_info ?? null;
  const createdAt = order ? new Date((order as any).created_at) : null;
  const poNumber = `PO-${String(orderId).slice(0, 8).toUpperCase()}`;
  const totalQty = (items ?? []).reduce(
    (sum: number, it: any) => sum + Number(it.quantity ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-3xl bg-white px-4 py-6 text-black print:max-w-none print:px-0 print:py-0">
      <div className="rounded-xl border border-black/10 bg-white p-5 shadow-[var(--shadow-sm)] print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-black/60">
              Phoebe Drugstore
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Purchase Order</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{poNumber}</p>
            <p className="mt-1 text-xs text-black/60">
              {createdAt ? createdAt.toLocaleDateString() : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-black/10 p-3 tablet:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/60">
              Supplier
            </p>
            <p className="mt-1 text-sm font-semibold">{supplierName}</p>
            {supplierContact ? <p className="mt-1 text-xs text-black/60">{supplierContact}</p> : null}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/60">Deliver to</p>
            <p className="mt-1 text-sm text-black/70">Phoebe Drugstore</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-black/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/[0.03] uppercase tracking-wide text-black/60">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any, idx: number) => (
                <tr key={it.id} className="border-t border-black/10">
                  <td className="px-3 py-2 font-mono text-[11px] text-black/60">{idx + 1}</td>
                  <td className="px-3 py-2">{it.products?.name ?? "Product"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{it.quantity}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-xs text-black/60" colSpan={3}>
                    No items found for this order.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {(items ?? []).length > 0 ? (
              <tfoot>
                <tr className="border-t border-black/10 bg-black/[0.02]">
                  <td
                    className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-black/60"
                    colSpan={2}
                  >
                    Total Quantity
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{totalQty}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <div className="mt-8 grid gap-8 text-[11px] tablet:grid-cols-2">
          <div>
            <p className="mb-8 text-black/70">Prepared by:</p>
            <div className="border-t border-black/30 pt-1">Authorized Signature</div>
          </div>
          <div>
            <p className="mb-8 text-black/70">Received by supplier:</p>
            <div className="border-t border-black/30 pt-1">Supplier Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
}

