import type { ParsedCommand } from '@/lib/parser';

export function CommandList({ commands }: { commands: ParsedCommand[] }) {
  if (commands.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        What Happened
      </h2>
      <ol className="space-y-2">
        {commands.map((cmd) => (
          <li
            key={cmd.index}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
              {cmd.index}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-800">{cmd.label}</p>
              {cmd.detail && (
                <p className="mt-0.5 font-mono text-xs text-gray-400">{cmd.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
