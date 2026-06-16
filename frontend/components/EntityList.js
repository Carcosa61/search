import useSWR from "swr";
import Link from "next/link";

const fetcher = (url) => fetch(url).then((r) => r.json());

const PRIORITY_COLOUR = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-gray-400",
};

export default function EntityList() {
  const { data: entities } = useSWR("/api/entity", fetcher, { refreshInterval: 30000 });

  if (!entities) return <p className="text-gray-500 text-xs">Loading…</p>;
  if (entities.length === 0)
    return <p className="text-gray-500 text-xs">No entities yet.</p>;

  return (
    <ul className="space-y-1">
      {entities.map((e) => (
        <li key={e.id}>
          <Link
            href={`/entity/${e.id}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors group"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot(e.priority)}`} />
            <span className="text-sm text-gray-200 truncate group-hover:text-white">
              {e.name}
            </span>
            <span className="ml-auto text-xs text-gray-500 flex-shrink-0">{e.type}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function priorityDot(priority) {
  return { high: "bg-red-500", medium: "bg-amber-500", low: "bg-gray-500" }[priority] ?? "bg-gray-500";
}
