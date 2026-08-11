import { HttpError } from "wasp/server";
import type {
  ExportCustomersCsv,
  ExportInvoicesCsv,
  ExportProductsCsv,
  ImportCustomersCsv,
  ImportProductsCsv,
} from "wasp/server/operations";
import { requireTenantId } from "../shared/tenant";
import { assertWithinPlanLimit } from "../shared/planLimits";

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  return [
    headers.join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function parseCsv(text: string): string[][] {
  const lines = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .filter((l) => l.trim().length);
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

export const exportCustomersCsv: ExportCustomersCsv<void, { csv: string }> =
  async (_args, context) => {
    if (!context.user) throw new HttpError(401);
    const tenantId = await requireTenantId(context.user, context.entities);
    const rows = await context.entities.Customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return {
      csv: toCsv(
        [
          "firstName",
          "lastName",
          "email",
          "phoneNumber",
          "companyName",
          "taxNo",
          "address",
          "status",
        ],
        rows.map((c) => [
          c.firstName,
          c.lastName,
          c.email,
          c.phoneNumber,
          c.companyName,
          c.taxNo,
          c.address,
          c.status,
        ]),
      ),
    };
  };

export const exportProductsCsv: ExportProductsCsv<void, { csv: string }> =
  async (_args, context) => {
    if (!context.user) throw new HttpError(401);
    const tenantId = await requireTenantId(context.user, context.entities);
    const rows = await context.entities.Product.findMany({
      where: { tenantId },
    });
    return {
      csv: toCsv(
        ["name", "price", "code", "description"],
        rows.map((p) => [p.name, p.price, p.code, p.description]),
      ),
    };
  };

export const exportInvoicesCsv: ExportInvoicesCsv<void, { csv: string }> =
  async (_args, context) => {
    if (!context.user) throw new HttpError(401);
    const tenantId = await requireTenantId(context.user, context.entities);
    const rows = await context.entities.Invoice.findMany({
      where: { tenantId },
      include: { customer: true },
    });
    return {
      csv: toCsv(
        [
          "invoiceFullNumber",
          "customer",
          "status",
          "grandTotal",
          "receivedAmount",
          "issueDate",
          "dueDate",
        ],
        rows.map((i) => [
          i.invoiceFullNumber,
          `${i.customer.firstName} ${i.customer.lastName || ""}`.trim(),
          i.status,
          i.grandTotal,
          i.receivedAmount,
          i.issueDate.toISOString().slice(0, 10),
          i.dueDate.toISOString().slice(0, 10),
        ]),
      ),
    };
  };

export const importCustomersCsv: ImportCustomersCsv<
  { csv: string },
  { imported: number; errors: string[] }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const table = parseCsv(args.csv || "");
  if (table.length < 2) throw new HttpError(400, "CSV has no data rows");
  const header = table[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const errors: string[] = [];
  let imported = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    try {
      await assertWithinPlanLimit(context.entities as any, tenantId, "customers");
      const firstName = row[idx("firstName")] || row[0];
      if (!firstName) throw new Error("firstName required");
      await context.entities.Customer.create({
        data: {
          tenantId,
          firstName,
          lastName: row[idx("lastName")] || null,
          email: row[idx("email")] || null,
          phoneNumber: row[idx("phoneNumber")] || null,
          companyName: row[idx("companyName")] || null,
          taxNo: row[idx("taxNo")] || null,
          address: row[idx("address")] || null,
          status: row[idx("status")] || "active",
        },
      });
      imported++;
    } catch (e: any) {
      errors.push(`Row ${r + 1}: ${e?.message || "failed"}`);
    }
  }
  return { imported, errors };
};

export const importProductsCsv: ImportProductsCsv<
  { csv: string },
  { imported: number; errors: string[] }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const table = parseCsv(args.csv || "");
  if (table.length < 2) throw new HttpError(400, "CSV has no data rows");
  const header = table[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const errors: string[] = [];
  let imported = 0;
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    try {
      await assertWithinPlanLimit(context.entities as any, tenantId, "products");
      const name = row[idx("name")] || row[0];
      const price = parseFloat(row[idx("price")] || row[1] || "0");
      if (!name) throw new Error("name required");
      await context.entities.Product.create({
        data: {
          tenantId,
          name,
          price: isNaN(price) ? 0 : price,
          code: row[idx("code")] || null,
          description: row[idx("description")] || null,
        },
      });
      imported++;
    } catch (e: any) {
      errors.push(`Row ${r + 1}: ${e?.message || "failed"}`);
    }
  }
  return { imported, errors };
};
