import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

const IMPACT_COLOUR = {
  High: "text-red-400 bg-red-950 border-red-800",
  Medium: "text-amber-400 bg-amber-950 border-amber-800",
  Low: "text-green-400 bg-green-950 border-green-800",
  Unknown: "text-gray-400 bg-gray-800 border-gray-700",
};

export default function InsightCard({ insight }) {
  const impactClass = IMPACT_COLOUR[insight.impact] ?? IMPACT_COLOUR.Unknown;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-snug">{insight.title}</p>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border ${impactClass}`}>
          {insight.impact ?? "Unknown"}
        </span>
      </div>

      {insight.summary && (
        <p className="text-sm text-gray-400 leading-relaxed">{insight.summary}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
        {insight.event_type && (
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300">{insight.event_type}</span>
        )}
        <span>Score: {Math.round(insight.final_score)}</span>
        <span>{insight.source_count} source{insight.source_count !== 1 ? "s" : ""}</span>
        {insight.published_at && (
          <span>{formatDistanceToNow(new Date(insight.published_at), { addSuffix: true })}</span>
        )}
        <Link href={`/entity/${insight.entity_id}`} className="ml-auto text-indigo-400 hover:text-indigo-300">
          View entity →
        </Link>
      </div>

      {insight.source_urls?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {insight.source_urls.slice(0, 3).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 truncate max-w-xs"
            >
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
