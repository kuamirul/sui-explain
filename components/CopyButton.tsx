'use client';

import { useState } from 'react';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
      title="Copy"
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}
