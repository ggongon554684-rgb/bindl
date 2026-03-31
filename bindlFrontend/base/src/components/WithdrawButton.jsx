import { useState } from "react";
import WithdrawModal from "./WithdrawModal";

export default function WithdrawButton({ wallet, balance, onSuccess }) {
  const [open, setOpen] = useState(false);
  const numBalance = parseFloat(balance) || 0;

  function handleSuccess(data) {
    setOpen(false);
    onSuccess?.(data);
  }

  if (!wallet || numBalance <= 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
      >
        <i className="bi bi-cash-coin" /> Withdraw
      </button>

      {open && (
        <WithdrawModal
          wallet={wallet}
          balance={numBalance}
          onClose={() => setOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
