import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import Link from "next/link";

const fetcher = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

const SOURCE_TYPES = ["rss", "reddit", "youtube", "web", "regulatory"];
const TYPE_LABELS = { rss: "RSS Feeds", reddit: "Reddit", youtube: "YouTube", web: "Web Scraper", regulatory: "Regulatory" };
const TYPE_HINTS = {
  rss: "Enter the full RSS/Atom feed URL",
  reddit: "Enter the subreddit name (e.g. worldnews)",
  youtube: "Enter the YouTube channel ID (e.g. UCxxxxxxxx)",
  web: "Enter the full URL to scrape",
  regulatory: "Choose SEC EDGAR or Companies House",
};

function emptyDraft(type) {
  return { label: "", type, url: "", _subreddit: "", _channel_id: "", _service: "sec", is_global: true, entity_id: "", is_active: true };
}

function buildPayload(d) {
  const p = { label: d.label, type: d.type, is_global: d.is_global, entity_id: d.is_global ? null : (d.entity_id ? Number(d.entity_id) : null), is_active: d.is_active };
  if (d.type === "rss" || d.type === "web") { p.url = d.url || null; }
  else if (d.type === "reddit") { p.config = { subreddit: d._subreddit }; }
  else if (d.type === "youtube") { p.config = { channel_id: d._channel_id }; }
  else if (d.type === "regulatory") { p.config = { service: d._service }; }
  return p;
}

function toDraft(source) {
  return {
    label: source.label, type: source.type, url: source.url || "",
    _subreddit: source.config?.subreddit || "", _channel_id: source.config?.channel_id || "",
    _service: source.config?.service || "sec", is_global: source.is_global,
    entity_id: source.entity_id ? String(source.entity_id) : "", is_active: source.is_active,
  };
}

export default function SourcesPage() {
  const { data: sources } = useSWR("/api/source", fetcher);
  const { data: entities } = useSWR("/api/entity?active_only=false", fetcher);
  const [form, setForm] = useState(null); // null | { mode:"add"|"edit", id?:number, draft:{} }
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!sources) return <div className="p-8 text-gray-400">Loading…</div>;

  const byType = SOURCE_TYPES.reduce((acc, t) => { acc[t] = sources.filter((s) => s.type === t); return acc; }, {});

  function setDraft(field, value) {
    setForm((f) => ({ ...f, draft: { ...f.draft, [field]: value } }));
  }

  function openAdd(type) {
    setForm({ mode: "add", draft: emptyDraft(type) });
    setError(null);
  }

  function openEdit(source) {
    setForm({ mode: "edit", id: source.id, draft: toDraft(source) });
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload(form.draft);
      if (form.mode === "add") {
        await fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        await fetch(`/api/source/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      globalMutate("/api/source");
      setForm(null);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this source?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/source/${id}`, { method: "DELETE" });
      globalMutate("/api/source");
    } finally { setDeleting(null); }
  }

  async function toggleActive(source) {
    await fetch(`/api/source/${source.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !source.is_active }) });
    globalMutate("/api/source");
  }

  return (
    <div className="min-h-screen">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold text-white">Sources</h1>
        <p className="text-sm text-gray-400 ml-2">Global sources apply to all entities. Entity-specific sources apply to one entity only.</p>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {error && <div className="bg-red-950 border border-red-800 rounded p-3 text-sm text-red-300">{error}</div>}

        {SOURCE_TYPES.map((type) => (
          <section key={type} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 className="font-semibold text-white">{TYPE_LABELS[type]}</h2>
              <button onClick={() => openAdd(type)} className="text-xs px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
                + Add
              </button>
            </div>

            {/* Inline add/edit form for this type */}
            {form?.draft.type === type && (
              <SourceForm
                draft={form.draft} setDraft={setDraft} mode={form.mode}
                entities={entities || []} saving={saving}
                hint={TYPE_HINTS[type]}
                onSave={handleSave} onCancel={() => setForm(null)}
              />
            )}

            {/* Source list */}
            {byType[type].length === 0 ? (
              <p className="text-gray-500 text-sm p-4">No {TYPE_LABELS[type].toLowerCase()} configured.</p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {byType[type].map((s) => {
                  const detail = s.url || (s.config ? Object.entries(s.config).map(([k, v]) => `${k}: ${v}`).join(", ") : "");
                  const entityName = entities?.find((e) => e.id === s.entity_id)?.name;
                  return (
                    <li key={s.id} className={`flex items-center gap-3 px-4 py-3 ${s.is_active ? "" : "opacity-40"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{s.label}</span>
                          {s.is_global ? (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-indigo-900 text-indigo-300">global</span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-amber-900 text-amber-200">
                              {entityName ? entityName : `entity #${s.entity_id}`}
                            </span>
                          )}
                        </div>
                        {detail && <p className="text-xs text-gray-500 truncate mt-0.5">{detail}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => toggleActive(s)} className={`text-xs px-2 py-0.5 rounded transition-colors ${s.is_active ? "bg-green-900 text-green-300 hover:bg-green-800" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                          {s.is_active ? "Active" : "Paused"}
                        </button>
                        <button onClick={() => openEdit(s)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                        <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50">
                          {deleting === s.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function SourceForm({ draft, setDraft, mode, entities, saving, hint, onSave, onCancel }) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Label *</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            value={draft.label} onChange={(e) => setDraft("label", e.target.value)}
            placeholder="Display name"
          />
        </div>
        <div>
          {(draft.type === "rss" || draft.type === "web") && (
            <>
              <label className="block text-xs text-gray-400 mb-1">URL *</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                value={draft.url} onChange={(e) => setDraft("url", e.target.value)}
                placeholder="https://…"
              />
            </>
          )}
          {draft.type === "reddit" && (
            <>
              <label className="block text-xs text-gray-400 mb-1">Subreddit *</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                value={draft._subreddit} onChange={(e) => setDraft("_subreddit", e.target.value)}
                placeholder="worldnews"
              />
            </>
          )}
          {draft.type === "youtube" && (
            <>
              <label className="block text-xs text-gray-400 mb-1">Channel ID *</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                value={draft._channel_id} onChange={(e) => setDraft("_channel_id", e.target.value)}
                placeholder="UCxxxxxxxxxxxxxxxx"
              />
            </>
          )}
          {draft.type === "regulatory" && (
            <>
              <label className="block text-xs text-gray-400 mb-1">Service *</label>
              <select
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                value={draft._service} onChange={(e) => setDraft("_service", e.target.value)}
              >
                <option value="sec">SEC EDGAR</option>
                <option value="companies_house">Companies House (UK)</option>
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="radio" name={`scope-${draft.type}`} checked={draft.is_global} onChange={() => { setDraft("is_global", true); setDraft("entity_id", ""); }} className="accent-indigo-500" />
          Global (all entities)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="radio" name={`scope-${draft.type}`} checked={!draft.is_global} onChange={() => setDraft("is_global", false)} className="accent-indigo-500" />
          Entity-specific
        </label>
        {!draft.is_global && (
          <select
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
            value={draft.entity_id} onChange={(e) => setDraft("entity_id", e.target.value)}
          >
            <option value="">Select entity…</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      <p className="text-xs text-gray-500">{hint}</p>

      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="px-4 py-1.5 text-sm rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : mode === "add" ? "Add Source" : "Save Changes"}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-4 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
