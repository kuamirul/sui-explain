import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { suiClient, getTransactionMeta } from './sui';
import { getCoinMeta, formatAmount } from './coins';
import { lookupProtocol, lookupAction } from './protocols';

export interface ParsedBalanceChange {
  owner: string;
  coinType: string;
  symbol: string;
  amountFormatted: string;
  amountRaw: bigint;
  direction: 'in' | 'out';
}

export interface ParsedObjectChange {
  changeType: 'created' | 'mutated' | 'deleted' | 'transferred' | 'wrapped' | 'published' | 'other';
  objectType: string;
  objectId: string;
  label: string;
  recipient?: string;
}

export interface ParsedCommand {
  index: number;
  label: string;
  detail?: string;
}

export interface ParsedTransaction {
  digest: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  sender: string;
  timestampMs: string | null;
  gasCostSui: string;
  headline: string;
  headlineSubtext?: string;
  balanceChanges: ParsedBalanceChange[];
  objectChanges: ParsedObjectChange[];
  commands: ParsedCommand[];
}

// ── Fetching ─────────────────────────────────────────────────────────────────

type Command = SuiClientTypes.TransactionData['commands'][number];
type MoveCall = Extract<Command, { MoveCall: unknown }>['MoveCall'];

// Normalized view of a transaction, independent of the API transport.
interface RawTx {
  status: SuiClientTypes.ExecutionStatus;
  effects: SuiClientTypes.TransactionEffects;
  balanceChanges: SuiClientTypes.BalanceChange[];
  objectTypes: Record<string, string>;
  // null for non-programmable (system) transactions
  commands: Command[] | null;
}

const NOT_PROGRAMMABLE = 'Only programmable transactions are supported';

async function fetchRawTx(digest: string): Promise<RawTx> {
  const base = { effects: true, balanceChanges: true, objectTypes: true } as const;
  try {
    const res = await suiClient.core.getTransaction({ digest, include: { ...base, transaction: true } });
    const tx = res.Transaction ?? res.FailedTransaction;
    return { ...tx, commands: tx.transaction.commands };
  } catch (err) {
    // The SDK cannot decode system transactions (e.g. epoch change). Load them without commands.
    if (!(err instanceof Error) || !err.message.includes(NOT_PROGRAMMABLE)) throw err;
    const res = await suiClient.core.getTransaction({ digest, include: base });
    const tx = res.Transaction ?? res.FailedTransaction;
    return { ...tx, commands: null };
  }
}

export async function parseTransaction(digest: string): Promise<ParsedTransaction> {
  const [raw, meta] = await Promise.all([fetchRawTx(digest), getTransactionMeta(digest)]);

  const sender = meta.sender ?? 'Unknown';
  const status = raw.status.success ? 'success' : 'failure';
  const errorMessage = raw.status.error?.message;

  const gasCostSui = calcGasSui(raw);
  const balanceChanges = await parseBalanceChanges(raw.balanceChanges, sender);
  const objectChanges = parseObjectChanges(raw);
  const commands = parseCommands(raw);
  const { headline, headlineSubtext } = deriveHeadline(raw, balanceChanges, objectChanges);

  return {
    digest,
    status,
    errorMessage,
    sender,
    timestampMs: meta.timestampMs,
    gasCostSui,
    headline,
    headlineSubtext,
    balanceChanges,
    objectChanges,
    commands,
  };
}

// ── Gas ─────────────────────────────────────────────────────────────────────

