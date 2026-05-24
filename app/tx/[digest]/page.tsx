import { notFound } from 'next/navigation';
import Link from 'next/link';
import { parseTransaction } from '@/lib/parser';
import { enhanceHeadline } from '@/lib/llm';
import { SummaryCard } from '@/components/SummaryCard';
import { BalanceChanges } from '@/components/BalanceChanges';
import { ObjectChanges } from '@/components/ObjectChanges';
import { CommandList } from '@/components/CommandList';

interface Props {
  params: Promise<{ digest: string }>;
}

export default async function TxPage({ params }: Props) {
  const { digest } = await params;
  const decodedDigest = decodeURIComponent(digest);

  let tx;
  let aiHeadline: string | undefined;
  try {
    tx = await parseTransaction(decodedDigest);
    aiHeadline = await enhanceHeadline(tx);
    // Only treat it as an AI headline if it differs from the rule-based one
    if (aiHeadline === tx.headline) aiHeadline = undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return (
      <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-16">
        <div className="w-full max-w-xl">
          <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            ← Back
          </Link>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-800">Could not load transaction</h1>
            <p className="mt-2 text-sm text-red-600 font-mono break-all">{decodedDigest}</p>
            <p className="mt-3 text-sm text-red-700">{message}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!tx) notFound();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← New search
        </Link>

        <SummaryCard tx={tx} aiHeadline={aiHeadline} />
        <BalanceChanges changes={tx.balanceChanges} />
        <CommandList commands={tx.commands} />
        <ObjectChanges changes={tx.objectChanges} />

        <p className="pb-8 text-center text-xs text-gray-400">
          <a
            href={`https://suiscan.xyz/mainnet/tx/${decodedDigest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            View raw data on SuiScan ↗
          </a>
        </p>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: Props) {
  const { digest } = await params;
  return {
    title: `Tx ${decodeURIComponent(digest).slice(0, 10)}… | SuiExplain`,
  };
}
