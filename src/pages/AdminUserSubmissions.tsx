import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { untypedFrom } from "@/integrations/supabase/untyped";

/**
 * Admin moderation tab for content suggested through the queer.guide
 * Chrome extension. Reads `ingestion_staging` rows where
 * `source_type='user_submission'` and lets admins approve / reject /
 * inspect the raw payload before it propagates through the existing
 * pipeline (normalize → dedupe → quality-score → review-gate → commit).
 *
 * Approve / reject only flips `disposition` — the existing pipeline
 * workers pick the row up on the next sweep. We intentionally do not
 * commit-to-canonical here; that is the pipeline's job.
 */
interface Row {
  id: string;
  created_at: string;
  source_type: string;
  source_name: string | null;
  entity_type: string | null;
  target_table: string;
  disposition: string;
  ai_validation_status: string;
  dedup_status: string;
  ai_confidence_score: number | null;
  raw_data: Record<string, unknown>;
  submitted_by_user_id: string | null;
  submission_url: string | null;
  submission_notes: string | null;
  submission_client: string | null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export default function AdminUserSubmissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const { toast } = useToast();

  async function fetchRows() {
    setLoading(true);
    let q = untypedFrom("ingestion_staging")
      .select(
        "id,created_at,source_type,source_name,entity_type,target_table,disposition,ai_validation_status,dedup_status,ai_confidence_score,raw_data,submitted_by_user_id,submission_url,submission_notes,submission_client",
      )
      .eq("source_type", "user_submission")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("disposition", filter);
    const { data, error } = await q;
    if (error) toast({ title: "Load failed", description: error.message });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void fetchRows();
  }, [filter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      JSON.stringify(r.raw_data).toLowerCase().includes(q) ||
      r.submission_url?.toLowerCase().includes(q) ||
      r.entity_type?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  async function setDisposition(id: string, disposition: "approved" | "rejected") {
    const { error } = await untypedFrom("ingestion_staging")
      .update({ disposition })
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message });
      return;
    }
    toast({ title: `Marked ${disposition}` });
    await fetchRows();
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Extension submissions</h1>
          <p className="text-sm text-muted-foreground">
            Suggestions sent in by users via the queer.guide Chrome extension. Approve to release them into the pipeline.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-sm"
          placeholder="Search title, URL, type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" onClick={fetchRows} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Submitted</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const title =
                  String((r.raw_data as { name?: string }).name ??
                  (r.raw_data as { title?: string }).title ??
                  "(unnamed)");
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`border-t cursor-pointer hover:bg-accent ${selected?.id === r.id ? "bg-accent" : ""}`}
                  >
                    <td className="p-2 capitalize">{r.entity_type ?? r.target_table}</td>
                    <td className="p-2 truncate max-w-[260px]">{title}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-2"><DispositionBadge value={r.disposition} /></td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No submissions.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-md p-4">
          {selected ? (
            <Detail row={selected} onApprove={() => setDisposition(selected.id, "approved")} onReject={() => setDisposition(selected.id, "rejected")} />
          ) : (
            <div className="text-sm text-muted-foreground p-6 text-center">Select a submission to inspect.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DispositionBadge({ value }: { value: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
  };
  return <Badge variant={variant[value] ?? "outline"}>{value}</Badge>;
}

function Detail({ row, onApprove, onReject }: { row: Row; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase text-muted-foreground">{row.entity_type ?? row.target_table}</div>
          <h2 className="text-lg font-semibold">
            {String((row.raw_data as { name?: string }).name ?? (row.raw_data as { title?: string }).title ?? "(unnamed)")}
          </h2>
        </div>
        <DispositionBadge value={row.disposition} />
      </div>

      {row.submission_url && (
        <div>
          <div className="text-xs text-muted-foreground">Source URL</div>
          <a className="text-sm break-all underline" href={row.submission_url} target="_blank" rel="noreferrer">
            {row.submission_url}
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="AI" value={row.ai_validation_status} />
        <Field label="Dedup" value={row.dedup_status} />
        <Field label="Confidence" value={row.ai_confidence_score == null ? "—" : row.ai_confidence_score.toFixed(2)} />
        <Field label="Client" value={row.submission_client ?? "—"} />
      </div>

      {row.submission_notes && (
        <div>
          <div className="text-xs text-muted-foreground">User notes</div>
          <p className="text-sm">{row.submission_notes}</p>
        </div>
      )}

      <div>
        <div className="text-xs text-muted-foreground mb-1">Raw payload</div>
        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64">
{JSON.stringify(row.raw_data, null, 2)}
        </pre>
      </div>

      {row.disposition === "pending" && (
        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={onApprove}>Approve</Button>
          <Button variant="destructive" onClick={onReject}>Reject</Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
