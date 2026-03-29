"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useReadContract, useConnect } from "wagmi";
import { useSession } from "next-auth/react";
import { injected } from "wagmi/connectors";
import { parseUnits } from "viem";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from "@coinbase/onchainkit/transaction";
import { ReputationCard } from "@/components/ReputationCard";
import { ContractStatusBadge } from "@/components/ContractStatusBadge";
import { getContractTypeIcon } from "@/lib/contractUi";

// ─── Contract config ──────────────────────────────────────────────────────────

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ??
  "0x00E6d5545f1b843fDed82F6B69FbeAd52453D4dA") as `0x${string}`;
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS ??
  "0x16B81079aC2d1d6DB44946CA736D408028235E70") as `0x${string}`;
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "1337");

const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ESCROW_ABI = [
  {
    name: "lockFunds",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "partyA", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "termsHash", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "milestoneAmounts", type: "uint256[]" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
  },
  {
    name: "releaseFunds",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "raiseDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contract {
  contract_id: string;
  link_token: string;
  type: string;
  title: string;
  description: string;
  deliverables: string | string[];
  deadline: string;
  amount_usdc: string;
  party_a_wallet: string;
  party_b_wallet: string | null;
  party_b_email: string | null;
  status: string;
  created_at: string;
  terms_hash?: string;
  party_b_agreed_at?: string | null;
  work_submitted_at?: string | null;
  work_approved_at?: string | null;
  work_notes?: string | null;
  final_submitted_at?: string | null;
  final_notes?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeliverables(value: string | string[] | undefined): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value) as unknown;
      if (Array.isArray(p)) return p.join(", ");
    } catch {
      /* plain string */
    }
    return value;
  }
  return "—";
}

function TermRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-gray-500">
        <i className={`bi ${icon} text-gray-600`} />
        {label}
      </span>
      <span className="break-all text-right font-mono text-sm text-gray-300">
        {value}
      </span>
    </div>
  );
}

function useScrollGate(ref: React.RefObject<HTMLDivElement>) {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 40)
        setUnlocked(true);
    };
    el.addEventListener("scroll", check);
    check();
    return () => el.removeEventListener("scroll", check);
  }, [ref]);
  return unlocked;
}

function ConnectMetaMask() {
  const { connect, isPending } = useConnect();
  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-50"
    >
      {isPending ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <i className="bi bi-wallet2" />
      )}
      {isPending ? "Connecting…" : "Connect MetaMask"}
    </button>
  );
}

// ─── Email gate — checks Party B email before showing pay flow ────────────────

