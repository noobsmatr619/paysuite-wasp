import { useState } from "react";
import {
  useQuery,
  getRoles,
  createRole,
  deleteRole,
  getTenantUsers,
  inviteTenantUser,
  assignUserRole,
  getNotifications,
  markAllNotificationsRead,
} from "wasp/client/operations";
import { PageShell, DataTable } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { PERMISSIONS } from "../shared/permissions";

export default function UsersRolesPage() {
  const { data: roles, refetch: refetchRoles } = useQuery(getRoles);
  const { data: users, refetch: refetchUsers } = useQuery(getTenantUsers);
  const { data: notes, refetch: refetchNotes } = useQuery(getNotifications);
  const [roleName, setRoleName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <PageShell
      title="Users & roles"
      subtitle="RBAC, invitations, and in-app notifications"
    >
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="bg-card space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Create role</h2>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
          </div>
          <p className="text-muted-foreground text-xs">
            Default permissions: all ({PERMISSIONS.length} keys) via *
          </p>
          <Button
            onClick={async () => {
              setError(null);
              try {
                await createRole({
                  name: roleName,
                  permissions: ["*"],
                });
                setRoleName("");
                refetchRoles();
                setMessage("Role created");
              } catch (e: any) {
                setError(e?.message || "Failed");
              }
            }}
          >
            Add role
          </Button>
          <DataTable headers={["Role", "Users", ""]} empty={!roles?.length}>
            {(roles || []).map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2">{r.users?.length || 0}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteRole({ id: r.id });
                      refetchRoles();
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
          <h2 className="font-semibold">Invite user</h2>
          <Input
            placeholder="email@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={inviteRoleId}
            onChange={(e) => setInviteRoleId(e.target.value)}
          >
            <option value="">No role</option>
            {(roles || []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button
            onClick={async () => {
              setError(null);
              try {
                const inv = await inviteTenantUser({
                  email: inviteEmail,
                  roleId: inviteRoleId || null,
                });
                setMessage(inv.joinHint || "Invited");
                setInviteEmail("");
                refetchNotes();
              } catch (e: any) {
                setError(e?.message || "Invite failed");
              }
            }}
          >
            Send invite
          </Button>
        </section>
      </div>

      <h2 className="mb-3 font-semibold">Tenant users</h2>
      <DataTable
        headers={["Email", "Name", "Roles", "Assign role"]}
        empty={!users?.length}
      >
        {(users || []).map((u: any) => (
          <tr key={u.id}>
            <td className="px-4 py-2">{u.email}</td>
            <td className="px-4 py-2">
              {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
            </td>
            <td className="px-4 py-2">
              {(u.roles || []).map((ru: any) => ru.role?.name).join(", ") || "—"}
            </td>
            <td className="px-4 py-2">
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  await assignUserRole({ userId: u.id, roleId: e.target.value });
                  refetchUsers();
                }}
              >
                <option value="">Select…</option>
                {(roles || []).map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </DataTable>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-semibold">Notifications</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await markAllNotificationsRead();
            refetchNotes();
          }}
        >
          Mark all read
        </Button>
      </div>
      <DataTable
        headers={["Title", "Body", "Read", "When"]}
        empty={!notes?.length}
      >
        {(notes || []).map((n: any) => (
          <tr key={n.id}>
            <td className="px-4 py-2 font-medium">{n.title}</td>
            <td className="px-4 py-2">{n.body}</td>
            <td className="px-4 py-2">{n.isRead ? "yes" : "no"}</td>
            <td className="px-4 py-2">
              {new Date(n.createdAt).toLocaleString()}
            </td>
          </tr>
        ))}
      </DataTable>
    </PageShell>
  );
}
