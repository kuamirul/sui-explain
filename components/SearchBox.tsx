'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function SearchBox() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const digest = value.trim();
    if (!digest) return;
    // Basic Sui digest validation: base58, ~44 chars
    if (digest.length < 20) {
      setError('That doesn\'t look like a valid Sui transaction digest.');
      return;
    }
    setError('');
    router.push(`/tx/${encodeURIComponent(digest)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder="Paste a transaction digest, e.g. 8S2oba…"
          className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
        >
          Explain
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </form>
  );
}
