"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import Link from "next/link";

import { ContractStatusBadge } from "@/components/ContractStatusBadge";
import { PageHeader } from "@/components/PageHeader";
import {
  API_CONTRACT_STATUSES,
  getContractTypeIcon,
  getContractStatusUi,
  type ApiContractStatus,
} from "@/lib/contractUi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contract {
  contract_id: string;
  type: string;
  title: string;
  amount?: string;
  amount_usdc: string;
  /** Backend STATUS_MAP label: CREATED | ONGOING | ACTIVE | … */
  status: string;
  deadline: string;
  party_a: string;
  party_a_wallet: string;
  party_b: string | null;
  party_b_wallet: string | null;
  link_token: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS ??
  "0x16B81079aC2d1d6DB44946CA736D408028235E70") as `0x${string}`;

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ContractCard({
  contract,
  userAddress,
}: {
  contract: Contract;
  userAddress: string;
}) {
  const icon = getContractTypeIcon(contract.type);
  const partyA = contract.party_a_wallet ?? contract.party_a ?? "";
  const isPartyA = userAddress?.toLowerCase() === partyA?.toLowerCase();
  const amount = contract.amount_usdc ?? contract.amount ?? "0";
  const deadline = new Date(contract.deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const linkId = contract.link_token ?? contract.contract_id;

  return (
    <Link href={`/pay/${linkId}`}>
      <div className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-green-500/30">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
            <i
              className={`bi ${icon} text-lg text-gray-400 transition group-hover:text-green-400`}
            />
          </span>
          <div>
            <p className="text-sm font-semibold text-white transition group-hover:text-green-400">
              {contract.title}
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-gray-500">
              <i className="bi bi-hash" />
              {contract.contract_id}
              <span>·</span>
              <i className="bi bi-person" />
              {isPartyA ? "Party A" : "Party B"}
              <span>·</span>
              <i className="bi bi-calendar3" />
              Due {deadline}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ContractStatusBadge status={contract.status} />
          <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-400">
            <i className="bi bi-coin" />
            {amount} USDC
          </span>
        </div>
      </div>
    </Link>
  );
}

function BalanceCard({ address }: { address: string }) {
  const { data: ethBalance } = useBalance({
    address: address as `0x${string}`,
  });
  const { data: usdcBalance } = useBalance({
    address: address as `0x${string}`,
    token: USDC_ADDRESS,
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-wallet2 text-green-400" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          Wallet balance
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-1.5">
            <i className="bi bi-coin text-xs text-green-400" />
            <p className="text-xs text-gray-500">USDC</p>
          </div>
          <p className="mt-1 text-xl font-bold text-white">
            {usdcBalance ? parseFloat(usdcBalance.formatted).toFixed(2) : "—"}
          </p>
          <p className="text-xs text-gray-600">Connected network</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-1.5">
            <i className="bi bi-currency-exchange text-xs text-blue-400" />
            <p className="text-xs text-gray-500">ETH</p>
          </div>
          <p className="mt-1 text-xl font-bold text-white">
            {ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : "—"}
          </p>
          <p className="text-xs text-gray-600">Connected network</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status: sessionStatus } = useSession();
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ApiContractStatus>("all");
  const [error, setError] = useState<string | null>(null);

  // Fix Issue 2 — wait for session before doing anything
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    async function fetchContracts() {
      const addr = address;
      if (!addr) return;
      try {
        const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
        const res = await fetch(
          `${base}/contracts/?address=${encodeURIComponent(addr)}`,
        );
        if (!res.ok) throw new Error("Failed");
        setContracts(await res.json());
      } catch {
        setContracts([]);
        setError(
          "Could not load contracts. Make sure your wallet is connected and try again.",
        );
      } finally {
        setLoading(false);
      }
    }
    fetchContracts();
  }, [address]);

  // Show spinner while session is loading
  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-32 text-center">
        <i className="bi bi-lock mb-4 text-5xl text-gray-600" />
        <h2 className="text-xl font-bold text-white">Connect your wallet</h2>
        <p className="mt-2 text-sm text-gray-400">
          Connect your wallet to see your contracts.
        </p>
        <div className="mt-6">
          <Wallet>
            <ConnectWallet className="rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-gray-950 hover:bg-green-400">
              <Avatar className="h-5 w-5" />
              <Name />
            </ConnectWallet>
          </Wallet>
        </div>
      </div>
    );
  }

  const totalLocked = contracts
  .filter((c) => ["ACTIVE", "LOCKED"].includes(c.status?.toUpperCase() ?? ""))
    .reduce((s, c) => s + parseFloat(c.amount_usdc ?? c.amount ?? "0"), 0);
  const totalEarned = contracts
    .filter((c) => c.status?.toUpperCase() === "COMPLETE")
    .reduce((s, c) => s + parseFloat(c.amount_usdc ?? c.amount ?? "0"), 0);

  const stats = [
    {
      label: "Created / ongoing",
      value: contracts.filter((c) =>
        ["CREATED", "ONGOING"].includes(c.status?.toUpperCase() ?? ""),
      ).length,
      icon: "bi-file-earmark-plus",
      color: "text-slate-300",
    },
    {
      label: "Active (locked)",
      value: contracts.filter((c) => c.status?.toUpperCase() === "ACTIVE").length,
      icon: "bi-lock-fill",
      color: "text-blue-400",
    },
    {
      label: "Complete",
      value: contracts.filter((c) => c.status?.toUpperCase() === "COMPLETE")
        .length,
      icon: "bi-check-circle-fill",
      color: "text-green-400",
    },
    {
      label: "Disputed",
      value: contracts.filter((c) => c.status?.toUpperCase() === "DISPUTED")
        .length,
      icon: "bi-exclamation-triangle-fill",
      color: "text-red-400",
    },
  ];

  const filtered =
    filter === "all"
      ? contracts
      : contracts.filter(
          (c) => c.status?.toUpperCase() === String(filter).toUpperCase(),
        );

  return (
    <div className="animate-fade-in py-8">
      <PageHeader
        title="Dashboard"
        subtitle={
          address ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-500">
              <i className="bi bi-wallet2" />
              {address.slice(0, 6)}…{address.slice(-4)} · Base Sepolia
            </span>
          ) : undefined
        }
        action={
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
          >
            <i className="bi bi-plus-lg" /> New contract
          </Link>
        }
      />

      {/* Balance card */}
      <div className="mb-6">
        <BalanceCard address={address ?? ""} />
      </div>

      {/* USDC summary */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-1.5">
            <i className="bi bi-lock-fill text-xs text-blue-400" />
            <p className="text-xs text-gray-500">Total locked</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-400">
            {totalLocked.toFixed(2)}{" "}
            <span className="text-sm font-normal text-gray-500">USDC</span>
          </p>
        </div>
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-1.5">
            <i className="bi bi-graph-up-arrow text-xs text-green-400" />
            <p className="text-xs text-gray-500">Total earned</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-green-400">
            {totalEarned.toFixed(2)}{" "}
            <span className="text-sm font-normal text-gray-500">USDC</span>
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center gap-1.5">
              <i className={`bi ${icon} text-xs ${color}`} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
            filter === "all"
              ? "border-green-500/60 bg-green-500/10 text-green-400"
              : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"
          }`}
        >
          All
        </button>
        {API_CONTRACT_STATUSES.map((f) => {
          const ui = getContractStatusUi(f);
          return (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? "border-green-500/60 bg-green-500/10 text-green-400"
                  : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"
              }`}
            >
              <i className={`bi ${ui.icon}`} />
              {ui.filterLabel}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Contract list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <i className="bi bi-inbox mb-3 text-4xl text-gray-600" />
          <p className="text-sm text-gray-500">No contracts found.</p>
          <Link
            href="/create"
            className="mt-4 inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
          >
            <i className="bi bi-plus-lg" /> Create your first contract
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <ContractCard
              key={c.contract_id}
              contract={c}
              userAddress={address ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
