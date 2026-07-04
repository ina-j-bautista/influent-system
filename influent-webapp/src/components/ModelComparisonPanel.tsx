import { useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";

/**
 * ModelComparisonPanel
 * ---------------------
 * Static, read-only benchmark exhibit — NOT a live model switch.
 * Shows how XLM-RoBERTa and mBERT compared against VADER (INFLUENT's
 * production sentiment engine) on a 188-post human-labeled benchmark.
 *
 * Drop this under your existing AI summary component, e.g.:
 *   <AISummary ... />
 *   <ModelComparisonPanel />
 */

const BENCHMARK = {
  sampleSize: 188,
  totalCollected: 200,
  models: [
    { name: "VADER", sublabel: "current production model", accuracy: 55.3, isCurrent: true },
    { name: "XLM-RoBERTa", sublabel: "Twitter-tuned, multilingual", accuracy: 84.6, isCurrent: false },
    { name: "mBERT", sublabel: "product-review-tuned", accuracy: 36.7, isCurrent: false },
  ],
};

function AccuracyBar({ name, sublabel, accuracy, isCurrent, maxAccuracy }) {
  const widthPct = (accuracy / maxAccuracy) * 100;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 shrink-0 text-right">
        <div className={`text-sm font-medium ${isCurrent ? "text-slate-500" : "text-slate-800"}`}>
          {name}
        </div>
        <div className="text-[11px] text-slate-400">{sublabel}</div>
      </div>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCurrent ? "bg-slate-400" : "bg-emerald-500"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="w-14 shrink-0 text-sm font-semibold text-slate-700 tabular-nums">
        {accuracy.toFixed(1)}%
      </div>
    </div>
  );
}

export default function ModelComparisonPanel() {
  const [open, setOpen] = useState(false);
  const maxAccuracy = Math.max(...BENCHMARK.models.map((m) => m.accuracy));
  const best = BENCHMARK.models.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Model Comparison</span>
          <span className="text-xs text-slate-400">benchmark test</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-600 font-medium hidden sm:inline">
            {best.name} scored {(best.accuracy - BENCHMARK.models[0].accuracy).toFixed(1)}pts higher
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Accuracy against human-labeled sentiment on a {BENCHMARK.sampleSize}-post benchmark
            sample (of {BENCHMARK.totalCollected} collected). This is a one-time offline test —
            it does not change how posts are scored.
          </p>

          <div className="space-y-1">
            {BENCHMARK.models.map((m) => (
              <AccuracyBar key={m.name} {...m} maxAccuracy={maxAccuracy} />
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            mBERT's lower score reflects a domain mismatch: the checkpoint tested was tuned on
            product reviews, not social media, and rarely predicted "neutral." A social-media-tuned
            mBERT variant may perform differently.
          </p>
        </div>
      )}
    </div>
  );
}
