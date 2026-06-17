import useSWR, { mutate } from "swr";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import EntityList from "../components/EntityList";
import InsightCard from "../components/InsightCard";

const fetcher = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

export default function Dashboard() {
  const { data: summary, error } = useSWR("/api/dashboard", fetcher, { refreshInterval: 60000 });
  const [refreshState, setRefreshState] = useState("idle"); // idle | loading | done

  async function handleRefresh() {
    setRefreshState("loading");
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshState("done");
      // Poll the dashboard every 8s for 90s so new data appears automatically
      let polls = 0;
      const interval = setInterval(() => {
        mutate("/api/dashboard");
        if (++polls >= 11) {
          clearInterval(interval);
          setRefreshState("idle");
        }
      }, 8000);
    } catch {
      setRefreshState("idle");
    }
  }

  if (error) return <div className="p-8 text-red-400">Failed to load dashboard.</div>;
  if (!summary) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Intelligence Monitor
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshState === "loading"}
          className={`px-4 py-1.5 text-sm rounded transition-colors disabled:opacity-60 ${
            refreshState === "done"
              ? "bg-green-700 text-green-100"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {refreshState === "loading" ? "Queuing…" : refreshState === "done" ? "✓ Queued" : "Refresh now"}
        </button>
      </header>

      {/* Stats bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex gap-8 text-sm">
        <Stat label="Entities" value={summary.active_entities} />
        <Stat label="Insights today" value={summary.total_insights_today} />
        <Stat label="Unread alerts" value={summary.unread_alerts} highlight={summary.unread_alerts > 0} />
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — entity list */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Entities
            </h2>
            <Link href="/entity/new" className="text-xs text-indigo-400 hover:text-indigo-300">
              + Add
            </Link>
          </div>
          <EntityList />
        </aside>

        {/* Center — timeline */}
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
            Top Insights
          </h2>
          {(summary.top_insights ?? []).length === 0 && (
            <p className="text-gray-500 text-sm">
              No insights yet — add entities and run a refresh.
            </p>
          )}
          {(summary.top_insights ?? []).map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </main>

        {/* Right — alerts + sources */}
        <aside className="w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Recent Alerts
            </h2>
            <AlertsSidebar />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Data Sources
            </h2>
            <SourcesPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-400">{label}</span>
      <span className={`font-bold text-lg ${highlight ? "text-amber-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

function AlertsSidebar() {
  const { data: alerts } = useSWR("/api/alerts?limit=20", fetcher, { refreshInterval: 30000 });

  if (!alerts) return <p className="text-gray-500 text-sm">Loading…</p>;
  if (!Array.isArray(alerts) || alerts.length === 0) return <p className="text-gray-500 text-sm">No alerts.</p>;

  return (
    <ul className="space-y-3">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`rounded-lg p-3 text-sm border ${
            a.is_sent ? "border-gray-700 text-gray-400" : "border-amber-700 bg-amber-950 text-amber-200"
          }`}
        >
          <p>{a.message}</p>
          <p className="text-xs mt-1 text-gray-500">
            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SourcesPanel() {
  const { data: sources } = useSWR("/api/dashboard/sources", fetcher);
  const [expanded, setExpanded] = useState(null);

  if (!sources) return <p className="text-gray-500 text-sm">Loading…</p>;

  const toggle = (key) => setExpanded(expanded === key ? null : key);

  return (
    <div className="space-y-2 text-xs">
      {/* RSS */}
      <div>
        <button
          onClick={() => toggle("rss")}
          className="w-full flex items-center justify-between text-gray-300 hover:text-white py-1"
        >
          <span className="font-medium">RSS feeds <span className="text-gray-500">({sources.rss?.length})</span></span>
          <span>{expanded === "rss" ? "▲" : "▼"}</span>
        </button>
        {expanded === "rss" && (
          <ul className="mt-1 space-y-1 pl-2 border-l border-gray-700">
            {sources.rss?.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 truncate block">{f.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reddit */}
      <div>
        <button
          onClick={() => toggle("reddit")}
          className="w-full flex items-center justify-between text-gray-300 hover:text-white py-1"
        >
          <span className="font-medium">Reddit</span>
          <span>{expanded === "reddit" ? "▲" : "▼"}</span>
        </button>
        {expanded === "reddit" && (
          <div className="mt-1 pl-2 border-l border-gray-700 space-y-1 text-gray-400">
            <p>{sources.reddit?.description}</p>
            {Object.entries(sources.reddit?.subreddits_by_type ?? {}).map(([type, subs]) => (
              <div key={type}>
                <span className="text-gray-500 capitalize">{type}:</span>{" "}
                {subs.map((s) => (
                  <a key={s} href={`https://reddit.com/r/${s}`} target="_blank" rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 mr-1">r/{s}</a>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Regulatory */}
      <div>
        <button
          onClick={() => toggle("regulatory")}
          className="w-full flex items-center justify-between text-gray-300 hover:text-white py-1"
        >
          <span className="font-medium">Regulatory</span>
          <span>{expanded === "regulatory" ? "▲" : "▼"}</span>
        </button>
        {expanded === "regulatory" && (
          <ul className="mt-1 pl-2 border-l border-gray-700 space-y-1 text-gray-400">
            <li>{sources.regulatory?.sec_edgar}</li>
            <li>{sources.regulatory?.companies_house}</li>
          </ul>
        )}
      </div>

      {/* YouTube */}
      <div className="flex items-center justify-between text-gray-300 py-1">
        <span className="font-medium">YouTube</span>
        <span className="text-gray-500 text-xs">Channel RSS feeds</span>
      </div>

      {/* Web */}
      <div className="flex items-center justify-between text-gray-300 py-1">
        <span className="font-medium">Web scraper</span>
        <span className="text-gray-500 text-xs">Keyword search</span>
      </div>
    </div>
  );
}