function EmailGate({
  contract,
  userEmail,
  walletAddress,
  onAccepted,
}: {
  contract: Contract;
  userEmail: string;
  walletAddress?: string;
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const expectedEmail = contract.party_b_email?.toLowerCase().trim() || "";
  const actualEmail = (userEmail || "").toLowerCase().trim();
  const emailMatches = expectedEmail && expectedEmail === actualEmail;

  if (!emailMatches) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <i className="bi bi-shield-x text-3xl text-red-400" />
        <p className="text-sm font-semibold text-red-400">Access restricted</p>
        <p className="text-xs text-gray-500">
          This contract was sent to{" "}
          <span className="font-mono text-gray-300">
            {contract.party_b_email}
          </span>
          . You are signed in as{" "}
          <span className="font-mono text-gray-300">{userEmail}</span>.
        </p>
        <p className="text-xs text-gray-600">
          Please sign in with the correct account to proceed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <i className="bi bi-file-earmark-check text-3xl text-green-400" />
      <p className="text-sm font-semibold text-white">
        You've been invited to this contract
      </p>
      <p className="text-xs text-gray-400">
        Review the terms above carefully before accepting.
      </p>
      <button
        onClick={async () => {
          setAccepting(true);
          try {
            await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/agree?wallet=${walletAddress}`,
              { method: "POST" },
            );
          } catch {
            /* mock */
          } finally {
            setAccepting(false);
            onAccepted();
          }
        }}
        disabled={accepting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
      >
        {accepting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
        ) : (
          <i className="bi bi-check2-circle" />
        )}
        {accepting ? "Accepting…" : "Accept contract"}
      </button>
    </div>
  );
}

// ─── Lock funds panel ─────────────────────────────────────────────────────────

function LockFundsPanel({
  contract,
  unlocked,
  onAgree,
  agreed,
}: {
  contract: Contract;
  unlocked: boolean;
  onAgree: () => Promise<void>;
  agreed: boolean;
}) {
  const { address } = useAccount();
  const [agreeing, setAgreeing] = useState(false);
  const amountInUnits = parseUnits(contract.amount_usdc ?? "0", 6);

  const { data: allowance, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, ESCROW_ADDRESS],
  });

  const hasAllowance = allowance !== undefined && allowance >= amountInUnits;
  const approveCall = [
    {
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve" as const,
      args: [ESCROW_ADDRESS, amountInUnits],
    },
  ];

  // Convert deadline string to unix timestamp
  const deadlineTimestamp = Math.floor(
    new Date(contract.deadline).getTime() / 1000,
  );

  // Convert terms_hash string to bytes32 (pad with zeros if needed)
  const termsHashBytes32 = contract.terms_hash
    ? ((contract.terms_hash.startsWith("0x")
        ? contract.terms_hash
        : `0x${contract.terms_hash}`) as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

  const lockCall = [
    {
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "lockFunds" as const,
      args: [
        contract.party_a_wallet as `0x${string}`, // partyA address
        amountInUnits, // amount (uint256)
        termsHashBytes32, // termsHash (bytes32)
        BigInt(deadlineTimestamp), // deadline (uint256 timestamp)
        [], // milestoneAmounts (empty array for non-milestone contracts)
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 ${agreed ? "text-green-400" : unlocked ? "text-white" : "text-gray-600"}`}
        >
          <i
            className={`bi ${agreed ? "bi-check-circle-fill" : "bi-1-circle-fill"}`}
          />{" "}
          Read terms
        </span>
        <i className="bi bi-arrow-right text-gray-700" />
        <span
          className={`inline-flex items-center gap-1 ${hasAllowance ? "text-green-400" : agreed ? "text-white" : "text-gray-600"}`}
        >
          <i
            className={`bi ${hasAllowance ? "bi-check-circle-fill" : "bi-2-circle-fill"}`}
          />{" "}
          Approve USDC
        </span>
        <i className="bi bi-arrow-right text-gray-700" />
        <span
          className={`inline-flex items-center gap-1 ${hasAllowance && agreed ? "text-white" : "text-gray-600"}`}
        >
          <i className="bi bi-3-circle-fill" /> Lock funds
        </span>
      </div>

      {!unlocked && (
        <div className="inline-flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          <i className="bi bi-arrow-down-circle" /> Scroll through all terms to
          unlock
        </div>
      )}

      {!agreed && unlocked && (
        <button
          onClick={async () => {
            setAgreeing(true);
            await onAgree();
            setAgreeing(false);
          }}
          disabled={agreeing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 py-3 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
        >
          {agreeing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
          ) : (
            <i className="bi bi-check2-circle" />
          )}
          {agreeing ? "Recording agreement…" : "I agree to the terms"}
        </button>
      )}

      {agreed && !hasAllowance && (
        <Transaction
          chainId={CHAIN_ID}
          calls={approveCall}
          onSuccess={() => refetch()}
        >
          <TransactionButton
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            text={`Approve ${contract.amount_usdc} USDC`}
          />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
        </Transaction>
      )}

      {agreed && hasAllowance && (
        <Transaction
          chainId={CHAIN_ID}
          calls={lockCall}
          onSuccess={() => window.location.reload()}
        >
          <TransactionButton
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
            text={`Lock ${contract.amount_usdc} USDC`}
          />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
        </Transaction>
      )}
    </div>
  );
}

function ActionPanel({
  contract,
  onReleaseSuccess,
}: {
  contract: Contract;
  onReleaseSuccess: (tx: string) => void;
}) {
  const releaseCall = [
    {
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "releaseFunds" as const,
      args: [BigInt(contract.link_token)],
    },
  ];
  const disputeCall = [
    {
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "raiseDispute" as const,
      args: [BigInt(contract.link_token), "Work not satisfactory"],
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Transaction
        chainId={CHAIN_ID}
        calls={releaseCall}
        onSuccess={(res) =>
          onReleaseSuccess(res.transactionReceipts?.[0]?.transactionHash ?? "")
        }
      >
        <TransactionButton
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
          text="Approve & Release Funds"
        />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
      <Transaction
        chainId={CHAIN_ID}
        calls={disputeCall}
        onSuccess={() => window.location.reload()}
      >
        <TransactionButton
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
          text="Raise Dispute"
        />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
    </div>
  );
}

// ─── Submit work panel (Party B during ONGOING) ─────────────────────────────────

function SubmitWorkPanel({
  contract,
  walletAddress,
  onSubmitSuccess,
}: {
  contract: Contract;
  walletAddress: string | undefined;
  onSubmitSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!walletAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/submit-work`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletAddress, notes }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        console.error("Submit work error:", err);
        throw new Error(err.detail || "Failed to submit work");
      }
      onSubmitSuccess();
    } catch (err) {
      console.error("Network error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit work");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-400">
        Submit your completed work for review by Party A.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add a link to your work, Google Drive, GitHub, etc."
        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500"
        rows={3}
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
      >
        {submitting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
        ) : (
          <i className="bi bi-check-circle" />
        )}
        {submitting ? "Submitting work…" : "Submit work for review"}
      </button>
    </div>
  );
}

// ─── Approve work panel (Party A when work is submitted) ──────────────────────

function ApproveWorkPanel({
  contract,
  onApprovalComplete,
}: {
  contract: Contract;
  onApprovalComplete: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address } = useAccount();

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/approve-work`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, approved: true }),
        },
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      onApprovalComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve work");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/approve-work`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, approved: false }),
        },
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      onApprovalComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject work");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-400">
        Review the submitted work. Approve to proceed with payment or reject to
        request revisions.
      </p>
      {contract.work_submitted_at && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-1">
          <p className="text-xs text-gray-500">Submitted by Party B</p>
          <p className="text-xs text-gray-400">
            {new Date(contract.work_submitted_at).toLocaleString()}
          </p>
          {contract.work_notes && (
            <p className="text-sm text-white mt-1 break-all">
              {contract.work_notes}
            </p>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={approving || rejecting}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
        >
          {approving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
          ) : (
            <i className="bi bi-check-circle" />
          )}
          {approving ? "Approving…" : "Approve work"}
        </button>
        <button
          onClick={handleReject}
          disabled={approving || rejecting}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {rejecting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
          ) : (
            <i className="bi bi-x-circle" />
          )}
          {rejecting ? "Rejecting…" : "Reject work"}
        </button>
      </div>
    </div>
  );
}

