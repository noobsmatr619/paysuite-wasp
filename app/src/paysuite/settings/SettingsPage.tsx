import { useState } from "react";
import {
  useQuery,
  getTaxes,
  createTax,
  deleteTax,
  getNotes,
  createNote,
  deleteNote,
  getPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  getMyPlan,
  ensureDefaultPlans,
  updateMyProfile,
} from "wasp/client/operations";
import { useAuth } from "wasp/client/auth";
import { PageShell, money, DataTable } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";

export default function SettingsPage() {
  const { data: user } = useAuth();
  const { data: taxes, refetch: refetchTaxes } = useQuery(getTaxes);
  const { data: notes, refetch: refetchNotes } = useQuery(getNotes, {});
  const { data: methods, refetch: refetchMethods } =
    useQuery(getPaymentMethods);
  const { data: myPlan, refetch: refetchPlan } = useQuery(getMyPlan);

  const [taxName, setTaxName] = useState("");
  const [taxRate, setTaxRate] = useState("10");
  const [noteName, setNoteName] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState("invoice");
  const [methodName, setMethodName] = useState("");
  const [profile, setProfile] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    companyName: user?.companyName || "",
    phoneNumber: user?.phoneNumber || "",
    address: user?.address || "",
    taxNo: user?.taxNo || "",
  });

  return (
    <PageShell
      title="Settings"
      subtitle="Taxes, notes, payment methods, plan usage, and profile"
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="bg-card space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Profile / company</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="First name"
              value={profile.firstName}
              onChange={(e) =>
                setProfile({ ...profile, firstName: e.target.value })
              }
            />
            <Input
              placeholder="Last name"
              value={profile.lastName}
              onChange={(e) =>
                setProfile({ ...profile, lastName: e.target.value })
              }
            />
            <Input
              placeholder="Company"
              value={profile.companyName}
              onChange={(e) =>
                setProfile({ ...profile, companyName: e.target.value })
              }
            />
            <Input
              placeholder="Phone"
              value={profile.phoneNumber}
              onChange={(e) =>
                setProfile({ ...profile, phoneNumber: e.target.value })
              }
            />
          </div>
          <Textarea
            placeholder="Address"
            value={profile.address}
            onChange={(e) =>
              setProfile({ ...profile, address: e.target.value })
            }
          />
          <Button
            onClick={async () => {
              await updateMyProfile(profile);
            }}
          >
            Save profile
          </Button>
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">My plan</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await ensureDefaultPlans();
                refetchPlan();
              }}
            >
              Seed plans
            </Button>
          </div>
          {myPlan?.subscriber?.plan ? (
            <>
              <p className="text-sm">
                <span className="font-medium">{myPlan.subscriber.plan.name}</span>{" "}
                · {money(myPlan.subscriber.plan.price)} /{" "}
                {myPlan.subscriber.plan.frequency}
              </p>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>
                  Customers: {myPlan.usage.customers} /{" "}
                  {myPlan.limits?.customers}
                </li>
                <li>
                  Products: {myPlan.usage.products} / {myPlan.limits?.products}
                </li>
                <li>
                  Invoices: {myPlan.usage.invoices} / {myPlan.limits?.invoices}
                </li>
                <li>
                  Estimates: {myPlan.usage.estimates} /{" "}
                  {myPlan.limits?.estimates}
                </li>
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No plan attached yet. Click “Seed plans” then sign out/in or
              reopen the app so a free plan can be attached to your tenant.
            </p>
          )}
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Taxes</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Name"
              value={taxName}
              onChange={(e) => setTaxName(e.target.value)}
            />
            <Input
              placeholder="Rate %"
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
            <Button
              onClick={async () => {
                await createTax({
                  name: taxName,
                  rate: parseFloat(taxRate) || 0,
                });
                setTaxName("");
                refetchTaxes();
              }}
            >
              Add
            </Button>
          </div>
          <DataTable headers={["Name", "Rate", ""]} empty={!taxes?.length}>
            {(taxes || []).map((t: any) => (
              <tr key={t.id}>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2">{t.rate}%</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteTax({ id: t.id });
                      refetchTaxes();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Payment methods</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Name"
              value={methodName}
              onChange={(e) => setMethodName(e.target.value)}
            />
            <Button
              onClick={async () => {
                await createPaymentMethod({
                  name: methodName,
                  type: "other",
                });
                setMethodName("");
                refetchMethods();
              }}
            >
              Add
            </Button>
          </div>
          <DataTable headers={["Name", "Type", ""]} empty={!methods?.length}>
            {(methods || []).map((m: any) => (
              <tr key={m.id}>
                <td className="px-4 py-2">{m.name}</td>
                <td className="px-4 py-2">{m.type}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deletePaymentMethod({ id: m.id });
                      refetchMethods();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-4 lg:col-span-2">
          <h2 className="font-semibold">Notes templates</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            <select
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
            >
              <option value="invoice">Invoice</option>
              <option value="estimate">Estimate</option>
              <option value="payment">Payment</option>
            </select>
            <Input
              placeholder="Name"
              value={noteName}
              onChange={(e) => setNoteName(e.target.value)}
            />
            <Input
              className="sm:col-span-1"
              placeholder="Note text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <Button
              onClick={async () => {
                await createNote({
                  type: noteType,
                  name: noteName,
                  note: noteBody,
                });
                setNoteName("");
                setNoteBody("");
                refetchNotes();
              }}
            >
              Add note
            </Button>
          </div>
          <DataTable
            headers={["Type", "Name", "Note", ""]}
            empty={!notes?.length}
          >
            {(notes || []).map((n: any) => (
              <tr key={n.id}>
                <td className="px-4 py-2">{n.type}</td>
                <td className="px-4 py-2">{n.name}</td>
                <td className="px-4 py-2 max-w-md truncate">{n.note}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteNote({ id: n.id });
                      refetchNotes();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      </div>
    </PageShell>
  );
}
