"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { PageHeader } from "@/components/PageHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractType = "digital" | "goods" | "inperson" | "rental";
type Step = "type" | "form" | "share";

interface ContractForm {
  title: string;
  description: string;
  deliverables: string;
  deadline: string;
  amount: string;
  partyBEmail: string;
  trackingRequired: boolean;
  returnDate: string;
  depositAmount: string;
  location: string;
  meetingDate: string;
}

const DEFAULT_FORM: ContractForm = {
  title: "",
  description: "",
  deliverables: "",
  deadline: "",
  amount: "",
  partyBEmail: "",
  trackingRequired: false,
  returnDate: "",
  depositAmount: "",
  location: "",
  meetingDate: "",
};

const CONTRACT_TYPES: {
  id: ContractType;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    id: "digital",
    icon: "bi-laptop",
    label: "Digital Work",
    description: "Freelance, design, dev, writing",
  },
  {
    id: "goods",
    icon: "bi-box-seam",
    label: "Physical Goods",
    description: "Products, merchandise, shipping",
  },
  {
    id: "inperson",
    icon: "bi-people",
    label: "In-Person Service",
    description: "Events, tutoring, consulting",
  },
  {
    id: "rental",
    icon: "bi-house-door",
    label: "Rental",
    description: "Property, equipment, vehicles",
  },
];

// Map frontend contract types to backend enum values
const CONTRACT_TYPE_MAP: Record<ContractType, string> = {
  digital: "digital_service",
  goods: "physical_goods",
  inperson: "in_person",
  rental: "rental",
};

