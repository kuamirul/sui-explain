import type { ParsedBalanceChange } from '@/lib/parser';

export function BalanceChanges({ changes }: { changes: ParsedBalanceChange[] }) {
  if (changes.length === 0) return null;

  const outgoing = changes.filter((c) => c.direction === 'out');
  const incoming = changes.filter((c) => c.direction === 'in');

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Token Changes
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {outgoing.map((c, i) => (
          <Row key={`out-${i}`} change={c} />
        ))}
        {incoming.map((c, i) => (
          <Row key={`in-${i}`} change={c} />
        ))}
      </div>
    </section>
  );
}

function Row({ change }: { change: ParsedBalanceChange }) {
  const isIn = change.direction === 'in';
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
            isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {change.symbol.slice(0, 2)}
        </span>
        <div>
          <p className="text-sm font-medium text-gray-900">{change.symbol}</p>
          <p className="text-xs text-gray-400">{isIn ? 'Received' : 'Sent'}</p>
        </div>
      </div>
      <span
        className={`text-sm font-semibold tabular-nums ${
          isIn ? 'text-green-600' : 'text-red-500'
        }`}
      >
        {change.amountFormatted}
      </span>
    </div>
  );
}
