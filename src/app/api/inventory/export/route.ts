import { NextResponse } from "next/server";
import { buildInventoryWorkbook } from "@/lib/buildInventoryWorkbook";
import { getSessionProfile } from "@/lib/auth";
import type { BatchWithProduct } from "@/lib/inventoryInsights";
import type { Product } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = await createClient();

  const [{ data: products, error: e1 }, { data: rawBatches, error: e2 }] =
    await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase
        .from("product_batches")
        .select(
          "id, remaining_quantity, expiration_date, products ( name, category )"
        ),
    ]);

  if (e1 || e2) {
    return new NextResponse(e1?.message ?? e2?.message ?? "Query failed", {
      status: 500,
    });
  }

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

  const buffer = await buildInventoryWorkbook(
    (products ?? []) as Product[],
    batches
  );

  const day = new Date().toISOString().slice(0, 10);
  // NextResponse expects a web BodyInit; Buffer typing doesn't match.
  // Uint8Array is a valid BodyInit in Node runtime.
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-${day}.xlsx"`,
    },
  });
}
