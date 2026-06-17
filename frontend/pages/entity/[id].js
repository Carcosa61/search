import { useRouter } from "next/router";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import InsightCard from "../../components/InsightCard";
import { useState } from "react";

const fetcher = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

const ENTITY_TYPES = ["company", "person", "music", "topic"];
const PRIORITIES = ["low", "medium", "high"];
const FREQUENCIES = ["hourly", "daily", "weekly"];
const ALL_SOURCES = ["rss", "reddit", "youtube", "web", "regulatory"];

export default function EntityDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [kwInput, setKwInput] = useState("");
  const [relInput, setRelInput] = useState("");

  const { data: entity, mutate: mutateEntity } = useSWR(id ? `/api/entity/${id}` : null, fetcher);
  const { data: insights } = useSWR(
    id ? `/api/dashboard/insights?entity_id=${id}&days=30&limit=50` : null,
    fetcher,
    { refreshInterval: 60000 }
  );
  const { data: alerts } = useSWR(id ? `/api/alerts?entity_id=${id}&limit=20` : null, fetcher);

  function startEdit() {
    setDraft({
      name: entity.name,
      type: entity.type,
      priority: entity.priority,
      update_frequency: entity.update_frequency,
      alert_threshold: entity.alert_threshold,
      keywords: [...(entity.keywords ?? [])],
      related_entities: [...(entity.related_entities ?? [])],
      allowed_sources: entity.allowed_sources ? [...entity.allowed_sources] : [...ALL_SOURCES],
      is_active: entity.is_active,
    });
    setKwInput("");
    setRelInput("");
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setSaveError(null);
  }

  function setDraftField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function addTag(field, input, setInput) {
    const val = input.trim();
    if (!val) return;
    setDraft((d) => ({ ...d, [field]: d[field].includes(val) ? d[field] : [...d[field], val] }));
    setInput("");
  }

  function removeTag(field, val) {
    setDraft((d) => ({ ...d, [field]: d[field].filter((x) => x !== val) }));
  }

  function toggleSource(src) {
    setDraft((d) => {
      const cur = d.allowed_sources;
      return { ...d, allowed_sources: cur.includes(src) ? cur.filter((s) => s !== src) : [...cur, src] };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/entity/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      await mutateEntity();
      mutate("/api/entity");
      setEditing(false);
      setDraft(null);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

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
        <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-800 text-indigo-200">{entity.type}</span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">{entity.priority}</span>
        <div className="ml-auto flex gap-2">
          {!editing ? (
            <>
              <button onClick={startEdit} className="px-3 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
                Edit
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-1 text-xs rounded bg-red-900 hover:bg-red-700 text-red-200 disabled:opacity-50 transition-colors">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={cancelEdit} disabled={saving} className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 transition-colors">
                Cancel
              </button>
            </>
          )}
        </div>
      </header>

      {saveError && (
        <div className="bg-red-950 border-b border-red-800 px-6 py-2 text-sm text-red-300">{saveError}</div>
      )}

      <div className="grid grid-cols-3 gap-6 p-6">
        {/* Left — meta / edit form */}
        <aside className="col-span-1 space-y-4">
          {editing ? (
            <EditForm
              draft={draft}
              setDraftField={setDraftField}
              kwInput={kwInput} setKwInput={setKwInput}
              relInput={relInput} setRelInput={setRelInput}
              addTag={addTag} removeTag={removeTag}
              toggleSource={toggleSource}
            />
          ) : (
            <ViewMeta entity={entity} alerts={alerts} />
          )}
          {!editing && <EntitySources entityId={id ? Number(id) : null} />}
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

// ── View mode ────────────────────────────────────────────────────────────────

function ViewMeta({ entity, alerts }) {
  return (
    <>
      <Section title="Details">
        <dl className="text-xs space-y-1">
          <Row label="Type" value={entity.type} />
          <Row label="Priority" value={entity.priority} />
          <Row label="Frequency" value={entity.update_frequency} />
          <Row label="Alert threshold" value={`${entity.alert_threshold}%`} />
          <Row label="Active" value={entity.is_active ? "Yes" : "No"} />
        </dl>
      </Section>

      <Section title="Keywords">
        <div className="flex flex-wrap gap-1.5">
          {(entity.keywords ?? []).map((kw) => (
            <span key={kw} className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300">{kw}</span>
          ))}
        </div>
      </Section>

      <Section title="Sources">
        <div className="flex flex-wrap gap-1.5">
          {(entity.allowed_sources ?? ALL_SOURCES).map((s) => (
            <span key={s} className="px-2 py-0.5 text-xs rounded bg-indigo-900 text-indigo-200">{s}</span>
          ))}
        </div>
      </Section>

      {(entity.related_entities ?? []).length > 0 && (
        <Section title="Related">
          <div className="flex flex-wrap gap-1.5">
            {entity.related_entities.map((r) => (
              <span key={r} className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300">{r}</span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Recent Alerts">
        {!Array.isArray(alerts) || alerts.length === 0 ? (
          <p className="text-sm text-gray-500">None</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="text-xs text-gray-300 border-l-2 border-amber-600 pl-2">
                {a.message}
                <br />
                <span className="text-gray-500">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-200 font-medium">{value}</dd>
    </div>
  );
}

// ── Edit mode ────────────────────────────────────────────────────────────────

function EditForm({ draft, setDraftField, kwInput, setKwInput, relInput, setRelInput, addTag, removeTag, toggleSource }) {
  return (
    <div className="space-y-4">
      {/* Name */}
      <Section title="Name">
        <input
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          value={draft.name}
          onChange={(e) => setDraftField("name", e.target.value)}
        />
      </Section>

      {/* Type / Priority / Frequency */}
      <Section title="Settings">
        <div className="space-y-2 text-xs">
          <label className="flex justify-between items-center">
            <span className="text-gray-400">Type</span>
            <select
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
              value={draft.type}
              onChange={(e) => setDraftField("type", e.target.value)}
            >
              {ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex justify-between items-center">
            <span className="text-gray-400">Priority</span>
            <select
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
              value={draft.priority}
              onChange={(e) => setDraftField("priority", e.target.value)}
            >
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex justify-between items-center">
            <span className="text-gray-400">Frequency</span>
            <select
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
              value={draft.update_frequency}
              onChange={(e) => setDraftField("update_frequency", e.target.value)}
            >
              {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex justify-between items-center">
            <span className="text-gray-400">Active</span>
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraftField("is_active", e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
          </label>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-400">Alert threshold</span>
              <span className="text-indigo-300 font-medium">{draft.alert_threshold}</span>
            </div>
            <input
              type="range" min="0" max="100"
              value={draft.alert_threshold}
              onChange={(e) => setDraftField("alert_threshold", Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>
      </Section>

      {/* Keywords */}
      <Section title="Keywords">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draft.keywords.map((kw) => (
            <span key={kw} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-200">
              {kw}
              <button onClick={() => removeTag("keywords", kw)} className="text-gray-400 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            placeholder="Add keyword…"
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag("keywords", kwInput, setKwInput))}
          />
          <button
            onClick={() => addTag("keywords", kwInput, setKwInput)}
            className="px-2 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white"
          >Add</button>
        </div>
      </Section>

      {/* Sources */}
      <Section title="Sources">
        <div className="space-y-1.5">
          {ALL_SOURCES.map((src) => (
            <label key={src} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.allowed_sources.includes(src)}
                onChange={() => toggleSource(src)}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm text-gray-300 capitalize">{src}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Related entities */}
      <Section title="Related Entities">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draft.related_entities.map((r) => (
            <span key={r} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-200">
              {r}
              <button onClick={() => removeTag("related_entities", r)} className="text-gray-400 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            placeholder="Add related entity…"
            value={relInput}
            onChange={(e) => setRelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag("related_entities", relInput, setRelInput))}
          />
          <button
            onClick={() => addTag("related_entities", relInput, setRelInput)}
            className="px-2 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white"
          >Add</button>
        </div>
      </Section>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</h3>
      {children}
    </div>
  );
}

// ── Entity-specific sources ───────────────────────────────────────────────────

const TYPE_BADGE = { rss: "bg-orange-900 text-orange-200", reddit: "bg-red-900 text-red-200", youtube: "bg-red-900 text-red-200", web: "bg-blue-900 text-blue-200", regulatory: "bg-yellow-900 text-yellow-200" };
const SOURCE_TYPES = ["rss", "reddit", "youtube", "web", "regulatory"];

function EntitySources({ entityId }) {
  const { data: sources, mutate: mutateSources } = useSWR(entityId ? `/api/source?entity_id=${entityId}` : null, fetcher);
  const [adding, setAdding] = useState(false);
  const [draft, setDraftState] = useState({ label: "", type: "rss", url: "", _subreddit: "", _channel_id: "", _service: "sec" });
  const [saving, setSaving] = useState(false);

  function setDraft(field, val) { setDraftState((d) => ({ ...d, [field]: val })); }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { label: draft.label, type: draft.type, is_global: false, entity_id: entityId, is_active: true };
      if (draft.type === "rss" || draft.type === "web") payload.url = draft.url;
      else if (draft.type === "reddit") payload.config = { subreddit: draft._subreddit };
      else if (draft.type === "youtube") payload.config = { channel_id: draft._channel_id };
      else if (draft.type === "regulatory") payload.config = { service: draft._service };
      await fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      mutateSources();
      setAdding(false);
      setDraftState({ label: "", type: "rss", url: "", _subreddit: "", _channel_id: "", _service: "sec" });
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    await fetch(`/api/source/${id}`, { method: "DELETE" });
    mutateSources();
  }

  if (!sources) return null;
  const entitySources = sources.filter((s) => !s.is_global);

  return (
    <Section title="Custom Sources">
      <div className="space-y-1.5 mb-2">
        {entitySources.length === 0 && !adding && (
          <p className="text-xs text-gray-500">No entity-specific sources. Global sources still apply.</p>
        )}
        {entitySources.map((s) => {
          const detail = s.url || (s.config ? Object.entries(s.config).map(([k, v]) => `${k}: ${v}`).join(", ") : "");
          return (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs text-gray-200">{s.label}</span>
                <span className={`ml-1.5 px-1 py-0.5 text-xs rounded ${TYPE_BADGE[s.type] || "bg-gray-700 text-gray-300"}`}>{s.type}</span>
                {detail && <span className="text-xs text-gray-500 ml-1 truncate"> — {detail}</span>}
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-400 text-xs shrink-0">Delete</button>
            </div>
          );
        })}
      </div>

      {adding ? (
        <form onSubmit={handleAdd} className="space-y-2 border-t border-gray-700 pt-2">
          <div className="flex gap-2">
            <input required className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="Label" value={draft.label} onChange={(e) => setDraft("label", e.target.value)} />
            <select className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" value={draft.type} onChange={(e) => setDraft("type", e.target.value)}>
              {SOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          {(draft.type === "rss" || draft.type === "web") && (
            <input required className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="URL" value={draft.url} onChange={(e) => setDraft("url", e.target.value)} />
          )}
          {draft.type === "reddit" && (
            <input required className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="Subreddit name" value={draft._subreddit} onChange={(e) => setDraft("_subreddit", e.target.value)} />
          )}
          {draft.type === "youtube" && (
            <input required className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="Channel ID (UCxxxxxxxx)" value={draft._channel_id} onChange={(e) => setDraft("_channel_id", e.target.value)} />
          )}
          {draft.type === "regulatory" && (
            <select className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" value={draft._service} onChange={(e) => setDraft("_service", e.target.value)}>
              <option value="sec">SEC EDGAR</option>
              <option value="companies_house">Companies House (UK)</option>
            </select>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-3 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white disabled:opacity-50">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-indigo-400 hover:text-indigo-300 mt-1">+ Add source</button>
      )}
    </Section>
  );
}
