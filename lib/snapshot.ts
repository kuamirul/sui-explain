import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { suiClient, getTransactionMeta, resolveOriginalPackages } from './sui';
import { getCoinMeta, type CoinMeta } from './coins';

export type Command = SuiClientTypes.TransactionData['commands'][number];
export type MoveCall = Extract<Command, { MoveCall: unknown }>['MoveCall'];

/**
 * Everything the parser needs about one transaction, fetched up front.
 *
 * It is plain JSON (no bigint, no Uint8Array), so tests can store it as a fixture
 * and run the parser on it without network access.
 */
export interface TxSnapshot {
  digest: string;
  sender: string | null;
  timestampMs: string | null;
  status: SuiClientTypes.ExecutionStatus;
  gasUsed: SuiClientTypes.GasCostSummary;
  /** Address that paid gas. Differs from the sender for sponsored transactions. Null if unknown. */
  gasOwner: string | null;
  changedObjects: SuiClientTypes.ChangedObject[];
  balanceChanges: SuiClientTypes.BalanceChange[];
  /** Object ID -> Move type, for changed objects. */
  objectTypes: Record<string, string>;
  /** Null for system transactions (for example epoch change), which have no commands. */
  commands: Command[] | null;
  /** Called package ID (normalized) -> original package ID. */
  originalPackages: Record<string, string>;
  /** Coin type (as it appears in balanceChanges) -> metadata. */
  coins: Record<string, CoinMeta>;
}

const INCLUDE = { effects: true, balanceChanges: true, objectTypes: true } as const;
const NOT_PROGRAMMABLE = 'Only programmable transactions are supported';

async function fetchCore(digest: string) {
  try {
    const res = await suiClient.core.getTransaction({ digest, include: { ...INCLUDE, transaction: true } });
    const tx = res.Transaction ?? res.FailedTransaction;
    return { tx, commands: tx.transaction.commands, gasOwner: tx.transaction.gasData.owner ?? null };
  } catch (err) {
    // The SDK cannot decode system transactions (e.g. epoch change). Load them without commands.
    if (!(err instanceof Error) || !err.message.includes(NOT_PROGRAMMABLE)) throw err;
    const res = await suiClient.core.getTransaction({ digest, include: INCLUDE });
    const tx = res.Transaction ?? res.FailedTransaction;
    return { tx, commands: null, gasOwner: null };
  }
}

export async function fetchSnapshot(digest: string): Promise<TxSnapshot> {
  // Wait for both, then report the metadata error first: it says "Transaction … not found",
  // while the SDK only says "Missing response data". Promise.all would report whichever failed first.
  const [coreResult, metaResult] = await Promise.allSettled([fetchCore(digest), getTransactionMeta(digest)]);
  if (metaResult.status === 'rejected') throw metaResult.reason;
  if (coreResult.status === 'rejected') throw coreResult.reason;
  const { tx, commands, gasOwner } = coreResult.value;
  const meta = metaResult.value;

  const calledPackages = (commands ?? []).flatMap((c) => ('MoveCall' in c ? [c.MoveCall.package] : []));
  const coinTypes = [...new Set(tx.balanceChanges.map((b) => b.coinType))];

  const [originalPackages, coinMetas] = await Promise.all([
    resolveOriginalPackages(calledPackages),
    Promise.all(coinTypes.map(getCoinMeta)),
  ]);

  return {
    digest,
    sender: meta.sender,
    timestampMs: meta.timestampMs,
    status: tx.status,
    gasUsed: tx.effects.gasUsed,
    gasOwner: gasOwner ? normalizeSuiAddress(gasOwner) : null,
    changedObjects: tx.effects.changedObjects,
    balanceChanges: tx.balanceChanges,
    objectTypes: tx.objectTypes,
    commands,
    originalPackages,
    coins: Object.fromEntries(coinTypes.map((t, i) => [t, coinMetas[i]])),
  };
}
