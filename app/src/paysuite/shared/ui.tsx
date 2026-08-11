import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { cn } from "../../client/utils";

export function money(n: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(n || 0);
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "border-border",
    success: "border-emerald-500/40",
    warning: "border-amber-500/40",
    danger: "border-rose-500/40",
  };
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-4 shadow-sm",
        tones[tone],
      )}
    >
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    due: "bg-rose-100 text-rose-800",
    partially_paid: "bg-amber-100 text-amber-800",
    pending: "bg-slate-100 text-slate-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    open: "bg-sky-100 text-sky-800",
    solved: "bg-emerald-100 text-emerald-800",
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        map[status] || "bg-slate-100 text-slate-700",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        No records yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="max-w-sm"
    />
  );
}

export function PrimaryLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Button asChild>
      <Link to={to}>{children}</Link>
    </Button>
  );
}

export function customerName(c?: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
} | null) {
  if (!c) return "—";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return name || c.companyName || "—";
}
