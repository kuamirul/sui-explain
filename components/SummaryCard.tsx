import type { ParsedTransaction } from '@/lib/parser';
import { StatusBadge } from './StatusBadge';
import { CopyButton } from './CopyButton';

export function SummaryCard({ tx }: { tx: ParsedTransaction }) {
  const date = tx.timestampMs
    ? new Date(Number(tx.timestampMs)).toLocaleString()
    : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={tx.status} />
        {date && <span className="text-xs text-gray-500">{date}</span>}
      </div>

      <h1 className="text-2xl font-bold text-gray-900">{tx.headline}</h1>
      {tx.headlineSubtext && (
        <p className="mt-1 text-base text-gray-500">{tx.headlineSubtext}</p>
      )}
      {tx.errorMessage && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tx.errorMessage}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
        <span>
          <span className="font-medium text-gray-800">From </span>
          <span className="font-mono">
            {tx.sender.slice(0, 6)}…{tx.sender.slice(-4)}
          </span>
          <CopyButton value={tx.sender} />
        </span>
        <span>
          <span className="font-medium text-gray-800">Fee </span>
          {tx.gasCostSui} SUI
        </span>
        <span>
          <span className="font-medium text-gray-800">Digest </span>
          <span className="font-mono">
            {tx.digest.slice(0, 8)}…{tx.digest.slice(-6)}
          </span>
          <CopyButton value={tx.digest} />
        </span>
      </div>
    </div>
  );
}
