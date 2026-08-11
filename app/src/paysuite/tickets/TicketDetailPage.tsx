import { useState } from "react";
import { useParams } from "react-router";
import {
  useQuery,
  getTicket,
  addTicketComment,
  updateTicketStatus,
  rateTicket,
} from "wasp/client/operations";
import { PageShell, StatusBadge } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Textarea } from "../../client/components/ui/textarea";

export default function TicketDetailPage() {
  const { id } = useParams();
  const { data: ticket, isLoading, refetch } = useQuery(getTicket, { id: id! });
  const [comment, setComment] = useState("");

  if (isLoading || !ticket) {
    return (
      <PageShell title="Ticket">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={ticket.subject}
      subtitle={`${ticket.department?.name} · ${ticket.priority?.name}`}
      actions={<StatusBadge status={ticket.status} />}
    >
      {ticket.body && (
        <div className="bg-card mb-6 rounded-xl border p-4 text-sm whitespace-pre-wrap">
          {ticket.body}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {["pending", "open", "solved", "rejected"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={ticket.status === s ? "default" : "outline"}
            onClick={async () => {
              await updateTicketStatus({ id: ticket.id, status: s });
              refetch();
            }}
          >
            {s}
          </Button>
        ))}
        {[1, 2, 3, 4, 5].map((r) => (
          <Button
            key={r}
            size="sm"
            variant={ticket.rating === r ? "default" : "ghost"}
            onClick={async () => {
              await rateTicket({ id: ticket.id, rating: r });
              refetch();
            }}
          >
            {r}★
          </Button>
        ))}
      </div>

      <h2 className="mb-3 font-semibold">Comments</h2>
      <ul className="mb-4 space-y-3">
        {(ticket.comments || []).map((c: any) => (
          <li key={c.id} className="bg-muted/40 rounded-lg p-3 text-sm">
            <div className="text-muted-foreground mb-1 text-xs">
              {c.user?.email || c.user?.username} ·{" "}
              {new Date(c.createdAt).toLocaleString()}
            </div>
            <div className="whitespace-pre-wrap">{c.comment}</div>
          </li>
        ))}
        {!ticket.comments?.length && (
          <li className="text-muted-foreground text-sm">No comments yet</li>
        )}
      </ul>

      <div className="max-w-xl space-y-2">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a comment…"
        />
        <Button
          disabled={!comment.trim()}
          onClick={async () => {
            await addTicketComment({ ticketId: ticket.id, comment });
            setComment("");
            refetch();
          }}
        >
          Add comment
        </Button>
      </div>
    </PageShell>
  );
}
