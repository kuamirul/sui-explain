import Link from 'next/link';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { listAddressTransactions } from '@/lib/sui';
import { parseTransaction } from '@/lib/parser';
import { TransactionRow } from '@/components/TransactionRow';
import { CopyButton } from '@/components/CopyButton';

const PAGE_SIZE = 10;

interface Props {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ before?: string }>;
}

/** "0x" plus 1 to 64 hex digits, padded to the full 64-digit form. Null if invalid. */
function parseAddress(raw: string): string | null {
  const value = decodeURIComponent(raw).trim();
  return /^0x[0-9a-fA-F]{1,64}$/.test(value) ? normalizeSuiAddress(value) : null;
}

export default async function AddressPage({ params, searchParams }: Props) {
  const { address: rawAddress } = await params;
  const { before } = await searchParams;
  const address = parseAddress(rawAddress);

  if (!address) {
    return <ErrorCard title="Not a valid Sui address" detail={decodeURIComponent(rawAddress)} />;
  }

  let page;
  try {
    page = await listAddressTransactions(address, { before, limit: PAGE_SIZE });
  } catch (err) {
    return <ErrorCard title="Could not load transactions" detail={err instanceof Error ? err.message : 'Unknown error'} />;
  }

  // Explain each transaction in parallel. One failure only affects its own row.
  const results = await Promise.allSettled(page.digests.map((d) => parseTransaction(d)));
  const rows = page.digests.map((digest, i) => {
    const r = results[i];
    return { digest, tx: r.status === 'fulfilled' ? r.value : null };
  });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← New search
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Wallet activity</h1>
          <p className="mt-2 break-all font-mono text-sm text-gray-600">
            {address}
            <CopyButton value={address} />
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
            {before ? 'Older transactions' : 'Recent transactions'}
          </h2>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No transactions found for this address.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => (
                <TransactionRow key={row.digest} digest={row.digest} tx={row.tx} pageAddress={address} />
              ))}
            </ul>
          )}
        </div>

        <nav className="flex justify-between pb-8 text-sm">
          {before ? (
            <Link href={`/address/${address}`} className="text-blue-600 hover:underline">
              ← Newest
            </Link>
          ) : (
            <span />
          )}
          {page.olderCursor && (
            <Link
              href={`/address/${address}?before=${encodeURIComponent(page.olderCursor)}`}
              className="text-blue-600 hover:underline"
            >
              Older →
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-800">{title}</h1>
          <p className="mt-2 break-all font-mono text-sm text-red-700">{detail}</p>
        </div>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: Props) {
  const { address } = await params;
  const parsed = parseAddress(address);
  return { title: parsed ? `${parsed.slice(0, 8)}…${parsed.slice(-4)} | SuiExplain` : 'Invalid address | SuiExplain' };
}
