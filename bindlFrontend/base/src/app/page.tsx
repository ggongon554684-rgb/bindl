"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

const FEATURES = [
  { icon: "bi-coin",          label: "USDC payments",       desc: "Lock funds in a smart contract on Base Sepolia"  },
  { icon: "bi-flag-fill",     label: "Milestone releases",  desc: "Release payments in stages as work is completed" },
  { icon: "bi-shield-check",  label: "Dispute protection",  desc: "Raise disputes with evidence, protected by escrow"},
  { icon: "bi-star-fill",     label: "On-chain reputation", desc: "Build trust with a verifiable reputation score"   },
  { icon: "bi-person-check",  label: "Ghost protection",    desc: "Auto-dispute triggers if a party goes silent"     },
  { icon: "bi-pencil-square", label: "Amendments",          desc: "Propose contract changes with mutual consent"     },
];

const STEPS = [
  { step: "01", icon: "bi-file-earmark-plus", title: "Create a contract",   desc: "Define terms, deliverables, deadline and amount."    },
  { step: "02", icon: "bi-share",             title: "Share the link",      desc: "Send the contract link to the other party."          },
  { step: "03", icon: "bi-lock-fill",         title: "Lock USDC",           desc: "Both parties confirm and funds are locked on-chain." },
  { step: "04", icon: "bi-check-circle-fill", title: "Release on approval", desc: "Funds release automatically when work is approved."  },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // If already logged in, skip landing page and go straight to dashboard
  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">

      {/* ── Hero ── */}
      <section className="flex flex-col items-center justify-center py-24 text-center">
        <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
          <i className="bi bi-circle-fill text-[6px]" />
          Live on Base Sepolia Testnet
        </span>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Escrow contracts for{" "}
          <span className="text-green-400">real-world deals</span>
        </h1>

        <p className="mt-6 max-w-lg text-base text-gray-400 sm:text-lg">
          Lock USDC in a smart contract. Release when both parties are satisfied.
          Built on Base with dispute protection and an on-chain reputation system.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-8 py-3 text-sm font-semibold text-gray-950 shadow-lg transition hover:bg-green-400 active:scale-95"
          >
            <i className="bi bi-rocket-takeoff" />
            Get started — it's free
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
          >
            <i className="bi bi-play-circle" />
            How it works
          </Link>
        </div>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-3">
          {FEATURES.slice(0, 5).map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-gray-400"
            >
              <i className={`bi ${f.icon}`} />
              {f.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-t border-white/5 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400">How it works</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Simple. Secure. On-chain.</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.step} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-green-400">{s.step}</span>
                  <i className={`bi ${s.icon} text-xl text-gray-500`} />
                </div>
                <p className="text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-1 text-xs text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-white/5 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400">Features</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Everything you need to close deals safely</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.label} className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-green-500/30">
                <i className={`bi ${f.icon} mb-3 text-2xl text-green-400`} />
                <p className="text-sm font-semibold text-white">{f.label}</p>
                <p className="mt-1 text-xs text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/5 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-green-500/20 bg-green-500/5 p-10 text-center">
          <i className="bi bi-shield-check mb-4 text-4xl text-green-400" />
          <h2 className="text-2xl font-bold text-white">Ready to close your first deal?</h2>
          <p className="mt-3 text-sm text-gray-400">
            Create a free account and set up your first escrow contract in under 2 minutes.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-500 px-8 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
          >
            <i className="bi bi-rocket-takeoff" />
            Get started for free
          </Link>
        </div>
      </section>

    </div>
  );
}