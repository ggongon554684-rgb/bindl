"use client";

import { getContractStatusUi } from "@/lib/contractUi";

export function ContractStatusBadge({ status }: { status: string }) {
  const { style, icon, filterLabel } = getContractStatusUi(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      <i className={`bi ${icon}`} /> {filterLabel}
    </span>
  );
}
