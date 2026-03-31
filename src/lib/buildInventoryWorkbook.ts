import ExcelJS from "exceljs";
import type { Product } from "@/types/database";
import type { BatchWithProduct } from "@/lib/inventoryInsights";

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function uniqueSheetTitle(displayCategory: string, used: Set<string>): string {
  let base = (displayCategory.trim() || "Uncategorized").replace(
    /[:\\/?*[\]]/g,
    "-"
  );
  if (!base) base = "Uncategorized";
  base = base.slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n})`;
    name = (base.slice(0, 31 - suffix.length) + suffix).slice(0, 31);
    n++;
  }
  used.add(name);
  return name;
}

export async function buildInventoryWorkbook(
  products: Product[],
  batches: BatchWithProduct[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Phoebe POS";
  wb.created = new Date();

  const moneyFmt = "#,##0.00";
  const pctFmt = "0.00%";

  const byCategory = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.category?.trim() || "Uncategorized";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }

  const sortedKeys = [...byCategory.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  const usedTitles = new Set<string>();
  const planned = sortedKeys.map((cat) => ({
    displayCategory: cat,
    sheetTitle: uniqueSheetTitle(cat, usedTitles),
    items: [...byCategory.get(cat)!].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    ),
  }));

  const allProducts = [...products].sort((a, b) => {
    const ca = (a.category ?? "Uncategorized").localeCompare(b.category ?? "Uncategorized", undefined, {
      sensitivity: "base",
    });
    return ca || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const catalog = wb.addWorksheet("Catalog");
  catalog.addRow([
    "Product",
    "Category",
    "Unit Price",
    "On-hand Stock",
    "Return Stock",
    "Total Sellable",
    "Min Level",
    "Gap to Min",
    "Stock Status",
    "Stock Value",
    "Price Band",
  ]);
  catalog.getRow(1).font = { bold: true };
  catalog.autoFilter = { from: "A1", to: "K1" };
  catalog.views = [{ state: "frozen", ySplit: 1 }];

  let cr = 2;
  for (const p of allProducts) {
    const returnQty = p.return_stock_quantity ?? 0;
    catalog.getCell(`A${cr}`).value = p.name;
    catalog.getCell(`B${cr}`).value = p.category?.trim() || "Uncategorized";
    catalog.getCell(`C${cr}`).value = Number(p.price);
    catalog.getCell(`C${cr}`).numFmt = moneyFmt;
    catalog.getCell(`D${cr}`).value = p.stock_quantity;
    catalog.getCell(`E${cr}`).value = returnQty;
    catalog.getCell(`F${cr}`).value = { formula: `D${cr}+E${cr}` };
    catalog.getCell(`G${cr}`).value = p.min_stock_level ?? 0;
    catalog.getCell(`H${cr}`).value = { formula: `G${cr}-F${cr}` };
    catalog.getCell(`I${cr}`).value = { formula: `IF(F${cr}<=G${cr},"Low stock","OK")` };
    catalog.getCell(`J${cr}`).value = { formula: `C${cr}*F${cr}` };
    catalog.getCell(`J${cr}`).numFmt = moneyFmt;
    catalog.getCell(`K${cr}`).value = {
      formula: `IF(C${cr}<100,"Under 100",IF(C${cr}<500,"100-499",IF(C${cr}<1000,"500-999","1000+")))`,
    };
    cr++;
  }
  const catalogLastData = Math.max(2, cr - 1);
  catalog.getCell(`A${cr}`).value = "Totals";
  catalog.getCell(`A${cr}`).font = { bold: true };
  catalog.getCell(`D${cr}`).value = { formula: `SUM(D2:D${catalogLastData})` };
  catalog.getCell(`E${cr}`).value = { formula: `SUM(E2:E${catalogLastData})` };
  catalog.getCell(`F${cr}`).value = { formula: `SUM(F2:F${catalogLastData})` };
  catalog.getCell(`H${cr}`).value = { formula: `SUM(H2:H${catalogLastData})` };
  catalog.getCell(`J${cr}`).value = { formula: `SUM(J2:J${catalogLastData})` };
  catalog.getCell(`J${cr}`).numFmt = moneyFmt;
  catalog.columns = [
    { width: 34 },
    { width: 20 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 10 },
    { width: 11 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
  ];

  const categorySummary = wb.addWorksheet("Category summary");
  categorySummary.addRow([
    "Category",
    "SKUs",
    "On-hand",
    "Return Stock",
    "Total Sellable",
    "Low-stock SKUs",
    "Stock Value",
    "Avg Price",
    "Low-stock %",
  ]);
  categorySummary.getRow(1).font = { bold: true };
  categorySummary.autoFilter = { from: "A1", to: "I1" };
  categorySummary.views = [{ state: "frozen", ySplit: 1 }];

  let sr = 2;
  for (const p of planned) {
    categorySummary.getCell(`A${sr}`).value = p.displayCategory;
    categorySummary.getCell(`B${sr}`).value = {
      formula: `COUNTIF(${quoteSheet("Catalog")}!B:B,A${sr})`,
    };
    categorySummary.getCell(`C${sr}`).value = {
      formula: `SUMIFS(${quoteSheet("Catalog")}!D:D,${quoteSheet("Catalog")}!B:B,A${sr})`,
    };
    categorySummary.getCell(`D${sr}`).value = {
      formula: `SUMIFS(${quoteSheet("Catalog")}!E:E,${quoteSheet("Catalog")}!B:B,A${sr})`,
    };
    categorySummary.getCell(`E${sr}`).value = {
      formula: `SUMIFS(${quoteSheet("Catalog")}!F:F,${quoteSheet("Catalog")}!B:B,A${sr})`,
    };
    categorySummary.getCell(`F${sr}`).value = {
      formula: `COUNTIFS(${quoteSheet("Catalog")}!B:B,A${sr},${quoteSheet("Catalog")}!I:I,"Low stock")`,
    };
    categorySummary.getCell(`G${sr}`).value = {
      formula: `SUMIFS(${quoteSheet("Catalog")}!J:J,${quoteSheet("Catalog")}!B:B,A${sr})`,
    };
    categorySummary.getCell(`G${sr}`).numFmt = moneyFmt;
    categorySummary.getCell(`H${sr}`).value = {
      formula: `IFERROR(AVERAGEIFS(${quoteSheet("Catalog")}!C:C,${quoteSheet("Catalog")}!B:B,A${sr}),0)`,
    };
    categorySummary.getCell(`H${sr}`).numFmt = moneyFmt;
    categorySummary.getCell(`I${sr}`).value = { formula: `IFERROR(F${sr}/B${sr},0)` };
    categorySummary.getCell(`I${sr}`).numFmt = pctFmt;
    sr++;
  }
  if (sr > 2) {
    categorySummary.getCell(`A${sr}`).value = "All categories";
    categorySummary.getCell(`A${sr}`).font = { bold: true };
    categorySummary.getCell(`B${sr}`).value = { formula: `SUM(B2:B${sr - 1})` };
    categorySummary.getCell(`C${sr}`).value = { formula: `SUM(C2:C${sr - 1})` };
    categorySummary.getCell(`D${sr}`).value = { formula: `SUM(D2:D${sr - 1})` };
    categorySummary.getCell(`E${sr}`).value = { formula: `SUM(E2:E${sr - 1})` };
    categorySummary.getCell(`F${sr}`).value = { formula: `SUM(F2:F${sr - 1})` };
    categorySummary.getCell(`G${sr}`).value = { formula: `SUM(G2:G${sr - 1})` };
    categorySummary.getCell(`G${sr}`).numFmt = moneyFmt;
    categorySummary.getCell(`H${sr}`).value = {
      formula: `IFERROR(SUMPRODUCT(B2:B${sr - 1},H2:H${sr - 1})/B${sr},0)`,
    };
    categorySummary.getCell(`H${sr}`).numFmt = moneyFmt;
    categorySummary.getCell(`I${sr}`).value = { formula: `IFERROR(F${sr}/B${sr},0)` };
    categorySummary.getCell(`I${sr}`).numFmt = pctFmt;
  }
  categorySummary.columns = [
    { width: 24 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 11 },
  ];

  const priceBands = wb.addWorksheet("Price ranges");
  priceBands.addRow(["Price Band", "Min Price", "Max Price", "SKUs", "Sellable Units", "Stock Value"]);
  priceBands.getRow(1).font = { bold: true };
  const bands: Array<{ label: string; min: number; max: number | null }> = [
    { label: "Under 100", min: 0, max: 99.99 },
    { label: "100-499", min: 100, max: 499.99 },
    { label: "500-999", min: 500, max: 999.99 },
    { label: "1000+", min: 1000, max: null },
  ];
  let pr = 2;
  for (const band of bands) {
    priceBands.getCell(`A${pr}`).value = band.label;
    priceBands.getCell(`B${pr}`).value = band.min;
    priceBands.getCell(`B${pr}`).numFmt = moneyFmt;
    if (band.max == null) {
      priceBands.getCell(`C${pr}`).value = "and above";
      priceBands.getCell(`D${pr}`).value = {
        formula: `COUNTIFS(${quoteSheet("Catalog")}!C:C,">="&B${pr})`,
      };
      priceBands.getCell(`E${pr}`).value = {
        formula: `SUMIFS(${quoteSheet("Catalog")}!F:F,${quoteSheet("Catalog")}!C:C,">="&B${pr})`,
      };
      priceBands.getCell(`F${pr}`).value = {
        formula: `SUMIFS(${quoteSheet("Catalog")}!J:J,${quoteSheet("Catalog")}!C:C,">="&B${pr})`,
      };
    } else {
      priceBands.getCell(`C${pr}`).value = band.max;
      priceBands.getCell(`C${pr}`).numFmt = moneyFmt;
      priceBands.getCell(`D${pr}`).value = {
        formula: `COUNTIFS(${quoteSheet("Catalog")}!C:C,">="&B${pr},${quoteSheet("Catalog")}!C:C,"<="&C${pr})`,
      };
      priceBands.getCell(`E${pr}`).value = {
        formula: `SUMIFS(${quoteSheet("Catalog")}!F:F,${quoteSheet("Catalog")}!C:C,">="&B${pr},${quoteSheet("Catalog")}!C:C,"<="&C${pr})`,
      };
      priceBands.getCell(`F${pr}`).value = {
        formula: `SUMIFS(${quoteSheet("Catalog")}!J:J,${quoteSheet("Catalog")}!C:C,">="&B${pr},${quoteSheet("Catalog")}!C:C,"<="&C${pr})`,
      };
    }
    priceBands.getCell(`F${pr}`).numFmt = moneyFmt;
    pr++;
  }
  priceBands.getCell(`A${pr}`).value = "All";
  priceBands.getCell(`A${pr}`).font = { bold: true };
  priceBands.getCell(`D${pr}`).value = { formula: `SUM(D2:D${pr - 1})` };
  priceBands.getCell(`E${pr}`).value = { formula: `SUM(E2:E${pr - 1})` };
  priceBands.getCell(`F${pr}`).value = { formula: `SUM(F2:F${pr - 1})` };
  priceBands.getCell(`F${pr}`).numFmt = moneyFmt;
  priceBands.columns = [
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
  ];

  for (const p of planned) {
    const ws = wb.addWorksheet(p.sheetTitle);
    ws.addRow([
      "Product",
      "Category",
      "Unit price",
      "On-hand",
      "Return stock",
      "Total sellable",
      "Min level",
      "Gap to min",
      "Status",
      "Line value",
    ]);
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: "A1", to: "J1" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    let r = 2;
    for (const prod of p.items) {
      const returnQty = prod.return_stock_quantity ?? 0;
      ws.getCell(`A${r}`).value = prod.name;
      ws.getCell(`B${r}`).value = p.displayCategory;
      ws.getCell(`C${r}`).value = Number(prod.price);
      ws.getCell(`C${r}`).numFmt = moneyFmt;
      ws.getCell(`D${r}`).value = prod.stock_quantity;
      ws.getCell(`E${r}`).value = returnQty;
      ws.getCell(`F${r}`).value = { formula: `D${r}+E${r}` };
      ws.getCell(`G${r}`).value = prod.min_stock_level ?? 0;
      ws.getCell(`H${r}`).value = { formula: `G${r}-F${r}` };
      ws.getCell(`I${r}`).value = {
        formula: `IF(F${r}<=G${r},"Low stock","OK")`,
      };
      ws.getCell(`J${r}`).value = { formula: `C${r}*F${r}` };
      ws.getCell(`J${r}`).numFmt = moneyFmt;
      r++;
    }

    if (p.items.length > 0) {
      const firstData = 2;
      const lastData = r - 1;
      ws.getCell(`A${r}`).value = "Totals";
      ws.getCell(`A${r}`).font = { bold: true };
      ws.getCell(`D${r}`).value = {
        formula: `SUM(D${firstData}:D${lastData})`,
      };
      ws.getCell(`E${r}`).value = {
        formula: `SUM(E${firstData}:E${lastData})`,
      };
      ws.getCell(`F${r}`).value = {
        formula: `SUM(F${firstData}:F${lastData})`,
      };
      ws.getCell(`H${r}`).value = {
        formula: `SUM(H${firstData}:H${lastData})`,
      };
      ws.getCell(`J${r}`).value = {
        formula: `SUM(J${firstData}:J${lastData})`,
      };
      ws.getCell(`J${r}`).numFmt = moneyFmt;
    }

    ws.columns = [
      { width: 34 },
      { width: 20 },
      { width: 12 },
      { width: 11 },
      { width: 12 },
      { width: 13 },
      { width: 12 },
      { width: 11 },
      { width: 14 },
      { width: 14 },
    ];
  }

  const dash = wb.addWorksheet("Dashboard");
  dash.getCell("A1").value = "Inventory Dashboard";
  dash.getCell("A1").font = { bold: true, size: 16 };
  dash.getCell("A2").value = "Generated at";
  dash.getCell("B2").value = new Date();
  dash.getCell("B2").numFmt = "yyyy-mm-dd hh:mm";
  dash.getCell("A4").value = "Metric";
  dash.getCell("B4").value = "Value";
  dash.getCell("C4").value = "Notes";
  dash.getRow(4).font = { bold: true };
  const kpis = [
    ["Total SKUs", { formula: `COUNTA(${quoteSheet("Catalog")}!A2:A${catalogLastData})` }, "All products"],
    ["Total categories", { formula: `COUNTA(${quoteSheet("Category summary")}!A2:A${Math.max(2, sr - 1)})` }, "Distinct categories"],
    ["On-hand units", { formula: `SUM(${quoteSheet("Catalog")}!D2:D${catalogLastData})` }, "Regular stock only"],
    ["Return units", { formula: `SUM(${quoteSheet("Catalog")}!E2:E${catalogLastData})` }, "Sellable returns"],
    ["Total sellable units", { formula: `SUM(${quoteSheet("Catalog")}!F2:F${catalogLastData})` }, "On-hand + returns"],
    ["Low-stock SKUs", { formula: `COUNTIF(${quoteSheet("Catalog")}!I2:I${catalogLastData},"Low stock")` }, "Needs restock"],
    ["Total stock value", { formula: `SUM(${quoteSheet("Catalog")}!J2:J${catalogLastData})` }, "Price x total sellable"],
    ["Average item price", { formula: `IFERROR(AVERAGE(${quoteSheet("Catalog")}!C2:C${catalogLastData}),0)` }, "Across SKUs"],
  ] as const;
  let kr = 5;
  for (const [label, formulaVal, note] of kpis) {
    dash.getCell(`A${kr}`).value = label;
    dash.getCell(`B${kr}`).value = formulaVal;
    dash.getCell(`C${kr}`).value = note;
    kr++;
  }
  dash.getCell("B11").numFmt = moneyFmt;
  dash.getCell("B12").numFmt = moneyFmt;

  const catStart = 14;
  dash.getCell(`A${catStart}`).value = "Category breakdown";
  dash.getCell(`A${catStart}`).font = { bold: true };
  dash.getCell(`A${catStart + 1}`).value = "Category";
  dash.getCell(`B${catStart + 1}`).value = "SKUs";
  dash.getCell(`C${catStart + 1}`).value = "Sellable Units";
  dash.getCell(`D${catStart + 1}`).value = "Low-stock SKUs";
  dash.getCell(`E${catStart + 1}`).value = "Stock Value";
  dash.getRow(catStart + 1).font = { bold: true };
  let dr = catStart + 2;
  for (let i = 2; i <= Math.max(2, sr - 1); i++) {
    dash.getCell(`A${dr}`).value = { formula: `${quoteSheet("Category summary")}!A${i}` };
    dash.getCell(`B${dr}`).value = { formula: `${quoteSheet("Category summary")}!B${i}` };
    dash.getCell(`C${dr}`).value = { formula: `${quoteSheet("Category summary")}!E${i}` };
    dash.getCell(`D${dr}`).value = { formula: `${quoteSheet("Category summary")}!F${i}` };
    dash.getCell(`E${dr}`).value = { formula: `${quoteSheet("Category summary")}!G${i}` };
    dash.getCell(`E${dr}`).numFmt = moneyFmt;
    dr++;
  }
  dash.columns = [{ width: 24 }, { width: 16 }, { width: 20 }, { width: 18 }, { width: 16 }];

  const exp = wb.addWorksheet("Batch expiry");
  exp.addRow([
    "Product",
    "Category",
    "Remaining",
    "Expiration",
    "Days to expiry",
    "Status",
  ]);
  exp.getRow(1).font = { bold: true };
  exp.autoFilter = { from: "A1", to: "F1" };
  exp.views = [{ state: "frozen", ySplit: 1 }];

  const batchRows = [...batches]
    .filter((b) => (b.remaining_quantity ?? 0) > 0 && b.expiration_date)
    .sort((a, b) => {
      const da = (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "");
      return da;
    });

  let er = 2;
  for (const b of batchRows) {
    exp.getCell(`A${er}`).value = b.products?.name ?? "—";
    exp.getCell(`B${er}`).value = b.products?.category ?? "—";
    exp.getCell(`C${er}`).value = b.remaining_quantity;
    const d = String(b.expiration_date).slice(0, 10);
    exp.getCell(`D${er}`).value = new Date(d + "T12:00:00");
    exp.getCell(`D${er}`).numFmt = "yyyy-mm-dd";
    exp.getCell(`E${er}`).value = { formula: `D${er}-TODAY()` };
    exp.getCell(`F${er}`).value = {
      formula: `IF(E${er}<0,"Expired",IF(E${er}<=30,"Expiring soon","OK"))`,
    };
    er++;
  }
  exp.columns = [
    { width: 30 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