function calcGasSui(raw: RawTx): string {
  const g = raw.effects.gasUsed;
  const total =
    BigInt(g.computationCost) +
    BigInt(g.storageCost) -
    BigInt(g.storageRebate);
  const abs = total < 0n ? 0n : total;
  const whole = abs / 1_000_000_000n;
  const frac = (abs % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// ── Balance changes ──────────────────────────────────────────────────────────

async function parseBalanceChanges(
  changes: SuiClientTypes.BalanceChange[],
  sender: string,
): Promise<ParsedBalanceChange[]> {
  // Dedupe coin types for batch metadata fetch
  const coinTypes = [...new Set(changes.map((c) => c.coinType))];
  const metas = await Promise.all(coinTypes.map(getCoinMeta));
  const metaMap = Object.fromEntries(coinTypes.map((t, i) => [t, metas[i]]));

  const senderNorm = sender.startsWith('0x') ? normalizeSuiAddress(sender) : sender;
  return changes
    // Only show changes for the sender's wallet
    .filter((c) => normalizeSuiAddress(c.address) === senderNorm)
    .map((c) => {
      const meta = metaMap[c.coinType] ?? { symbol: '?', decimals: 9, name: '?' };
      const raw = BigInt(c.amount);
      return {
        owner: sender,
        coinType: c.coinType,
        symbol: meta.symbol,
        amountFormatted: formatAmount(c.amount, meta.decimals, meta.symbol),
        amountRaw: raw,
        direction: (raw >= 0n ? 'in' : 'out') as 'in' | 'out',
      };
    })
    .sort((a, b) => {
      // Show outgoing first, then incoming
      if (a.direction === b.direction) return 0;
      return a.direction === 'out' ? -1 : 1;
    });
}

// ── Object changes ───────────────────────────────────────────────────────────

// The GraphQL/gRPC APIs return raw effects instead of JSON-RPC "objectChanges".
// Classify each changed object the same way JSON-RPC did.
function classifyChange(c: SuiClientTypes.ChangedObject): ParsedObjectChange['changeType'] | 'mutated' {
  if (c.outputState === 'PackageWrite') return c.idOperation === 'Created' ? 'published' : 'mutated';
  if (c.idOperation === 'Created') return 'created';
  if (c.idOperation === 'Deleted') return 'deleted';
  if (c.inputState === 'Exists' && c.outputState === 'DoesNotExist') return 'wrapped';
  if (c.inputState === 'Exists' && c.outputState === 'ObjectWrite') {
    const before = c.inputOwner?.AddressOwner;
    const after = c.outputOwner?.AddressOwner;
    if (after && before !== after) return 'transferred';
  }
  // Unwrapped objects, accumulator writes and plain mutations are noise for this view.
  return 'mutated';
}

function parseObjectChanges(raw: RawTx): ParsedObjectChange[] {
  return raw.effects.changedObjects.flatMap((c): ParsedObjectChange[] => {
    const changeType = classifyChange(c);
    if (changeType === 'mutated') return []; // mutated objects are noisy

    const id = c.objectId;
    const objectType = raw.objectTypes[id] ?? '';
    const typeName = shortObjectType(objectType);

    switch (changeType) {
      case 'created':
        return [{ changeType, objectType, objectId: id, label: `Created ${typeName}` }];
      case 'deleted':
        return [{ changeType, objectType, objectId: id, label: `Consumed ${typeName}` }];
      case 'transferred': {
        const recipient = c.outputOwner?.AddressOwner ?? undefined;
        return [{
          changeType,
          objectType,
          objectId: id,
          label: `Transferred ${typeName}${recipient ? ` to ${shortAddress(recipient)}` : ''}`,
          recipient,
        }];
      }
      case 'wrapped':
        return [{ changeType, objectType, objectId: id, label: `Deposited ${typeName} into protocol` }];
      case 'published':
        return [{ changeType, objectType: 'Move Package', objectId: id, label: `Published new Move package ${shortAddress(id)}` }];
      default:
        return [{ changeType: 'other', objectType: '', objectId: id, label: `Object change: ${shortAddress(id)}` }];
    }
  });
}

// ── Type guards ──────────────────────────────────────────────────────────────

function getMoveCallsFrom(commands: Command[] | null): MoveCall[] {
  return (commands ?? []).flatMap((c) => ('MoveCall' in c ? [c.MoveCall] : []));
}

// ── Commands ─────────────────────────────────────────────────────────────────

function parseCommands(raw: RawTx): ParsedCommand[] {
  if (!raw.commands) return [];

  return raw.commands.map((cmd, i) => {
    const index = i + 1;
    if ('MoveCall' in cmd) {
      const mc = cmd.MoveCall;
      const proto = lookupProtocol(mc.package);
      const action = lookupAction(mc.package, mc.module, mc.function);
      const label = action ?? (proto ? `${proto.name}: ${mc.module}::${mc.function}` : `${mc.module}::${mc.function}`);
      return { index, label, detail: `${shortAddress(mc.package)}::${mc.module}::${mc.function}` };
    }
    if ('TransferObjects' in cmd) {
      const count = cmd.TransferObjects.objects.length;
      return { index, label: `Transfer ${count} object${count !== 1 ? 's' : ''} to recipient` };
    }
    if ('SplitCoins' in cmd) {
      const count = cmd.SplitCoins.amounts.length;
      return { index, label: `Split coin into ${count} piece${count !== 1 ? 's' : ''}` };
    }
    if ('MergeCoins' in cmd) {
      const count = cmd.MergeCoins.sources.length;
      return { index, label: `Merge ${count} coin${count !== 1 ? 's' : ''} together` };
    }
    if ('Publish' in cmd) {
      return { index, label: 'Publish new Move package' };
    }
    if ('Upgrade' in cmd) {
      return { index, label: `Upgrade Move package ${shortAddress(cmd.Upgrade.package)}` };
    }
    if ('MakeMoveVec' in cmd) {
      return { index, label: 'Build vector of objects' };
    }
    return { index, label: 'Unknown command' };
  });
}

// ── Headline ─────────────────────────────────────────────────────────────────

function deriveHeadline(
  raw: RawTx,
  balanceChanges: ParsedBalanceChange[],
  objChanges: ParsedObjectChange[],
): { headline: string; headlineSubtext?: string } {
  if (!raw.status.success) {
    return { headline: 'Transaction Failed', headlineSubtext: raw.status.error.message };
  }

  const moveCalls = getMoveCallsFrom(raw.commands);

  // ── Staking ──
  const stakeCall = moveCalls.find((c) => c.module === 'sui_system' && c.function.includes('stake'));
  if (stakeCall) {
    const suiOut = balanceChanges.find((b) => b.direction === 'out' && b.symbol === 'SUI');
    return {
      headline: suiOut ? `Staked ${formatAbs(suiOut.amountRaw, 9)} SUI` : 'Staked SUI',
      headlineSubtext: 'Delegated to a validator',
    };
  }
  const unstakeCall = moveCalls.find((c) => c.module === 'sui_system' && c.function.includes('withdraw'));
  if (unstakeCall) {
    return { headline: 'Unstaked SUI', headlineSubtext: 'Withdrew staked SUI' };
  }

  // ── Swap: sender lost one coin type and gained another ──
  const outCoins = balanceChanges.filter((b) => b.direction === 'out' && b.symbol !== 'SUI');
  const inCoins = balanceChanges.filter((b) => b.direction === 'in');
  const suiOut = balanceChanges.find((b) => b.direction === 'out' && b.symbol === 'SUI');

  // Swap SUI → other
  if (suiOut && inCoins.length === 1 && outCoins.length === 0) {
    const dex = findDexName(raw);
    const got = inCoins[0];
    return {
      headline: `Swapped ${formatAbs(suiOut.amountRaw, 9)} SUI for ${formatAbs(got.amountRaw, 9)} ${got.symbol}`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }
  // Swap other → SUI
  if (outCoins.length === 1 && inCoins.length === 1 && inCoins[0].symbol === 'SUI') {
    const dex = findDexName(raw);
    const sold = outCoins[0];
    const got = inCoins[0];
    return {
      headline: `Swapped ${formatAbs(sold.amountRaw, sold.symbol === 'SUI' ? 9 : guessDecimals(sold))} ${sold.symbol} for ${formatAbs(got.amountRaw, 9)} SUI`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }
  // Swap token → token
  if (outCoins.length === 1 && inCoins.length === 1) {
    const dex = findDexName(raw);
    const sold = outCoins[0];
    const got = inCoins[0];
    return {
      headline: `Swapped ${sold.symbol} for ${got.symbol}`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }

  // ── Simple SUI transfer ──
  if (raw.commands) {
    const onlyTransfers = raw.commands.every((c) => 'TransferObjects' in c || 'SplitCoins' in c);
    const transferred = raw.commands.filter((c) => 'TransferObjects' in c);
    if (onlyTransfers && transferred.length > 0 && suiOut && inCoins.length === 0) {
      return {
        headline: `Sent ${formatAbs(suiOut.amountRaw, 9)} SUI`,
        headlineSubtext: 'Transfer to another wallet',
      };
    }
  }

  // ── NFT mint (created objects that aren't system types) ──
  const created = objChanges.filter((o) => o.changeType === 'created' && !isSystemType(o.objectType));
  if (created.length > 0) {
    const typeName = shortObjectType(created[0].objectType);
    return { headline: `Minted ${typeName}`, headlineSubtext: created.length > 1 ? `${created.length} objects created` : undefined };
  }

  // ── Published package ──
  const published = objChanges.find((o) => o.changeType === 'published');
  if (published) {
    return { headline: 'Published Move Package', headlineSubtext: 'Deployed new smart contract' };
  }

  // ── Protocol call fallback ──
  if (moveCalls.length > 0) {
    const mc = moveCalls[0];
    const proto = lookupProtocol(mc.package);
    const action = lookupAction(mc.package, mc.module, mc.function);
    if (action) return { headline: action, headlineSubtext: proto?.name };
    if (proto) return { headline: `Interacted with ${proto.name}`, headlineSubtext: `${mc.module}::${mc.function}` };
    return {
      headline: `Called ${mc.module}::${mc.function}`,
      headlineSubtext: `on ${shortAddress(mc.package)}`,
    };
  }

  return { headline: 'Transaction Executed' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findDexName(raw: RawTx): string | undefined {
  for (const mc of getMoveCallsFrom(raw.commands)) {
    const proto = lookupProtocol(mc.package);
    if (proto?.category === 'dex') return proto.name;
  }
  return undefined;
}

// GraphQL returns fully padded type names ("0x000…0002::coin::Coin"), unlike JSON-RPC ("0x2::coin::Coin").
const SYSTEM_PACKAGES = new Set(['0x1', '0x2', '0x3'].map((a) => normalizeSuiAddress(a)));

function isSystemType(objectType: string): boolean {
  const pkg = objectType.split('::')[0];
  return pkg.startsWith('0x') && SYSTEM_PACKAGES.has(normalizeSuiAddress(pkg));
}

function shortAddress(addr: string): string {
  if (!addr) return '';
  const hex = addr.replace(/^0x/, '');
  if (hex.length <= 8) return addr;
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

function shortObjectType(objectType: string): string {
  // "0xabc::module::TypeName<...>" → "TypeName"
  const match = objectType.match(/::([A-Za-z0-9_]+)(?:<|$)/);
  return match?.[1] ?? objectType.split('::').pop() ?? objectType;
}

function formatAbs(raw: bigint, decimals: number): string {
  const abs = raw < 0n ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function guessDecimals(b: ParsedBalanceChange): number {
  // Try to derive from the formatted amount as fallback
  const match = b.amountFormatted.match(/[+−][\d]+\.(\d+)/);
  return match ? match[1].length : 9;
}
