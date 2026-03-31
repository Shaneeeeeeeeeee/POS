import { createClient } from "@/lib/supabase/server";
import { SalesClient, type SaleRow } from "@/components/sales/SalesClient";

export default async function SalesPage() {
  const supabase = await createClient();
  const { data: raw } = await supabase
    .from("sales")
    .select(
      `
      id,
      receipt_number,
      created_by,
      created_at,
      profiles ( full_name, email ),
      return_audit_events ( event_type, note, created_at ),
      sale_items ( quantity, price, products ( name ) )
    `
    )
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <SalesClient
      sales={(raw ?? []) as unknown as SaleRow[]}
      generatedAtText={new Date().toISOString()}
    />
  );
}
