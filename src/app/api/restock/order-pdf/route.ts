import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getSessionProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const orderId = (url.searchParams.get("orderId") ?? "").trim();
  if (!orderId) return new NextResponse("Missing orderId", { status: 400 });

  const supabase = await createClient();
  const { data: order, error: e1 } = await supabase
    .from("orders")
    .select("id, created_at, suppliers(name, contact_info)")
    .eq("id", orderId)
    .single();
  if (e1 || !order) {
    return new NextResponse(e1?.message ?? "Order not found", { status: 404 });
  }

  const { data: items, error: e2 } = await supabase
    .from("order_items")
    .select("id, quantity, products(name)")
    .eq("order_id", orderId)
    .order("id", { ascending: true });
  if (e2) return new NextResponse(e2.message, { status: 500 });

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]); // A4 points
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = 800;
  const lineH = 16;
  const draw = (text: string, x: number, size = 10, bold = false) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.08, 0.08, 0.08),
    });
  };
  const nextLine = (n = 1) => {
    y -= lineH * n;
  };
  const ensureSpace = (needed = 80) => {
    if (y > margin + needed) return;
    page = pdf.addPage([595, 842]);
    y = 800;
  };

  const poNumber = `PO-${String(orderId).slice(0, 8).toUpperCase()}`;
  const createdAt = new Date((order as any).created_at).toLocaleDateString();
  const supplierName = (order as any)?.suppliers?.name ?? "Supplier";
  const supplierContact = (order as any)?.suppliers?.contact_info ?? "";

  draw("PHOEBE DRUGSTORE", margin, 11, true);
  nextLine();
  draw("Purchase Order", margin, 20, true);
  draw(poNumber, 430, 11, true);
  nextLine(1.2);
  draw(`Date: ${createdAt}`, 430, 10);
  nextLine(1.2);
  draw(`Supplier: ${supplierName}`, margin, 10, true);
  nextLine();
  if (supplierContact) {
    draw(`Contact: ${supplierContact}`, margin, 10);
    nextLine();
  }
  draw("Deliver to: Phoebe Drugstore", margin, 10);
  nextLine(1.5);

  // table header
  draw("#", margin, 10, true);
  draw("Item", margin + 32, 10, true);
  draw("Qty", 520, 10, true);
  nextLine();
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 545, y: y + 6 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  nextLine(0.6);

  let totalQty = 0;
  for (let i = 0; i < (items ?? []).length; i++) {
    const it: any = items?.[i];
    ensureSpace(120);
    const idx = String(i + 1);
    const name = String(it?.products?.name ?? "Product");
    const qty = Number(it?.quantity ?? 0);
    totalQty += qty;
    draw(idx, margin, 10);
    draw(name.slice(0, 72), margin + 32, 10);
    draw(String(qty), 520, 10);
    nextLine();
  }

  nextLine(0.5);
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 545, y: y + 6 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  nextLine(1.2);
  draw("Total Quantity", 430, 10, true);
  draw(String(totalQty), 520, 10, true);

  ensureSpace(120);
  y = Math.max(y - 70, 140);
  draw("Prepared by:", margin, 10);
  page.drawLine({
    start: { x: margin, y: y - 24 },
    end: { x: margin + 180, y: y - 24 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  draw("Received by supplier:", 320, 10);
  page.drawLine({
    start: { x: 320, y: y - 24 },
    end: { x: 545, y: y - 24 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });

  const bytes = await pdf.save();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${poNumber}.pdf"`,
    },
  });
}