const TODAY = new Date().toISOString().split("T")[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Calculate tomorrow's date (minimum deadline is 24 hours from now)
function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

const TOMORROW = getTomorrow();

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            s === step
              ? "w-8 bg-green-400"
              : s < step
                ? "w-3 bg-green-600"
                : "w-3 bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/30 transition";

// ─── AI Scope Builder — FIXED: no preset mock ────────────────────────────────

function AIScopeBuilder({
  contractTypeKey,
  onFill,
}: {
  contractTypeKey: ContractType;
  onFill: (fields: Partial<ContractForm>) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [used, setUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_description: prompt,
          contract_type: CONTRACT_TYPE_MAP[contractTypeKey],
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const rawDel = data.deliverables;
      const deliverablesStr = Array.isArray(rawDel)
        ? rawDel.join("\n")
        : String(rawDel ?? "");
      let deadlineStr = "";
      if (data.suggested_deadline_days != null) {
        const d = new Date();
        d.setDate(d.getDate() + Number(data.suggested_deadline_days));
        deadlineStr = d.toISOString().split("T")[0];
      }
      onFill({
        title: data.title ?? "",
        description: data.description ?? "",
        deliverables: deliverablesStr,
        deadline: deadlineStr,
        amount:
          data.amount_usdc != null
            ? String(data.amount_usdc)
            : data.amount != null
              ? String(data.amount)
              : "",
      });
      setUsed(true);
    } catch {
      // ── No preset mock — just show error and let user fill manually ──
      setError(
        "Could not reach AI. Please fill in the fields manually or try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (used) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
        <i className="bi bi-stars text-green-400" />
        <p className="text-xs font-medium text-green-400">
          AI scope applied — review and edit the fields below.
        </p>
        <button
          onClick={() => {
            setUsed(false);
            setError(null);
            setPrompt("");
          }}
          className="ml-auto text-xs text-gray-500 hover:text-white transition"
        >
          <i className="bi bi-arrow-counterclockwise" /> Reset
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <i className="bi bi-stars text-green-400" />
        <p className="text-sm font-semibold text-white">AI Scope Builder</p>
        <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
          Beta
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Describe your job in plain text — AI will fill in the fields for you.
      </p>
      <textarea
        className={inputCls + " resize-none"}
        rows={3}
        placeholder="e.g. I need a landing page built for my tech startup. Budget $500, need it in 3 weeks. Includes homepage, about, and contact sections."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {error && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-red-400">
          <i className="bi bi-exclamation-circle" /> {error}
        </p>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500/20 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />{" "}
            Generating…
          </>
        ) : (
          <>
            <i className="bi bi-stars" /> Auto-fill with AI
          </>
        )}
      </button>
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function StepChooseType({
  selected,
  onSelect,
  onNext,
}: {
  selected: ContractType | null;
  onSelect: (t: ContractType) => void;
  onNext: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="mb-1 text-xl font-bold text-white">
        What kind of contract?
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        Choose the type that best fits your deal.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CONTRACT_TYPES.map((ct) => (
          <button
            key={ct.id}
            onClick={() => onSelect(ct.id)}
            className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all duration-150 ${
              selected === ct.id
                ? "border-green-500/60 bg-green-500/10 ring-1 ring-green-500/30"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <i
              className={`bi ${ct.icon} text-2xl ${selected === ct.id ? "text-green-400" : "text-gray-400"}`}
            />
            <span className="text-sm font-semibold text-white">{ct.label}</span>
            <span className="text-xs text-gray-500">{ct.description}</span>
          </button>
        ))}
      </div>
      <button
        onClick={onNext}
        disabled={!selected}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Continue <i className="bi bi-arrow-right" />
      </button>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function StepFillForm({
  type,
  form,
  onChange,
  onBack,
  onSubmit,
  loading,
  submitError,
}: {
  type: ContractType;
  form: ContractForm;
  onChange: (key: keyof ContractForm, value: string | boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  submitError?: string | null;
}) {
  const typeLabel = CONTRACT_TYPES.find((c) => c.id === type)?.label ?? "";
  const typeIcon = CONTRACT_TYPES.find((c) => c.id === type)?.icon ?? "";

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white transition"
        >
          <i className="bi bi-arrow-left" /> Back
        </button>
        <div className="flex items-center gap-2">
          <i className={`bi ${typeIcon} text-lg text-green-400`} />
          <h2 className="text-xl font-bold text-white">{typeLabel} Contract</h2>
        </div>
        <p className="text-sm text-gray-500">
          Fill in the details or use AI to auto-fill.
        </p>
      </div>

      <AIScopeBuilder
        contractTypeKey={type}
        onFill={(fields) =>
          Object.entries(fields).forEach(([k, v]) =>
            onChange(k as keyof ContractForm, v as string),
          )
        }
      />

      <Field label="Contract title">
        <input
          className={inputCls}
          placeholder="e.g. Logo design for Bindl"
          value={form.title}
          onChange={(e) => onChange("title", e.target.value)}
        />
      </Field>

      <Field
        label="Description"
        hint="Briefly describe what this contract is for."
      >
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          placeholder="Describe the work or agreement..."
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </Field>

      <Field label="Deliverables" hint="What exactly will be delivered?">
        <textarea
          className={inputCls + " resize-none"}
          rows={2}
          placeholder="e.g. 3 logo concepts, final SVG + PNG files"
          value={form.deliverables}
          onChange={(e) => onChange("deliverables", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (USDC)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
              USDC
            </span>
            <input
              className={
                inputCls +
                " pl-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              }
              type="number"
              min="0"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => onChange("amount", e.target.value)}
            />
          </div>
        </Field>
        <Field label="Deadline">
          <input
            className={inputCls + " [color-scheme:dark] cursor-pointer"}
            type="date"
            min={TOMORROW}
            value={form.deadline}
            onChange={(e) => onChange("deadline", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Party B email" hint="Who are you sending this contract to?">
        <div className="relative">
          <i className="bi bi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className={inputCls + " pl-9"}
            type="email"
            placeholder="they@example.com"
            value={form.partyBEmail}
            onChange={(e) => onChange("partyBEmail", e.target.value)}
          />
        </div>
      </Field>

      {type === "goods" && (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-green-500"
            checked={form.trackingRequired}
            onChange={(e) => onChange("trackingRequired", e.target.checked)}
          />
          <i className="bi bi-truck text-gray-400" />
          <span className="text-sm text-gray-300">
            Require tracking number before release
          </span>
        </label>
      )}

      {type === "rental" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Return date">
            <input
              className={inputCls + " [color-scheme:dark] cursor-pointer"}
              type="date"
              min={TODAY}
              value={form.returnDate}
              onChange={(e) => onChange("returnDate", e.target.value)}
            />
          </Field>
          <Field label="Deposit (USDC)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                USDC
              </span>
              <input
                className={
                  inputCls +
                  " pl-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                }
                type="number"
                min="0"
                placeholder="0.00"
                value={form.depositAmount}
                onChange={(e) => onChange("depositAmount", e.target.value)}
              />
            </div>
          </Field>
        </div>
      )}

      {type === "inperson" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <div className="relative">
              <i className="bi bi-geo-alt absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className={inputCls + " pl-9"}
                placeholder="e.g. Makati, Metro Manila"
                value={form.location}
                onChange={(e) => onChange("location", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Meeting date">
            <input
              className={inputCls + " [color-scheme:dark] cursor-pointer"}
              type="date"
              min={TODAY}
              value={form.meetingDate}
              onChange={(e) => onChange("meetingDate", e.target.value)}
            />
          </Field>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={
          loading ||
          !form.title?.trim() ||
          !form.description?.trim() ||
          !form.amount ||
          !form.deadline
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />{" "}
            Creating…
          </>
        ) : (
          <>
            <i className="bi bi-file-earmark-check" /> Create contract
          </>
        )}
      </button>

      {submitError && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {submitError}
        </p>
      )}
    </div>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function StepShare({
  contractId,
  shareLink,
}: {
  contractId: string;
  shareLink: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Bindl Contract",
        text: "Review and sign this escrow contract on Bindl.",
        url: shareLink,
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="animate-fade-in flex flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/20">
        <i className="bi bi-check-circle-fill text-4xl text-green-400" />
      </div>
      <h2 className="text-xl font-bold text-white">Contract created!</h2>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Share the link with the other party to review and lock funds.
      </p>
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
        <i className="bi bi-hash text-xs text-gray-500" />
        <span className="font-mono text-xs text-gray-400">{contractId}</span>
      </div>
      <div className="mb-4 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <i className="bi bi-link-45deg shrink-0 text-gray-500" />
        <span className="flex-1 truncate text-left font-mono text-xs text-gray-300">
          {shareLink}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
        >
          <i className={`bi ${copied ? "bi-check2" : "bi-clipboard"}`} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        onClick={handleShare}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
      >
        <i className="bi bi-share" /> Share link
      </button>
      <a
        href="/dashboard"
        className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 underline-offset-4 hover:text-white hover:underline transition"
      >
        <i className="bi bi-speedometer2" /> Go to dashboard
      </a>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const { isConnected, address } = useAccount();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [contractType, setContractType] = useState<ContractType | null>(null);
  const [form, setForm] = useState<ContractForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; link: string } | null>(
    null,
  );

  // Fix Issue 3 — don't redirect while session is loading
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  // Fix Issue 3 — redirect to login if not authenticated
  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  if (!isConnected) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-32 text-center">
        <i className="bi bi-lock mb-4 text-5xl text-gray-600" />
        <h2 className="text-xl font-bold text-white">Connect your wallet</h2>
        <p className="mt-2 text-sm text-gray-400">
          You need to connect your wallet to create a contract.
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

  const handleFieldChange = (
    key: keyof ContractForm,
    value: string | boolean,
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!contractType) return;
    setLoading(true);
    setSubmitError(null);
    try {
      // Validate required fields
      if (!form.title?.trim()) {
        throw new Error("Contract title is required");
      }
      if (!form.description?.trim()) {
        throw new Error("Description is required");
      }
      if (!form.deadline) {
        throw new Error("Deadline is required (must be at least tomorrow)");
      }
      if (!form.amount || parseFloat(form.amount) <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      const deadlineDate = new Date(form.deadline);
      if (isNaN(deadlineDate.getTime())) {
        throw new Error("Invalid deadline date");
      }

      const amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contracts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_type: CONTRACT_TYPE_MAP[contractType] as string,
          party_a_wallet: address,
          party_a_email: session?.user?.email ?? null,
          party_a_name: session?.user?.name ?? null,
          title: form.title,
          description: form.description,
          deliverables: form.deliverables.trim()
            ? [form.deliverables.trim()]
            : [],
          acceptance_criteria: [],
          revision_count: 0,
          deadline: deadlineDate.toISOString(),
          amount_usdc: Math.max(0.01, amount),
          party_b_email: form.partyBEmail || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err));
      }
      const data = await res.json();
      setCreated({
        id: data.contract_id,
        link: `${window.location.origin}/pay/${data.link_token}`,
      });
      setStep("share");
    } catch (e) {
      console.error("Contract creation failed:", e);
      setSubmitError("Failed to create contract. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const stepNumber = step === "type" ? 1 : step === "form" ? 2 : 3;

  return (
    <div className="animate-fade-in mx-auto max-w-lg py-8">
      <PageHeader
        title="Create a contract"
        subtitle="Set up an escrow agreement on Base Sepolia."
      />
      <StepDots step={stepNumber} />
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        {step === "type" && (
          <StepChooseType
            selected={contractType}
            onSelect={setContractType}
            onNext={() => setStep("form")}
          />
        )}
        {step === "form" && contractType && (
          <StepFillForm
            type={contractType}
            form={form}
            onChange={handleFieldChange}
            onBack={() => setStep("type")}
            onSubmit={handleSubmit}
            loading={loading}
            submitError={submitError}
          />
        )}
        {step === "share" && created && (
          <StepShare contractId={created.id} shareLink={created.link} />
        )}
      </div>
    </div>
  );
}
