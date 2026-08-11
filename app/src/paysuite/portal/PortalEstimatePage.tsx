import { useParams } from "react-router";
import { useQuery, getPortalEstimate } from "wasp/client/operations";
import { money, StatusBadge } from "../shared/ui";

export default function PortalEstimatePage() {
  const { token } = useParams();
  const { data: raw, isLoading, error } = useQuery(
    getPortalEstimate,
    { token: token || "" },
    { enabled: Boolean(token) } as any,
  );
  const data = raw as any;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-muted-foreground">
        Loading estimate…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-bold">Estimate not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-muted-foreground text-sm">{data.companyName}</p>
      <h1 className="text-2xl font-bold">Estimate {data.estimateFullNumber}</h1>
      <div className="mt-2 flex gap-2">
        <StatusBadge status={data.status} />
        <span className="text-muted-foreground text-sm">
          {new Date(data.date).toLocaleDateString()}
        </span>
      </div>

      <div className="bg-card mt-6 rounded-xl border p-4">
        <div className="text-muted-foreground text-xs uppercase">Bill to</div>
        <div className="font-medium">
          {[data.customer.firstName, data.customer.lastName]
            .filter(Boolean)
            .join(" ")}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2">{l.name}</td>
              <td className="py-2 text-right">{l.quantity}</td>
              <td className="py-2 text-right">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 text-right text-lg font-semibold">
        Total {money(data.grandTotal)}
      </div>
      <p className="text-muted-foreground mt-8 text-xs">
        Customer portal · PaySuite
      </p>
    </div>
  );
}
