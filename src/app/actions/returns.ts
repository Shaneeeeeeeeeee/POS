"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReturnLineInput = {
  product_id: string;
  quantity: number;
  action: "restock" | "dispose" | "exchange";
};

export async function processReturnAction(
  saleId: string,
  reason: string,
  items: ReturnLineInput[],
  sealedConfirmed: boolean
) {
  const supabase = await createClient();
  if (!saleId || items.length === 0) {
    return { ok: false as const, message: "Sale and at least one line required." };
  }
  if (!sealedConfirmed) {
    return {
      ok: false as const,
      message: "Return rejected. Item must be sealed and unused before acceptance.",
    };
  }

  const { data: saleRow, error: saleErr } = await supabase
    .from("sales")
    .select("created_at")
    .eq("id", saleId)
    .maybeSingle();
  if (saleErr || !saleRow?.created_at) {
    return { ok: false as const, message: "Unable to verify receipt date." };
  }
  const createdAt = new Date(saleRow.created_at).getTime();
  const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  if (ageDays < 3 || ageDays > 5) {
    return {
      ok: false as const,
      message: "Only receipts aged between 3 and 5 days are eligible for return/exchange.",
    };
  }

  const { data, error } = await supabase.rpc("fn_process_return", {
    p_sale_id: saleId,
    p_reason: reason.trim() || null,
    p_items: items,
  });

  if (error) return { ok: false as const, message: error.message };
  const { error: auditErr } = await supabase.from("return_audit_events").insert({
    sale_id: saleId,
    return_id: data as string,
    event_type: "processed",
    note: reason.trim() || "Return processed",
  });
  if (auditErr) return { ok: false as const, message: auditErr.message };
  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales");
  return { ok: true as const, returnId: data as string };
}

export async function deleteReturnAction(returnId: string) {
  const supabase = await createClient();
  if (!returnId) return { ok: false as const, message: "Return ID is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Not authenticated." };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile || profile.role !== "admin") {
    return { ok: false as const, message: "Only admin can delete return records." };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("return_items")
    .select("product_id, quantity, action")
    .eq("return_id", returnId);
  if (linesErr) return { ok: false as const, message: linesErr.message };

  const stockAdjustments = (lines ?? []).filter((l) => {
    const action = (l as { action: string }).action;
    return action === "restock" || action === "exchange";
  }) as { product_id: string | null; quantity: number; action: string }[];

  for (const line of stockAdjustments) {
    if (!line.product_id) continue;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("stock_quantity, return_stock_quantity, name")
      .eq("id", line.product_id)
      .maybeSingle();
    if (pErr || !product) {
      return { ok: false as const, message: "Could not verify product stock before delete." };
    }
    if (Number(product.stock_quantity) < Number(line.quantity)) {
      return {
        ok: false as const,
        message: `Cannot delete return: ${product.name} stock is already consumed.`,
      };
    }
    if (Number(product.return_stock_quantity ?? 0) < Number(line.quantity)) {
      return {
        ok: false as const,
        message: `Cannot delete return: ${product.name} return stock is already sold.`,
      };
    }
  }

  const { data: retRow, error: retErr } = await supabase
    .from("returns")
    .select("sale_id, reason")
    .eq("id", returnId)
    .maybeSingle();
  if (retErr || !retRow?.sale_id) {
    return { ok: false as const, message: "Return record not found." };
  }

  for (const line of stockAdjustments) {
    if (!line.product_id) continue;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("stock_quantity, return_stock_quantity")
      .eq("id", line.product_id)
      .maybeSingle();
    if (pErr || !product) return { ok: false as const, message: "Stock rollback failed." };
    const nextQty = Number(product.stock_quantity) - Number(line.quantity);
    const nextReturnQty = Number(product.return_stock_quantity ?? 0) - Number(line.quantity);
    const { error: setErr } = await supabase
      .from("products")
      .update({ stock_quantity: nextQty, return_stock_quantity: nextReturnQty })
      .eq("id", line.product_id);
    if (setErr) return { ok: false as const, message: setErr.message };
  }

  const { error: auditErr } = await supabase.from("return_audit_events").insert({
    sale_id: retRow.sale_id as string,
    return_id: null,
    event_type: "deleted",
    note: `Return deleted by admin. Original reason: ${(retRow.reason as string | null) ?? "-"}`,
  });
  if (auditErr) return { ok: false as const, message: auditErr.message };

  const { error } = await supabase.from("returns").delete().eq("id", returnId);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales");
  return { ok: true as const };
}
