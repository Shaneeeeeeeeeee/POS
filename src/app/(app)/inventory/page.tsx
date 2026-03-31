import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  INVENTORY_CATEGORIES_KEY,
  parseStoredCategories,
  normalizeCategory,
  uniqueCategories,
} from "@/lib/inventoryCategories";
import { InventoryClient } from "@/components/inventory/InventoryClient";
import {
  computeInventoryInsights,
  type BatchWithProduct,
} from "@/lib/inventoryInsights";

export default async function InventoryPage() {
  const supabase = await createClient();
  const admin = createServiceRoleClient();
  const [{ data: products }, { data: suppliers }, { data: rawBatches }, { data: catSetting }] =
    await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase
        .from("product_batches")
        .select(
          "id, remaining_quantity, expiration_date, products ( name, category )"
        ),
      admin
        .from("app_settings")
        .select("value")
        .eq("key", INVENTORY_CATEGORIES_KEY)
        .maybeSingle(),
    ]);

  const hiddenIds = (products ?? []).filter((p) => !p.is_active).map((p) => p.id);
  const soldHidden = new Set<string>();
  if (hiddenIds.length > 0) {
    const { data: soldRows } = await supabase
      .from("sale_items")
      .select("product_id")
      .in("product_id", hiddenIds);
    for (const r of soldRows ?? []) {
      const pid = (r as { product_id: string | null }).product_id;
      if (pid) soldHidden.add(pid);
    }
  }
  const deletableProductIds = hiddenIds.filter((id) => !soldHidden.has(id));

  const batches: BatchWithProduct[] = (rawBatches ?? []).map((row: unknown) => {
    const r = row as {
      id: string;
      remaining_quantity: number;
      expiration_date: string | null;
      products: { name: string; category: string | null } | null;
    };
    return {
      id: r.id,
      remaining_quantity: r.remaining_quantity,
      expiration_date: r.expiration_date,
      products: r.products,
    };
  });

  const insights = computeInventoryInsights(products ?? [], batches);
  const productCategories = (products ?? [])
    .map((p) => normalizeCategory(p.category))
    .filter(Boolean);
  const storedCategories = parseStoredCategories(catSetting?.value ?? null);
  const categoryOptions = uniqueCategories(productCategories, storedCategories);
  const usedSet = new Set(productCategories.map((c) => c.toLowerCase()));
  const categoryRows = categoryOptions.map((name) => ({
    name,
    productCount: (products ?? []).filter(
      (p) => normalizeCategory(p.category).toLowerCase() === name.toLowerCase()
    ).length,
    canDelete: storedCategories.some((c) => c.toLowerCase() === name.toLowerCase()) &&
      !usedSet.has(name.toLowerCase()),
  }));

  return (
    <InventoryClient
      products={products ?? []}
      suppliers={suppliers ?? []}
      insights={insights}
      deletableProductIds={deletableProductIds}
      categoryOptions={categoryOptions}
      categoryRows={categoryRows}
    />
  );
}
