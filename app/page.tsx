import { SearchBox } from '@/components/SearchBox';
import Link from 'next/link';

const EXAMPLE_DIGEST = '8S2obaVUMSnisWCz8PcA9Fh69PTan53gFtxQ3ZDg2ZKu';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SuiExplain</h1>
          <p className="mt-2 text-base text-gray-500">
            Paste any Sui transaction digest and get a plain-English explanation of what happened.
          </p>
        </div>

        <SearchBox />

        <p className="mt-6 text-center text-xs text-gray-400">
          Works on Sui Mainnet &mdash; no wallet connection needed
        </p>

        <div className="mt-10 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Try an example:</p>
          <Link
            href={`/tx/${EXAMPLE_DIGEST}`}
            className="block break-all font-mono text-xs text-blue-600 hover:underline"
          >
            {EXAMPLE_DIGEST}
          </Link>
        </div>
      </div>
    </main>
  );
}
