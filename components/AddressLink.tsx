import Link from 'next/link';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { CopyButton } from './CopyButton';

/** Short address that links to its address page, with a copy button. Non-addresses (e.g. "Unknown") render as text. */
export function AddressLink({ address }: { address: string }) {
  if (!isValidSuiAddress(address)) return <span className="font-mono">{address}</span>;

  return (
    <span>
      <Link href={`/address/${address}`} className="font-mono text-blue-600 hover:underline" title={address}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </Link>
      <CopyButton value={address} />
    </span>
  );
}
