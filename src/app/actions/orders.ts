"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSupplierAction(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const contact_info = String(formData.get("contact_info") ?? "").trim() || null;
  if (!name) return { ok: false as const, message: "Supplier name required." };

  const { error } = await supabase.from("suppliers").insert({ name, contact_info });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/restock");
  return { ok: true as const };
}

export async function createOrderAction(formData: FormData) {
  const supabase = await createClient();
  const supplier_id = String(formData.get("supplier_id") ?? "");
  if (!supplier_id) return { ok: false as const, message: "Select a supplier." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Not signed in." };

  const { data: order, error } = await supabase
    .from("orders")
    .insert({ supplier_id, created_by: user.id, status: "pending" })
    .select("id")
    .single();

  if (error || !order) return { ok: false as const, message: error?.message ?? "Failed to create order." };

  revalidatePath("/restock");
  return { ok: true as const, orderId: order.id };
}

export async function addOrderLineAction(orderId: string, productId: string, quantity: number) {
  const supabase = await createClient();
  if (!orderId || !productId || quantity < 1) {
    return { ok: false as const, message: "Invalid line." };
  }
  const { error } = await supabase.from("order_items").insert({
    order_id: orderId,
    product_id: productId,
    quantity,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/restock");
  return { ok: true as const };
}

export async function updateOrderLineQtyAction(formData: FormData) {
  const supabase = await createClient();
  const lineId = String(formData.get("line_id") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  if (!lineId || !Number.isFinite(quantity) || quantity < 0) {
    return { ok: false as const, message: "Invalid quantity." };
  }

  const { data: row, error: e1 } = await supabase
    .from("order_items")
    .select("id, order_id, orders(status)")
    .eq("id", lineId)
    .single();
  if (e1) return { ok: false as const, message: e1.message };

  const status = (row as any)?.orders?.status as string | undefined;
  if (status !== "pending") {
    return { ok: false as const, message: "Only pending orders can be edited." };
  }

  if (quantity === 0) {
    const { error } = await supabase.from("order_items").delete().eq("id", lineId);
    if (error) return { ok: false as const, message: error.message };
  } else {
    const { error } = await supabase.from("order_items").update({ quantity }).eq("id", lineId);
    if (error) return { ok: false as const, message: error.message };
  }

  revalidatePath("/restock");
  return { ok: true as const };
}

export async function updateOrderLinesAction(formData: FormData) {
  const supabase = await createClient();
  const orderId = String(formData.get("order_id") ?? "").trim();
  const raw = String(formData.get("lines") ?? "");
  if (!orderId || !raw) return { ok: false as const, message: "Missing update payload." };

  let lines: { lineId: string; quantity: number }[] = [];
  try {
    lines = JSON.parse(raw) as { lineId: string; quantity: number }[];
  } catch {
    return { ok: false as const, message: "Invalid update payload." };
  }

  const { data: order, error: e0 } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();
  if (e0) return { ok: false as const, message: e0.message };
  if (!order || order.status !== "pending") {
    return { ok: false as const, message: "Only pending orders can be edited." };
  }

  const clean = lines
    .map((l) => ({
      lineId: String((l as any).lineId ?? "").trim(),
      quantity: Number((l as any).quantity),
    }))
    .filter((l) => l.lineId && Number.isFinite(l.quantity) && l.quantity >= 0);

  if (clean.length === 0) {
    return { ok: false as const, message: "No valid line updates." };
  }

  const deletions = clean.filter((l) => l.quantity === 0).map((l) => l.lineId);
  if (deletions.length > 0) {
    const { error } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId)
      .in("id", deletions);
    if (error) return { ok: false as const, message: error.message };
  }

  const updates = clean.filter((l) => l.quantity > 0);
  for (const u of updates) {
    const { error } = await supabase
      .from("order_items")
      .update({ quantity: u.quantity })
      .eq("order_id", orderId)
      .eq("id", u.lineId);
    if (error) return { ok: false as const, message: error.message };
  }

  revalidatePath("/restock");
  return { ok: true as const };
}

export async function receiveOrderAction(orderId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_receive_order", { p_order_id: orderId });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/restock");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

type DraftLine = { productId: string; supplierId: string | null; qty: number; selected?: boolean };

export async function createOrdersFromDraftLinesAction(formData: FormData) {
  const supabase = await createClient();
  const raw = String(formData.get("lines") ?? "");
  if (!raw) return { ok: false as const, message: "No draft lines provided." };

  let lines: DraftLine[] = [];
  try {
    lines = JSON.parse(raw) as DraftLine[];
  } catch {
    return { ok: false as const, message: "Invalid draft lines payload." };
  }

  const clean = lines
    .map((l) => ({
      productId: String(l.productId ?? "").trim(),
      supplierId: String(l.supplierId ?? "").trim() || null,
      qty: Number(l.qty ?? 0),
      selected: Boolean((l as any).selected),
    }))
    .filter((l) => l.selected && l.productId && Number.isFinite(l.qty) && l.qty > 0);

  if (clean.length === 0) {
    return { ok: false as const, message: "Select at least one item and set qty > 0." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Not signed in." };

  const bySupplier = new Map<string, DraftLine[]>();
  clean.forEach((l) => {
    const key = l.supplierId ?? "__none__";
    const a = bySupplier.get(key) ?? [];
    a.push(l);
    bySupplier.set(key, a);
  });

  const createdOrderIds: string[] = [];
  for (const [supplierKey, supplierLines] of bySupplier.entries()) {
    const supplierId = supplierKey === "__none__" ? null : supplierKey;
    const { data: order, error } = await supabase
      .from("orders")
      .insert({ supplier_id: supplierId, created_by: user.id, status: "pending" })
      .select("id")
      .single();
    if (error || !order) {
      return { ok: false as const, message: error?.message ?? "Failed to create order." };
    }

    const items = supplierLines.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      quantity: l.qty,
    }));
    const { error: e2 } = await supabase.from("order_items").insert(items);
    if (e2) return { ok: false as const, message: e2.message };
    createdOrderIds.push(order.id);
  }

  revalidatePath("/restock");
  return { ok: true as const, orderIds: createdOrderIds };
}

export async function deletePendingOrderAction(formData: FormData) {
  const supabase = await createClient();
  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false as const, message: "Missing order." };

  const { data: order, error: e1 } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();
  if (e1) return { ok: false as const, message: e1.message };
  if (!order || order.status !== "pending") {
    return { ok: false as const, message: "Only pending orders can be deleted." };
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/restock");
  return { ok: true as const };
}
