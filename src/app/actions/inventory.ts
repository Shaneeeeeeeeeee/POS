"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { parseStoredCategories, INVENTORY_CATEGORIES_KEY, normalizeCategory } from "@/lib/inventoryCategories";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function upsertCategoryOption(
  category: string,
  updatedBy: string | null,
  strict = false
) {
  const normalized = normalizeCategory(category);
  if (!normalized) return;
  try {
    const admin = createServiceRoleClient();
    const { data, error: readErr } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", INVENTORY_CATEGORIES_KEY)
      .maybeSingle();
    if (readErr) {
      if (strict) throw new Error(readErr.message);
      return;
    }
    const existing = parseStoredCategories(data?.value ?? null);
    const hasAlready = existing.some((c) => c.toLowerCase() === normalized.toLowerCase());
    if (hasAlready) return;
    const next = [...existing, normalized].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const { error: writeErr } = await admin.from("app_settings").upsert({
      key: INVENTORY_CATEGORIES_KEY,
      value: JSON.stringify(next),
      updated_by: updatedBy,
    });
    if (writeErr && strict) throw new Error(writeErr.message);
  } catch {
    // Category suggestions are best-effort and should not block product changes.
    if (strict) throw new Error("Unable to save category.");
  }
}

/** Add new product only (no id). Stock starts at 0—use Batches or receiving. */
export async function addProductAction(formData: FormData) {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const name = String(formData.get("name") ?? "").trim();
  const category = normalizeCategory(String(formData.get("category") ?? "")) || null;
  const price = Number(formData.get("price"));
  const min_stock_level = Number(formData.get("min_stock_level") ?? 5);
  const is_active = formData.get("is_active") === "on";

  if (!name || Number.isNaN(price)) {
    return { ok: false as const, message: "Name and valid price are required." };
  }

  const { error } = await supabase.from("products").insert({
    name,
    category,
    price,
    min_stock_level,
    stock_quantity: 0,
    is_active,
  });
  if (error) return { ok: false as const, message: error.message };
  if (category) {
    await upsertCategoryOption(category, profile?.id ?? null);
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

/** Update catalog fields for an existing product (from Catalog editor). */
export async function updateProductCatalogAction(formData: FormData) {
  const supabase = await createClient();
  const profile = await getSessionProfile();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, message: "Missing product." };

  const name = String(formData.get("name") ?? "").trim();
  const category = normalizeCategory(String(formData.get("category") ?? "")) || null;
  const price = Number(formData.get("price"));
  const min_stock_level = Number(formData.get("min_stock_level") ?? 5);
  const is_active = formData.get("is_active") === "on";

  if (!name || Number.isNaN(price)) {
    return { ok: false as const, message: "Name and valid price are required." };
  }

  const { error } = await supabase
    .from("products")
    .update({
      name,
      category,
      price,
      min_stock_level,
      is_active,
    })
    .eq("id", id);

  if (error) return { ok: false as const, message: error.message };
  if (category) {
    await upsertCategoryOption(category, profile?.id ?? null);
  }
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

export async function deleteEmptyCategoryAction(formData: FormData) {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { ok: false as const, message: "Only managers or admins can delete categories." };
  }

  const category = normalizeCategory(String(formData.get("category") ?? ""));
  if (!category) return { ok: false as const, message: "Category is required." };

  const supabase = await createClient();
  const { count, error: countErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .ilike("category", category);
  if (countErr) return { ok: false as const, message: countErr.message };
  if ((count ?? 0) > 0) {
    return { ok: false as const, message: "Cannot delete category: it still has products." };
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", INVENTORY_CATEGORIES_KEY)
      .maybeSingle();
    if (error) return { ok: false as const, message: error.message };

    const existing = parseStoredCategories(data?.value ?? null);
    const next = existing.filter((c) => c.toLowerCase() !== category.toLowerCase());
    await admin.from("app_settings").upsert({
      key: INVENTORY_CATEGORIES_KEY,
      value: JSON.stringify(next),
      updated_by: profile.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to delete category.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/inventory");
  return { ok: true as const, message: "Category deleted." };
}

export async function addCategoryOptionAction(formData: FormData) {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { ok: false as const, message: "Only managers or admins can add categories." };
  }

  const category = normalizeCategory(String(formData.get("category") ?? ""));
  if (!category) return { ok: false as const, message: "Category name is required." };

  try {
    await upsertCategoryOption(category, profile.id, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to add category.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/inventory");
  return { ok: true as const, message: "Category added." };
}

export async function updateCategoryOptionAction(formData: FormData) {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { ok: false as const, message: "Only managers or admins can update categories." };
  }

  const oldCategory = normalizeCategory(String(formData.get("oldCategory") ?? ""));
  const newCategory = normalizeCategory(String(formData.get("newCategory") ?? ""));
  if (!oldCategory || !newCategory) {
    return { ok: false as const, message: "Old and new category are required." };
  }
  if (oldCategory.toLowerCase() === newCategory.toLowerCase()) {
    return { ok: false as const, message: "No changes detected." };
  }

  const supabase = await createClient();
  const { error: updateProductsErr } = await supabase
    .from("products")
    .update({ category: newCategory })
    .ilike("category", oldCategory);
  if (updateProductsErr) return { ok: false as const, message: updateProductsErr.message };

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", INVENTORY_CATEGORIES_KEY)
      .maybeSingle();
    if (error) return { ok: false as const, message: error.message };

    const existing = parseStoredCategories(data?.value ?? null);
    const next = [
      ...existing.filter((c) => c.toLowerCase() !== oldCategory.toLowerCase()),
      newCategory,
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const deduped: string[] = [];
    for (const item of next) {
      if (!deduped.some((v) => v.toLowerCase() === item.toLowerCase())) deduped.push(item);
    }
    const { error: upsertErr } = await admin.from("app_settings").upsert({
      key: INVENTORY_CATEGORIES_KEY,
      value: JSON.stringify(deduped),
      updated_by: profile.id,
    });
    if (upsertErr) return { ok: false as const, message: upsertErr.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to update category.";
    return { ok: false as const, message: msg };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const, message: "Category updated." };
}

export async function deactivateProductAction(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, message: "Missing product." };

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

export async function reactivateProductAction(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, message: "Missing product." };

  const { error } = await supabase
    .from("products")
    .update({ is_active: true })
    .eq("id", id);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}

export async function deleteProductIfNeverSoldAction(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, message: "Missing product." };

  const { data: sold, error: soldErr } = await supabase
    .from("sale_items")
    .select("id")
    .eq("product_id", id)
    .limit(1);

  if (soldErr) return { ok: false as const, message: soldErr.message };
  if ((sold ?? []).length > 0) {
    return { ok: false as const, message: "Cannot delete: product has sales records." };
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { ok: true as const };
}
