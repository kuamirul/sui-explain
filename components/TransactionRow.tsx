import Link from 'next/link';
import type { ParsedTransaction } from '@/lib/parser';
import { StatusBadge } from './StatusBadge';
import { AddressLink } from './AddressLink';

interface Props {
  digest: string;
  /** Null when the transaction could not be loaded. */
  tx: ParsedTransaction | null;
  /** The address whose page this is. Rows sent by someone else show "From". */
  pageAddress: string;
}

export function TransactionRow({ digest, tx, pageAddress }: Props) {
  const href = `/tx/${digest}`;

  if (!tx) {
    return (
      <li className="px-4 py-3">
        <Link href={href} className="font-mono text-sm text-blue-600 hover:underline">
          {digest.slice(0, 8)}…{digest.slice(-6)}
        </Link>
        <p className="mt-1 text-sm text-gray-500">Could not load this transaction.</p>
      </li>
    );
  }

  const date = tx.timestampMs ? new Date(Number(tx.timestampMs)).toLocaleString() : null;
  const sentByOther = tx.sender !== pageAddress;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={tx.status} />
        {date && <span className="text-xs text-gray-500">{date}</span>}
      </div>
      <Link href={href} className="mt-1 block font-medium text-gray-900 hover:text-blue-600 hover:underline">
        {tx.headline}
      </Link>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
        {tx.headlineSubtext && <span>{tx.headlineSubtext}</span>}
        {sentByOther && (
          <span>
            From <AddressLink address={tx.sender} />
          </span>
        )}
      </div>
    </li>
  );
}
