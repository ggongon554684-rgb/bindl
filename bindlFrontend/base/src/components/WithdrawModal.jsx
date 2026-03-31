import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function ModalContent({ wallet, balance, onClose, onSuccess }) {
  const [step, setStep] = useState("form");
  const [channel, setChannel] = useState("gcash");
  const [amount, setAmount] = useState("");
  const [handle, setHandle] = useState("");
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed < 1) {
      setRate(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/withdrawals/rate?amount_usdc=${parsed}`,
        );
        const data = await res.json();
        setRate(data);
      } catch {
        setRate(null);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [amount]);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/withdrawals/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amount_usdc: parseFloat(amount),
          channel,
          recipient_handle: handle,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.detail?.message || data.detail || "Withdrawal failed",
        );
      setResult(data);
      setStep("done");
      onSuccess?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const parsedAmount = parseFloat(amount) || 0;
  const canSubmit =
    parsedAmount >= 1 && parsedAmount <= balance && handle.trim();

  return (
    /* Backdrop — portalled to document.body so fixed works correctly */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0,0,0,0.65)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#111318",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 440,
          padding: "1.5rem",
          position: "relative",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition text-xl leading-none"
        >
          ✕
        </button>

        {step === "form" && (
          <>
            <h2 className="text-lg font-bold text-white mb-1">
              Withdraw Earnings
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Available:{" "}
              <span className="font-semibold text-green-400">
                {balance.toFixed(2)} USDC
              </span>
            </p>

            {/* Channel selector */}
            <div className="flex gap-2 mb-4">
              {["gcash", "paypal"].map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition ${
                    channel === c
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {c === "gcash" ? "💙 GCash" : "🅿️ PayPal"}
                </button>
              ))}
            </div>

            {/* Amount */}
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Amount (USDC)
            </label>
            <div className="relative mb-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                $
              </span>
              <input
                type="number"
                min="1"
                max={balance}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50"
                className="w-full pl-7 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setAmount(balance.toFixed(2))}
              className="text-xs text-blue-400 hover:underline mb-4 block"
            >
              Use max ({balance.toFixed(2)} USDC)
            </button>

            {/* Recipient */}
            <label className="block text-xs font-medium text-gray-400 mb-1">
              {channel === "gcash" ? "GCash Number" : "PayPal Email"}
            </label>
            <input
              type={channel === "gcash" ? "tel" : "email"}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={
                channel === "gcash" ? "09XXXXXXXXX" : "you@email.com"
              }
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            {/* Rate preview */}
            {rate && parsedAmount >= 1 && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mb-4 text-sm space-y-1">
                <div className="flex justify-between text-gray-400">
                  <span>Exchange rate</span>
                  <span>1 USDC ≈ ₱{rate.usdc_to_php_rate?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Platform fee ({rate.fee_pct}%)</span>
                  <span>− {rate.fee_usdc?.toFixed(4)} USDC</span>
                </div>
                <div className="flex justify-between font-semibold text-green-400 border-t border-white/5 pt-1 mt-1">
                  <span>You receive</span>
                  <span>
                    ₱
                    {rate.estimated_php_payout?.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {rate.simulation_mode && (
                  <p className="text-xs text-yellow-500 mt-1">
                    ⚠️ Simulation mode — no real money moved
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition text-sm"
            >
              {loading
                ? "Processing…"
                : `Withdraw to ${channel === "gcash" ? "GCash" : "PayPal"}`}
            </button>
          </>
        )}

        {step === "done" && result && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-lg font-bold text-white mb-2">
              Withdrawal Submitted!
            </h2>
            <p className="text-gray-400 text-sm mb-4">{result.message}</p>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-left text-sm space-y-2 mb-5">
              {[
                {
                  label: "Amount",
                  value: `${result.withdrawal.amount_usdc} USDC`,
                },
                {
                  label: "PHP payout",
                  value: `₱${result.withdrawal.amount_php?.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
                  green: true,
                },
                { label: "Sent to", value: result.withdrawal.recipient_handle },
                {
                  label: "Remaining balance",
                  value: `${result.remaining_balance?.toFixed(2)} USDC`,
                },
              ].map(({ label, value, green }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span
                    className={`font-medium ${green ? "text-green-400" : "text-white"}`}
                  >
                    {value}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-white/5">
                <span className="text-gray-500">Reference</span>
                <span className="font-mono text-xs text-gray-500">
                  {result.withdrawal.external_id}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WithdrawModal({ wallet, balance, onClose, onSuccess }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <ModalContent
      wallet={wallet}
      balance={balance}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
    document.body,
  );
}
