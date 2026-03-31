import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STATUS_STYLE = {
  completed: "border-green-500/30 bg-green-500/10 text-green-400",
  processing: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  pending: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
};

const CHANNEL_LABEL = {
  gcash: "💙 GCash",
  paypal: "🅿️ PayPal",
};

export default function WithdrawalHistory({ wallet, refreshTrigger = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) {
      // Keep existing data during wallet reconnection
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API}/withdrawals/${wallet}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [wallet, refreshTrigger]);

  if (loading && !data)
    return (
      <div className="animate-pulse bg-white/5 border border-white/10 rounded-xl h-16 mt-4" />
    );

  if (!data || !data.withdrawals?.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="bi bi-clock-history text-gray-400 text-sm" />
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Withdrawal History
          </p>
        </div>
        {data.total_withdrawn_usdc > 0 && (
          <span className="text-xs text-gray-500">
            Total:{" "}
            <span className="font-semibold text-white">
              {data.total_withdrawn_usdc.toFixed(2)} USDC
            </span>
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="flex flex-col divide-y divide-white/5">
        {data.withdrawals.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
          >
            <div>
              <p className="text-xs font-medium text-white">
                {CHANNEL_LABEL[w.channel] ?? w.channel} · {w.recipient_handle}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {new Date(w.created_at).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs font-semibold text-white">
                ₱
                {w.amount_php?.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  STATUS_STYLE[w.status] ??
                  "border-white/10 bg-white/5 text-gray-400"
                }`}
              >
                {w.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
