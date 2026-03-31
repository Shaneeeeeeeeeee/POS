"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function syncStockFromBatchesForProduct(productId: string) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("product_batches")
    .select("remaining_quantity")
    .eq("product_id", productId);

  if (!rows?.length) return;

  const sum = rows.reduce((a, r) => a + (Number(r.remaining_quantity) || 0), 0);
  await supabase.from("products").update({ stock_quantity: sum }).eq("id", productId);
}

export async function getBatchesForProductAction(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("product_id", productId)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  if (error) return { ok: false as const, message: error.message, batches: [] };
  return { ok: true as const, batches: data ?? [] };
}

export async function updateBatchAction(
  productId: string,
  batchId: string,
  fields: {
    remaining_quantity: number;
    purchase_date: string | null;
    expiration_date: string | null;
  }
) {
  const supabase = await createClient();
  if (fields.remaining_quantity < 0) {
    return { ok: false as const, message: "Remaining quantity cannot be negative." };
  }

  const { error } = await supabase
    .from("product_batches")
    .update({
      remaining_quantity: fields.remaining_quantity,
      purchase_date: fields.purchase_date || null,
      expiration_date: fields.expiration_date || null,
    })
    .eq("id", batchId)
    .eq("product_id", productId);

  if (error) return { ok: false as const, message: error.message };

  await syncStockFromBatchesForProduct(productId);
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

export async function createBatchAction(
  productId: string,
  form: {
    quantity: number;
    supplier_id: string | null;
    purchase_date: string | null;
    expiration_date: string | null;
  }
) {
  const supabase = await createClient();
  if (form.quantity < 1) {
    return { ok: false as const, message: "Quantity must be at least 1." };
  }

  const { error } = await supabase.from("product_batches").insert({
    product_id: productId,
    supplier_id: form.supplier_id,
    order_id: null,
    quantity: form.quantity,
    remaining_quantity: form.quantity,
    purchase_date: form.purchase_date || null,
    expiration_date: form.expiration_date || null,
  });

  if (error) return { ok: false as const, message: error.message };

  await syncStockFromBatchesForProduct(productId);
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

export async function deleteBatchAction(productId: string, batchId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_batches")
    .delete()
    .eq("id", batchId)
    .eq("product_id", productId);

  if (error) return { ok: false as const, message: error.message };

  const { data: rest } = await supabase
    .from("product_batches")
    .select("id")
    .eq("product_id", productId)
    .limit(1);

  if (rest?.length) {
    await syncStockFromBatchesForProduct(productId);
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}
