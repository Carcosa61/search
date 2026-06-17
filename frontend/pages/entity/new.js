import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const ENTITY_TYPES = ["company", "person", "music", "topic"];
const PRIORITIES = ["low", "medium", "high"];
const FREQUENCIES = ["hourly", "daily", "weekly"];

export default function NewEntity() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    type: "company",
    keywords: "",
    related_entities: "",
    priority: "medium",
    update_frequency: "daily",
    alert_threshold: 50,
    allowed_sources: "",
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      type: form.type,
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      related_entities: form.related_entities
        ? form.related_entities.split(",").map((r) => r.trim()).filter(Boolean)
        : null,
      priority: form.priority,
      update_frequency: form.update_frequency,
      alert_threshold: Number(form.alert_threshold),
      allowed_sources: form.allowed_sources
        ? form.allowed_sources.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    };

    try {
      const res = await fetch("/api/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      const entity = await res.json();
      router.push(`/entity/${entity.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold text-white">Add Entity</h1>
      </header>

      <form onSubmit={handleSubmit} className="max-w-xl mx-auto p-8 space-y-5">
        {error && (
          <div className="rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm p-3">
            {error}
          </div>
        )}

        <Field label="Name" required>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Tesla"
            className="input"
          />
        </Field>

        <Field label="Type" required>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input">
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Keywords" hint="Comma-separated" required>
          <input
            required
            value={form.keywords}
            onChange={(e) => set("keywords", e.target.value)}
            placeholder="e.g. Tesla, TSLA, Elon Musk"
            className="input"
          />
        </Field>

        <Field label="Related entities" hint="Comma-separated, optional">
          <input
            value={form.related_entities}
            onChange={(e) => set("related_entities", e.target.value)}
            placeholder="e.g. SpaceX, Rivian"
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="input">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field label="Update frequency">
            <select value={form.update_frequency} onChange={(e) => set("update_frequency", e.target.value)} className="input">
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>

        <Field label={`Alert threshold: ${form.alert_threshold}`} hint="Minimum relevance score (0–100) to trigger an alert">
          <input
            type="range"
            min={0}
            max={100}
            value={form.alert_threshold}
            onChange={(e) => set("alert_threshold", e.target.value)}
            className="w-full accent-indigo-500"
          />
        </Field>

        <Field label="Allowed sources" hint="Comma-separated source types to restrict, optional (rss, web, reddit, youtube, regulatory)">
          <input
            value={form.allowed_sources}
            onChange={(e) => set("allowed_sources", e.target.value)}
            placeholder="Leave blank to allow all sources"
            className="input"
          />
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Create entity"}
          </button>
          <Link href="/" className="px-5 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
            Cancel
          </Link>
        </div>
      </form>

      <style jsx global>{`
        .input {
          width: 100%;
          background: #111827;
          border: 1px solid #374151;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: #f9fafb;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: #6366f1;
        }
      `}</style>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-gray-300 font-medium">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}
