/** Print-ready HTML for invoices/estimates (browser Print → PDF). */

type MoneyDoc = {
  fullNumber: string;
  dateLabel: string;
  status: string;
  subTotal: number;
  discountAmount: number | null;
  grandTotal: number;
  note?: string | null;
  companyName: string;
  customerName: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  lines: { name: string; quantity: number; price: number }[];
  taxes: { name: string; rate: number; amount: number }[];
  extraRows?: { label: string; value: string }[];
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n || 0);
}

export function buildDocumentHtml(doc: MoneyDoc): string {
  const lines = doc.lines
    .map(
      (l) =>
        `<tr>
          <td>${escapeHtml(l.name)}</td>
          <td class="num">${l.quantity}</td>
          <td class="num">${money(l.price)}</td>
          <td class="num">${money(l.quantity * l.price)}</td>
        </tr>`,
    )
    .join("");

  const taxes = doc.taxes
    .map(
      (t) =>
        `<div class="row"><span>${escapeHtml(t.name)} (${t.rate}%)</span><span>${money(t.amount)}</span></div>`,
    )
    .join("");

  const extras = (doc.extraRows || [])
    .map(
      (r) =>
        `<div class="meta"><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.fullNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, system-ui, sans-serif; color: #0f172a; margin: 40px; }
    h1 { margin: 0 0 4px; font-size: 28px; }
    .muted { color: #64748b; font-size: 13px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 28px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ecfeff; color: #0f766e; font-size: 12px; text-transform: uppercase; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 8px; }
    td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 20px; max-width: 280px; margin-left: auto; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .grand { font-size: 18px; font-weight: 800; border-top: 2px solid #0f172a; margin-top: 8px; padding-top: 10px; }
    .note { margin-top: 28px; padding: 14px; background: #f8fafc; border-radius: 10px; font-size: 13px; }
    .meta { margin-top: 4px; font-size: 13px; }
    @media print {
      body { margin: 12mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="background:#0f766e;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
  <div class="header">
    <div>
      <h1>${escapeHtml(doc.companyName)}</h1>
      <div class="muted">PaySuite document</div>
      ${extras}
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:800">${escapeHtml(doc.fullNumber)}</div>
      <div class="muted">${escapeHtml(doc.dateLabel)}</div>
      <div style="margin-top:8px"><span class="badge">${escapeHtml(doc.status)}</span></div>
    </div>
  </div>
  <div>
    <div class="muted">Bill to</div>
    <div style="font-weight:700;font-size:16px">${escapeHtml(doc.customerName)}</div>
    ${doc.customerEmail ? `<div class="muted">${escapeHtml(doc.customerEmail)}</div>` : ""}
    ${doc.customerAddress ? `<div class="muted">${escapeHtml(doc.customerAddress)}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Price</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(doc.subTotal)}</span></div>
    <div class="row"><span>Discount</span><span>-${money(doc.discountAmount || 0)}</span></div>
    ${taxes}
    <div class="row grand"><span>Grand total</span><span>${money(doc.grandTotal)}</span></div>
  </div>
  ${
    doc.note
      ? `<div class="note"><strong>Note</strong><div>${escapeHtml(doc.note)}</div></div>`
      : ""
  }
</body>
</html>`;
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function customerDisplay(c?: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
} | null) {
  if (!c) return "Customer";
  return (
    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
    c.companyName ||
    "Customer"
  );
}
