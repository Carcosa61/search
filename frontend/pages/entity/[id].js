import { useRouter } from "next/router";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import InsightCard from "../../components/InsightCard";
import { useState } from "react";

const fetcher = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

export default function EntityDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [deleting, setDeleting] = useState(false);

  const { data: entity } = useSWR(id ? `/api/entity/${id}` : null, fetcher);
  const { data: insights } = useSWR(
    id ? `/api/dashboard/insights?entity_id=${id}&days=30&limit=50` : null,
    fetcher,
    { refreshInterval: 60000 }
  );
  const { data: alerts } = useSWR(id ? `/api/alerts?entity_id=${id}&limit=20` : null, fetcher);

  async function handleDelete() {
    if (!confirm(`Delete "${entity.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/entity/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        mutate("/api/entity");
        router.push("/");
      }
    } catch {
      setDeleting(false);
    }
  }

  if (!entity) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold text-white">{entity.name}</h1>
        <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-800 text-indigo-200">
          {entity.type}
        </span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
          {entity.priority}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto px-3 py-1 text-xs rounded bg-red-900 hover:bg-red-700 text-red-200 disabled:opacity-50 transition-colors"
        >
          {deleting ? "Deleting…" : "Delete entity"}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-6 p-6">
        {/* Left — meta */}
        <aside className="col-span-1 space-y-4">
          <Section title="Keywords">
            <div className="flex flex-wrap gap-2">
              {(entity.keywords ?? []).map((kw) => (
                <span key={kw} className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
                  {kw}
                </span>
              ))}
            </div>
          </Section>

          {entity.related_entities?.length > 0 && (
            <Section title="Related">
              <ul className="text-sm text-gray-300 space-y-1">
                {entity.related_entities.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </Section>
          )}

          <Section title="Alerts">
            {!Array.isArray(alerts) || alerts.length === 0 ? (
              <p className="text-sm text-gray-500">None</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="text-xs text-gray-300 border-l-2 border-amber-600 pl-2">
                    {a.message}
                    <br />
                    <span className="text-gray-500">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>

        {/* Right — insights feed */}
        <div className="col-span-2 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Recent Updates (30 days)
          </h2>
          {!Array.isArray(insights) || insights.length === 0 ? (
            <p className="text-gray-500 text-sm">No insights yet.</p>
          ) : (
            insights.map((ins) => <InsightCard key={ins.id} insight={ins} />)
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</h3>
      {children}
    </div>
  );
}