// ─── Final delivery panel (Party B after work is approved) ────────────────────

function FinalDeliveryPanel({
  contract,
  walletAddress,
  onSubmitSuccess,
}: {
  contract: Contract;
  walletAddress: string | undefined;
  onSubmitSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!walletAddress) {
      setError("Please connect your wallet first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/submit-final`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletAddress, notes }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        console.error("Submit final error:", err);
        throw new Error(err.detail || "Failed to submit final delivery");
      }
      onSubmitSuccess();
    } catch (err) {
      console.error("Network error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to submit final delivery",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-400">
        Your work has been approved! Submit your final deliverable with links.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Final delivery link, Google Drive, GitHub repo, or any final proof of delivery"
        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500"
        rows={3}
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
      >
        {submitting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
        ) : (
          <i className="bi bi-check-circle" />
        )}
        {submitting ? "Submitting final…" : "Submit final deliverable"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PayPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const { isConnected, address } = useAccount();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const termsRef = useRef<HTMLDivElement>(null);
  const scrollUnlocked = useScrollGate(termsRef);

  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/contracts/${params.id}`,
        );
        if (!res.ok) throw new Error();
        setContract(await res.json());
        setError(null);
      } catch {
        setContract(null);
        setError(
          "Could not load contract. Make sure your wallet is connected and try again.",
        );
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [params.id]);

  const handleAgree = async () => {
    const token = contract?.link_token ?? params.id;
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${token}/agree?wallet=${address}`,
        { method: "POST" },
      );
      // Refresh contract to get updated party_b_agreed_at
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/${params.id}`,
      );
      if (res.ok) {
        setContract(await res.json());
      }
    } catch (err) {
      setError("Could not accept contract. Please retry.");
      return;
    }
    setAgreed(true);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );

  if (!contract) {
    return (
      <div className="py-32 text-center">
        {error ? (
          <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <>
            <i className="bi bi-file-earmark-x mb-3 text-4xl text-gray-600" />
            <p className="text-sm text-gray-400">Contract not found.</p>
          </>
        )}
      </div>
    );
  }

  const icon = getContractTypeIcon(contract.type);
  const statusUpper = contract.status?.toUpperCase() ?? "CREATED";

  // Check if this user is Party B (invited party)
  const isPartyB = contract.party_b_email
    ? contract.party_b_email.toLowerCase() ===
      (session?.user?.email ?? "").toLowerCase()
    : false;
  const isPartyA =
    contract.party_a_wallet?.toLowerCase() === address?.toLowerCase();
  const hasEmail = !!contract.party_b_email;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl py-8">
      {/* Success banner */}
      {txHash && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
          <i className="bi bi-check-circle-fill text-green-400" />
          <div>
            <p className="text-sm font-semibold text-green-400">
              Funds released successfully!
            </p>
            <p className="font-mono text-xs text-green-600">
              {txHash.slice(0, 16)}…{txHash.slice(-8)}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-1 font-mono text-xs text-gray-600">
            <i className="bi bi-hash" />
            {contract.contract_id}
          </p>
          <h1 className="text-2xl font-bold text-white">{contract.title}</h1>
          <p className="mt-1 text-sm text-gray-400">{contract.description}</p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>

      {/* Reputation card */}
      <div className="mb-4">
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500">
          <i className="bi bi-person-circle" /> About Party A
        </p>
        <ReputationCard address={contract.party_a_wallet} />
      </div>

      {/* Terms card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className={`bi ${icon} text-gray-500`} />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              Contract terms
            </h2>
          </div>
          {scrollUnlocked ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <i className="bi bi-check-circle-fill" /> Read
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <i className="bi bi-arrow-down" /> Scroll to read
            </span>
          )}
        </div>
        <div ref={termsRef} className="max-h-48 overflow-y-auto space-y-3 pr-1">
          <TermRow icon="bi-tag" label="Type" value={contract.type} />
          <TermRow
            icon="bi-card-list"
            label="Deliverables"
            value={formatDeliverables(contract.deliverables)}
          />
          <TermRow
            icon="bi-calendar3"
            label="Deadline"
            value={new Date(contract.deadline).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <TermRow
            icon="bi-coin"
            label="Amount"
            value={`${contract.amount_usdc} USDC`}
          />
          <TermRow
            icon="bi-person"
            label="Party A"
            value={contract.party_a_wallet}
          />
          <TermRow
            icon="bi-person-fill"
            label="Party B"
            value={contract.party_b_wallet ?? contract.party_b_email ?? "—"}
          />
          <TermRow
            icon="bi-clock"
            label="Created"
            value={new Date(contract.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          {contract.terms_hash && (
            <TermRow
              icon="bi-shield-check"
              label="Terms hash"
              value={contract.terms_hash}
            />
          )}
        </div>
      </div>

      {/* Action card */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        {/* Not connected */}
        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <i className="bi bi-wallet2 text-3xl text-gray-600" />
            <p className="text-sm font-semibold text-white">
              Connect your wallet to continue
            </p>
            <p className="text-xs text-gray-400">
              You need MetaMask connected to Ganache Local.
            </p>
            <ConnectMetaMask />
          </div>
        ) : /* Party B — email check + accept button */
        hasEmail && !isPartyA && !contract.party_b_agreed_at && !agreed ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <i className="bi bi-envelope-check text-white" />
              <h3 className="text-sm font-semibold text-white">
                Review & accept contract
              </h3>
            </div>
            {status === "loading" ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              </div>
            ) : (
              <EmailGate
                contract={contract}
                userEmail={session?.user?.email ?? ""}
                walletAddress={address}
                onAccepted={() => setAgreed(true)}
              />
            )}
          </div>
        ) : /* After accepting — show lock funds flow */
        ["PENDING", "CREATED"].includes(statusUpper) ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <i className="bi bi-lock text-white" />
              <h3 className="text-sm font-semibold text-white">
                Lock funds to activate contract
              </h3>
            </div>
            <LockFundsPanel
              contract={contract}
              unlocked={scrollUnlocked}
              onAgree={handleAgree}
              agreed={agreed}
            />
          </div>
        ) : statusUpper === "ONGOING" && !isPartyA ? (
          <div>
            {contract.final_submitted_at ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <i className="bi bi-check2-circle text-3xl text-green-400" />
                <p className="text-sm font-semibold text-white">
                  Final delivery submitted
                </p>
                <p className="text-xs text-gray-400">
                  Waiting for Party A to mark as received and release payment.
                </p>
              </div>
            ) : contract.work_approved_at ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <i className="bi bi-box-seam text-white" />
                  <h3 className="text-sm font-semibold text-white">
                    Deliver final work
                  </h3>
                </div>
                <FinalDeliveryPanel
                  contract={contract}
                  walletAddress={address}
                  onSubmitSuccess={() => window.location.reload()}
                />
              </>
            ) : contract.work_submitted_at ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <i className="bi bi-hourglass text-3xl text-amber-400" />
                <p className="text-sm font-semibold text-white">
                  Work submitted
                </p>
                <p className="text-xs text-gray-400">
                  Waiting for Party A to review and approve your submission.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <i className="bi bi-briefcase text-white" />
                  <h3 className="text-sm font-semibold text-white">
                    Submit your work
                  </h3>
                </div>
                <SubmitWorkPanel
                  contract={contract}
                  walletAddress={address}
                  onSubmitSuccess={() => window.location.reload()}
                />
              </>
            )}
          </div>
        ) : statusUpper === "ONGOING" &&
          isPartyA &&
          contract.final_submitted_at ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-gray-500 mb-1">
                Final delivery received
              </p>
              <p className="text-xs text-gray-400">
                Party B has submitted their final deliverable.
              </p>
              {contract.final_notes && (
                <p className="text-sm text-white mt-2 break-all">
                  {contract.final_notes}
                </p>
              )}
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/contracts/${contract.link_token}/release`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    },
                  );
                  if (res.ok) window.location.reload();
                } catch (err) {
                  console.error("Release error:", err);
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
            >
              <i className="bi bi-check2-circle" />
              Mark as Received & Release Payment
            </button>
          </div>
        ) : statusUpper === "ONGOING" && isPartyA ? (
          <div>
            {contract.work_approved_at ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <i className="bi bi-hourglass text-3xl text-amber-400" />
                <p className="text-sm font-semibold text-white">
                  Waiting for final delivery
                </p>
                <p className="text-xs text-gray-400">
                  Party B is preparing their final deliverable.
                </p>
              </div>
            ) : contract.work_submitted_at ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <i className="bi bi-eye text-white" />
                  <h3 className="text-sm font-semibold text-white">
                    Review submitted work
                  </h3>
                </div>
                <ApproveWorkPanel
                  contract={contract}
                  onApprovalComplete={() => window.location.reload()}
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <i className="bi bi-hourglass text-3xl text-amber-400" />
                <p className="text-sm font-semibold text-white">
                  Waiting for work submission
                </p>
                <p className="text-xs text-gray-400">
                  Party B will submit their work soon.
                </p>
              </div>
            )}
          </div>
        ) : statusUpper === "LOCKED" ||
          statusUpper === "ACTIVE" ||
          statusUpper === "MILESTONE" ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <i className="bi bi-check2-square text-white" />
              <h3 className="text-sm font-semibold text-white">
                Contract is active
              </h3>
            </div>
            <ActionPanel
              contract={contract}
              onReleaseSuccess={(hash) => setTxHash(hash)}
            />
          </div>
        ) : statusUpper === "RELEASED" || statusUpper === "COMPLETE" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <i className="bi bi-check-circle-fill text-3xl text-green-400" />
            <p className="text-sm font-semibold text-green-400">
              Funds have been released
            </p>
            <p className="text-xs text-gray-500">This contract is complete.</p>
          </div>
        ) : statusUpper === "DISPUTED" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <i className="bi bi-exclamation-triangle-fill text-3xl text-red-400" />
            <p className="text-sm font-semibold text-red-400">
              Dispute in progress
            </p>
            <p className="text-xs text-gray-500">
              This contract is under review.
            </p>
          </div>
        ) : statusUpper === "CANCELLED" || statusUpper === "EXPIRED" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <i className="bi bi-slash-circle text-3xl text-gray-500" />
            <p className="text-sm font-semibold text-gray-400">
              {statusUpper === "CANCELLED"
                ? "Contract cancelled"
                : "Contract expired"}
            </p>
            <p className="text-xs text-gray-500">
              No further actions available.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
