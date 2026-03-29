/**
 * Shared contract UI tokens — aligned with backend STATUS_MAP (contracts.py).
 */

export const CONTRACT_TYPE_ICONS: Record<string, string> = {
  digital: "bi-laptop",
  goods: "bi-box-seam",
  inperson: "bi-people",
  rental: "bi-house-door",
};

/** API-facing labels returned by the backend */
export type ApiContractStatus =
  | "CREATED"
  | "ONGOING"
  | "LOCKED"
  | "COMPLETE"
  | "DISPUTED"
  | "CANCELLED"
  | "EXPIRED";

export const API_CONTRACT_STATUSES: ApiContractStatus[] = [
  "CREATED",
  "ONGOING",
  "LOCKED",
  "COMPLETE",
  "DISPUTED",
  "CANCELLED",
  "EXPIRED",
];

export type StatusStyle = {
  style: string;
  icon: string;
  /** Short filter label */
  filterLabel: string;
};

/** Badge + filter styling per API status */
export const CONTRACT_STATUS_UI: Record<string, StatusStyle> = {
  CREATED: {
    style: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: "bi-file-earmark-plus",
    filterLabel: "Created",
  },
  ONGOING: {
    style: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    icon: "bi-arrow-repeat",
    filterLabel: "Ongoing",
  },
  ACTIVE: {
    style: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    icon: "bi-lock-fill",
    filterLabel: "Active",
  },
  COMPLETE: {
    style: "border-green-500/30 bg-green-500/10 text-green-400",
    icon: "bi-check-circle-fill",
    filterLabel: "Complete",
  },
  DISPUTED: {
    style: "border-red-500/30 bg-red-500/10 text-red-400",
    icon: "bi-exclamation-triangle-fill",
    filterLabel: "Disputed",
  },
  CANCELLED: {
    style: "border-gray-500/30 bg-gray-500/10 text-gray-400",
    icon: "bi-x-circle-fill",
    filterLabel: "Cancelled",
  },
  EXPIRED: {
    style: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    icon: "bi-clock-history",
    filterLabel: "Expired",
  },
  // Legacy / defensive fallbacks if older clients send these
  PENDING: {
    style: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    icon: "bi-hourglass-split",
    filterLabel: "Pending",
  },
  LOCKED: {
    style: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    icon: "bi-lock-fill",
    filterLabel: "Locked",
  },
  RELEASED: {
    style: "border-green-500/30 bg-green-500/10 text-green-400",
    icon: "bi-check-circle-fill",
    filterLabel: "Released",
  },
};

const FALLBACK: StatusStyle = {
  style: "border-gray-500/30 bg-gray-500/10 text-gray-400",
  icon: "bi-circle",
  filterLabel: "Unknown",
};

export function getContractStatusUi(status: string | undefined): StatusStyle {
  if (!status) return FALLBACK;
  const key = status.toUpperCase();
  return CONTRACT_STATUS_UI[key] ?? FALLBACK;
}

export function getContractTypeIcon(type: string | undefined): string {
  const k = (type ?? "").toLowerCase();
  return CONTRACT_TYPE_ICONS[k] ?? "bi-file-text";
}
