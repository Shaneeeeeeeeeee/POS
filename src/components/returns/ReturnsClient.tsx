"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteReturnAction,
  processReturnAction,
  type ReturnLineInput,
} from "@/app/actions/returns";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SearchField } from "@/components/ui/SearchField";

export type SaleItemLine = {
  id: string;
  product_id: string | null;
  quantity: number;
  price: string | number;
  products: { name: string } | null;
};

export type SaleOption = {
  id: string;
  receipt_number: string;
  created_at: string;
  sale_items: SaleItemLine[] | null;
};

type RecentReturn = {
  id: string;
  created_at: string;
  reason: string;
  receipt_number: string;
  totalQty: number;
};

export function ReturnsClient({
  sales,
  isAdmin,
  recentReturns,
}: {
  sales: SaleOption[];
  isAdmin: boolean;
  recentReturns: RecentReturn[];
}) {
  const router = useRouter();
  const [saleId, setSaleId] = useState(sales[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [action, setAction] = useState<ReturnLineInput["action"]>("restock");
  const [sealedConfirmed, setSealedConfirmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saleSearch, setSaleSearch] = useState("");

  const salesForSelect = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    const list = !q
      ? sales
      : sales.filter(
          (s) =>
            s.receipt_number.toLowerCase().includes(q) ||
            new Date(s.created_at).toLocaleDateString().toLowerCase().includes(q)
        );
    const cur = sales.find((s) => s.id === saleId);
    if (cur && !list.some((s) => s.id === saleId)) {
      return [cur, ...list];
    }
    return list;
  }, [sales, saleSearch, saleId]);

  const sale = useMemo(
    () => sales.find((s) => s.id === saleId) ?? null,
    [sales, saleId]
  );

  const items = sale?.sale_items ?? [];

  return (
    <div className="space-y-8 tablet:space-y-10">
      <PageHeader
        eyebrow="Post-sale"
        title="Returns"
        description="Only the 10 most recent eligible receipts are shown. Return/exchange is allowed only when item is sealed and unused."
      />

      {msg ? (
        <p className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.1)] bg-[var(--color-cream-deep)] px-4 py-3 text-sm text-[var(--foreground)]">
          {msg}
        </p>
      ) : null}

      <Panel title="Process return">
        <p className="mb-3 text-xs text-[var(--foreground-muted)]">
          Eligible receipts are limited to purchases made between 3 and 5 days ago.
        </p>
        <SearchField
          value={saleSearch}
          onChange={setSaleSearch}
          placeholder="Search receipt or date…"
          className="mb-4 max-w-md"
        />
        <label className="block text-sm font-semibold text-[var(--foreground)]">
          Sale receipt
          <select
            className="input-field mt-2"
            value={saleId}
            onChange={(e) => {
              setSaleId(e.target.value);
              setQtyByLine({});
              setSealedConfirmed(false);
            }}
          >
            {sales.length === 0 ? (
              <option value="">No eligible receipts (3–5 days only)</option>
            ) : salesForSelect.length === 0 ? (
              <option value="">No matches</option>
            ) : (
              salesForSelect.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.receipt_number} · {new Date(s.created_at).toLocaleDateString()}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="mt-5 block text-sm font-semibold text-[var(--foreground)]">
          Reason (optional)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="input-field mt-2 resize-y"
            placeholder="Customer complaint, damaged goods…"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-[var(--foreground)]">
            Transaction type
          </legend>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--foreground)]">
            {(["restock", "exchange"] as const).map((a) => (
              <label key={a} className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="action"
                  checked={action === a}
                  onChange={() => setAction(a)}
                  className="h-4 w-4 accent-[var(--color-primary-bright)]"
                />
                <span className="capitalize">{a}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] px-3 py-2.5 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={sealedConfirmed}
            onChange={(e) => setSealedConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary-bright)]"
          />
          <span>
            I confirm all returned/exchanged items are <b>100% sealed and unused</b>.
          </span>
        </label>

        <ul className="mt-6 space-y-3">
          {items.map((it) => {
            const max = it.quantity;
            const q = qtyByLine[it.id] ?? 0;
            return (
              <li
                key={it.id}
                className="rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--foreground)]">
                    {it.products?.name ?? "Product"}
                  </span>
                  <span className="text-[var(--foreground-muted)]">
                    Sold ×{it.quantity} @ {formatMoney(Number(it.price))}
                  </span>
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
                    Return qty
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={q}
                    onChange={(e) =>
                      setQtyByLine((prev) => ({
                        ...prev,
                        [it.id]: Math.min(max, Math.max(0, Number(e.target.value))),
                      }))
                    }
                    className="input-field w-28 py-2"
                  />
                </label>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          disabled={pending || !saleId || items.length === 0 || !sealedConfirmed}
          className="btn-primary mt-6 w-full"
          onClick={() => {
            if (!saleId) return;
            const lines: ReturnLineInput[] = items
              .map((it) => {
                const q = qtyByLine[it.id] ?? 0;
                if (!it.product_id || q <= 0) return null;
                return {
                  product_id: it.product_id,
                  quantity: q,
                  action,
                };
              })
              .filter(Boolean) as ReturnLineInput[];
            if (lines.length === 0) {
              setMsg("Enter a return quantity for at least one line.");
              return;
            }
            if (!sealedConfirmed) {
              setMsg("Confirm the sealed/unused condition before submitting.");
              return;
            }
            start(async () => {
              setMsg(null);
              const r = await processReturnAction(saleId, reason, lines, sealedConfirmed);
              setMsg(r.ok ? "Return recorded." : r.message);
              if (r.ok) {
                setQtyByLine({});
                setSealedConfirmed(false);
                router.refresh();
              }
            });
          }}
        >
          Submit return
        </button>
      </Panel>

      <Panel title="Recent return records">
        <ul className="space-y-2">
          {recentReturns.map((ret) => (
            <li
              key={ret.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--foreground)]">
                  {ret.receipt_number} · Qty {ret.totalQty}
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {new Date(ret.created_at).toLocaleString()}
                  {ret.reason ? ` · ${ret.reason}` : ""}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  disabled={pending}
                  className="btn-secondary !min-h-9 !px-3 !text-xs text-red-700"
                  onClick={() => {
                    const ok = window.confirm(
                      "Delete this return record? This will reverse the stock added by this return."
                    );
                    if (!ok) return;
                    start(async () => {
                      setMsg(null);
                      const res = await deleteReturnAction(ret.id);
                      setMsg(res.ok ? "Return record deleted." : res.message);
                      if (res.ok) router.refresh();
                    });
                  }}
                >
                  Delete return
                </button>
              ) : (
                <span className="text-xs text-[var(--foreground-muted)]">
                  Contact admin to delete
                </span>
              )}
            </li>
          ))}
          {recentReturns.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[rgba(15,68,21,0.2)] px-3 py-6 text-center text-sm text-[var(--foreground-muted)]">
              No return records yet.
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
