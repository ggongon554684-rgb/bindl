import { useEffect, useState } from "react";
import WithdrawButton from "./WithdrawButton";
import WithdrawalHistory from "./WithdrawalHistory";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function EarningsCard({ wallet, refreshTrigger = 0 }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  async function fetchRep() {
    try {
      const res = await fetch(`${API}/users/${wallet}/reputation`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data?.usdc_balance === "undefined") throw new Error();
      setRep(data);
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleWithdrawSuccess(data) {
    fetchRep();
    setHistoryTick((t) => t + 1);
  }

  useEffect(() => {
    if (wallet) fetchRep();
  }, [wallet, refreshTrigger]);

  if (loading)
    return (
      <div className="animate-pulse bg-white/5 border border-white/10 rounded-2xl h-36" />
    );

  if (fetchError || !rep)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <i className="bi bi-wallet2 text-gray-600" />
          Could not load balance. Check your connection and refresh.
        </div>
      </div>
    );

  const balance = parseFloat(rep.usdc_balance ?? 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <i className="bi bi-wallet2 text-yellow-400 text-lg" />
          <h3 className="font-semibold text-white">USDC Overview</h3>
        </div>
        <WithdrawButton
          wallet={wallet}
          balance={balance}
          onSuccess={handleWithdrawSuccess}
        />
      </div>

      {/* Single metric: Remaining Balance */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <i className="bi bi-coin text-xs text-green-400" />
          <p className="text-xs text-gray-500">Remaining Balance</p>
        </div>
        <p className="mt-1 text-3xl font-bold text-green-400">
          {balance.toFixed(2)}{" "}
          <span className="text-sm font-normal text-gray-500">USDC</span>
        </p>
      </div>

      {balance > 0 ? (
        <p className="text-xs text-gray-400 text-center mt-4">
          <i className="bi bi-info-circle mr-1" />
          Withdraw to GCash instantly · 1% fee · paid in PHP
        </p>
      ) : (
        <p className="text-xs text-gray-400 text-center mt-4">
          <i className="bi bi-info-circle mr-1" />
          Balance increases when you complete work as a freelancer
        </p>
      )}

      {/* Withdrawal history — shown inline, refreshes after each withdrawal */}
      <WithdrawalHistory wallet={wallet} refreshTrigger={historyTick} />
    </div>
  );
}
