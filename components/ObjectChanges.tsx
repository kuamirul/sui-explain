'use client';

import { useState } from 'react';
import type { ParsedObjectChange } from '@/lib/parser';

const TYPE_ICON: Record<string, string> = {
  created: '✦',
  deleted: '✕',
  transferred: '→',
  wrapped: '↓',
  published: '⬡',
  other: '·',
};

const TYPE_COLOR: Record<string, string> = {
  created: 'text-blue-600 bg-blue-50',
  deleted: 'text-gray-500 bg-gray-100',
  transferred: 'text-purple-600 bg-purple-50',
  wrapped: 'text-orange-600 bg-orange-50',
  published: 'text-indigo-600 bg-indigo-50',
  other: 'text-gray-500 bg-gray-50',
};

export function ObjectChanges({ changes }: { changes: ParsedObjectChange[] }) {
  const [open, setOpen] = useState(false);
  if (changes.length === 0) return null;

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Object Changes
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {changes.length}
          </span>
        </span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {changes.map((c, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-bold ${TYPE_COLOR[c.changeType] ?? 'text-gray-500 bg-gray-50'}`}
              >
                {TYPE_ICON[c.changeType] ?? '·'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{c.label}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-gray-400">
                  {c.objectId.slice(0, 10)}…{c.objectId.slice(-6)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
