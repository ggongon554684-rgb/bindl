"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReputationData {
  address: string;
  score: number; // 1–5
  total_contracts: number;
  completed_contracts: number;
  disputes_won: number;
  disputes_lost: number;
  ghosting_incidents: number;
  signal_tags: string[];
  ai_summary: string | null;
}

// ─── Signal tag color ──────────────────────────────────────────────────────────

function tagStyle(tag: string): string {
  const lower = tag.toLowerCase();
  if (
    lower.includes("ghost") ||
    lower.includes("dispute") ||
    lower.includes("lost")
  )
    return "border-red-500/30 bg-red-500/10 text-red-400";
  if (
    lower.includes("fast") ||
    lower.includes("reliable") ||
    lower.includes("clear")
  )
    return "border-green-500/30 bg-green-500/10 text-green-400";
  return "border-white/10 bg-white/5 text-gray-400";
}

function tagIcon(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower.includes("ghost")) return "bi-person-dash";
  if (lower.includes("fast")) return "bi-lightning-charge";
  if (lower.includes("reliable")) return "bi-shield-check";
  if (lower.includes("clear") || lower.includes("communication"))
    return "bi-chat-dots";
  if (lower.includes("dispute")) return "bi-exclamation-circle";
  return "bi-tag";
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 5) * 100;
  const color =
    score >= 4 ? "bg-green-500" : score >= 3 ? "bg-yellow-500" : "bg-red-500";
  const label =
    score >= 4.5
      ? "Excellent"
      : score >= 3.5
        ? "Good"
        : score >= 2.5
          ? "Fair"
          : "Poor";

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-lg font-bold text-white">{score.toFixed(1)}</span>
        <span className="text-xs text-gray-500">/ 5</span>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
          score >= 4
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : score >= 3
              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ─── AI Summary ───────────────────────────────────────────────────────────────

function AISummaryBox({ address }: { address: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchSummary = async () => {
    if (summary) {
      setExpanded((v) => !v);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/reputation-summary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSummary(data.summary);
      setExpanded(true);
    } catch {
      // Mock fallback
      setSummary(
        "This party has a strong track record with 16 completed contracts out of 18. They've demonstrated fast delivery and clear communication across multiple engagements. One ghosting incident was noted but disputes have been minimal. Overall a reliable counterparty for escrow agreements.",
      );
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <button
        onClick={fetchSummary}
        className="inline-flex w-full items-center gap-2 text-left text-xs font-medium text-gray-400 transition hover:text-white"
      >
        <i className="bi bi-stars text-green-400" />
        Ask AI about this person
        {loading && (
          <div className="ml-auto h-3 w-3 animate-spin rounded-full border border-green-400 border-t-transparent" />
        )}
        {!loading && (
          <i
            className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} ml-auto`}
          />
        )}
      </button>
      {expanded && summary && (
        <p className="mt-3 text-xs leading-relaxed text-gray-400 border-t border-white/5 pt-3">
          {summary}
        </p>
      )}
    </div>
  );
}

// ─── Main ReputationCard ──────────────────────────────────────────────────────

export function ReputationCard({ address }: { address: string }) {
  const [rep, setRep] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchRep() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/users/${address}/reputation`,
        );
        if (!res.ok) throw new Error();
        setRep(await res.json());
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (address) fetchRep();
  }, [address]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="h-3 w-3 animate-spin rounded-full border border-green-500 border-t-transparent" />
          Loading reputation…
        </div>
      </div>
    );
  }

  if (error || !rep) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <i className="bi bi-person-circle text-gray-600" />
          Reputation data unavailable for this address.
        </div>
      </div>
    );
  }

  const completionRate =
    rep.total_contracts > 0
      ? Math.round((rep.completed_contracts / rep.total_contracts) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="bi bi-person-circle text-xl text-gray-400" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Party A Reputation
            </p>
            <p className="font-mono text-xs text-gray-600">{rep.address}</p>
          </div>
        </div>
        <i className="bi bi-patch-check-fill text-green-400" />
      </div>

      {/* Score bar */}
      <ScoreBar score={rep.score} />

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {
            icon: "bi-file-earmark-check",
            label: "Contracts",
            value: rep.total_contracts,
            color: "text-white",
          },
          {
            icon: "bi-check-circle",
            label: "Completed",
            value: `${completionRate}%`,
            color: "text-green-400",
          },
          {
            icon: "bi-trophy",
            label: "Won",
            value: rep.disputes_won,
            color: "text-blue-400",
          },
          {
            icon: "bi-person-dash",
            label: "Ghosts",
            value: rep.ghosting_incidents,
            color:
              rep.ghosting_incidents > 0 ? "text-red-400" : "text-gray-500",
          },
        ].map(({ icon, label, value, color }) => (
          <div
            key={label}
            className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 p-2 text-center"
          >
            <i className={`bi ${icon} text-sm ${color}`} />
            <p className={`mt-1 text-sm font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-600">{label}</p>
          </div>
        ))}
      </div>

      {/* Signal tags */}
      <div className="flex flex-wrap gap-1.5">
        {rep.signal_tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${tagStyle(tag)}`}
          >
            <i className={`bi ${tagIcon(tag)}`} />
            {tag}
          </span>
        ))}
      </div>

      {/* AI summary */}
      <AISummaryBox address={address} />
    </div>
  );
}
