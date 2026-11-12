import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { formatAmount } from './coins';
import { lookupProtocol, lookupAction, type ProtocolInfo } from './protocols';
import { fetchSnapshot, type MoveCall, type TxSnapshot } from './snapshot';

export interface ParsedBalanceChange {
  owner: string;
  coinType: string;
  symbol: string;
  decimals: number;
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

const SUI_TYPE = normalizeType('0x2::sui::SUI');

/** Fetches a transaction from mainnet and explains it. */
export async function parseTransaction(digest: string): Promise<ParsedTransaction> {
  return explainTransaction(await fetchSnapshot(digest));
}

/** Explains a fetched transaction. Pure: no network access. */
export function explainTransaction(s: TxSnapshot): ParsedTransaction {
  const sender = s.sender ?? 'Unknown';
  const balanceChanges = parseBalanceChanges(s, sender);
  const objectChanges = parseObjectChanges(s);
  const { headline, headlineSubtext } = deriveHeadline(s, balanceChanges, objectChanges);

  return {
    digest: s.digest,
    status: s.status.success ? 'success' : 'failure',
    errorMessage: s.status.error?.message,
    sender,
    timestampMs: s.timestampMs,
    gasCostSui: formatAbs(clampToZero(netGasMist(s)), 9),
    headline,
    headlineSubtext,
    balanceChanges,
    objectChanges,
    commands: parseCommands(s),
  };
}

// ── Gas ─────────────────────────────────────────────────────────────────────

/** Net gas in MIST: computation + storage - rebate. Negative when the rebate is larger. */
function netGasMist(s: TxSnapshot): bigint {
  const g = s.gasUsed;
  return BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
}

/** Net gas the sender paid. Zero for sponsored transactions, where someone else paid. */
function gasPaidBySender(s: TxSnapshot): bigint {
  if (!s.sender || !s.gasOwner) return 0n;
  return normalizeSuiAddress(s.gasOwner) === normalizeSuiAddress(s.sender) ? netGasMist(s) : 0n;
}

// ── Balance changes ──────────────────────────────────────────────────────────

function parseBalanceChanges(s: TxSnapshot, sender: string): ParsedBalanceChange[] {
  const senderNorm = sender.startsWith('0x') ? normalizeSuiAddress(sender) : sender;
  return s.balanceChanges
    // Only show changes for the sender's wallet
    .filter((c) => normalizeSuiAddress(c.address) === senderNorm)
    .map((c) => {
      const meta = s.coins[c.coinType] ?? { symbol: '?', decimals: 9, name: '?' };
      const raw = BigInt(c.amount);
      return {
        owner: sender,
        coinType: c.coinType,
        symbol: meta.symbol,
        decimals: meta.decimals,
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

/**
 * Token flows for the headline. The sender's SUI change includes the gas fee, so a
 * 20 SUI swap shows as -20.0014 SUI. Add the fee back to get the amount the user
 * actually moved. Drop SUI if only gas was spent.
 *
 * The token-changes card still shows the real wallet change, fee included.
 */
function flowsExcludingGas(s: TxSnapshot, changes: ParsedBalanceChange[]): ParsedBalanceChange[] {
  const gas = gasPaidBySender(s);
  return changes.flatMap((b) => {
    if (normalizeType(b.coinType) !== SUI_TYPE) return [b];
    const amountRaw = b.amountRaw + gas;
    if (amountRaw === 0n) return [];
    return [{ ...b, amountRaw, direction: amountRaw > 0n ? 'in' : 'out' }];
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

function parseObjectChanges(s: TxSnapshot): ParsedObjectChange[] {
  return s.changedObjects.flatMap((c): ParsedObjectChange[] => {
    const changeType = classifyChange(c);
    if (changeType === 'mutated') return []; // mutated objects are noisy

    const id = c.objectId;
    const objectType = s.objectTypes[id] ?? '';
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

// ── Move calls and protocols ─────────────────────────────────────────────────

function getMoveCalls(s: TxSnapshot): MoveCall[] {
  return (s.commands ?? []).flatMap((c) => ('MoveCall' in c ? [c.MoveCall] : []));
}

/** Original package ID for a called package. Upgraded packages have a new ID per version. */
function originalPackage(s: TxSnapshot, pkg: string): string {
  const id = normalizeSuiAddress(pkg);
  return s.originalPackages[id] ?? id;
}

function protocolOf(s: TxSnapshot, mc: MoveCall): ProtocolInfo | undefined {
  return lookupProtocol(originalPackage(s, mc.package));
}

function actionOf(s: TxSnapshot, mc: MoveCall): string | undefined {
  return lookupAction(originalPackage(s, mc.package), mc.module, mc.function);
}

// ── Commands ─────────────────────────────────────────────────────────────────

function parseCommands(s: TxSnapshot): ParsedCommand[] {
  if (!s.commands) return [];

  return s.commands.map((cmd, i) => {
    const index = i + 1;
    if ('MoveCall' in cmd) {
      const mc = cmd.MoveCall;
      const proto = protocolOf(s, mc);
      const action = actionOf(s, mc);
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
  s: TxSnapshot,
  balanceChanges: ParsedBalanceChange[],
  objChanges: ParsedObjectChange[],
): { headline: string; headlineSubtext?: string } {
  if (!s.status.success) {
    return { headline: 'Transaction Failed', headlineSubtext: s.status.error.message };
  }

  const moveCalls = getMoveCalls(s);
  const flows = flowsExcludingGas(s, balanceChanges);
  const isSui = (b: ParsedBalanceChange) => normalizeType(b.coinType) === SUI_TYPE;
  const suiOut = flows.find((b) => b.direction === 'out' && isSui(b));

  // ── Staking ──
  const stakeCall = moveCalls.find((c) => c.module === 'sui_system' && c.function.includes('stake'));
  if (stakeCall) {
    return {
      headline: suiOut ? `Staked ${formatAbs(suiOut.amountRaw, 9)} SUI` : 'Staked SUI',
      headlineSubtext: 'Delegated to a validator',
    };
  }
  const unstakeCall = moveCalls.find((c) => c.module === 'sui_system' && c.function.includes('withdraw'));
  if (unstakeCall) {
    return { headline: 'Unstaked SUI', headlineSubtext: 'Withdrew staked SUI' };
  }

  // A labeled lending or yield action with no DEX involved is not a swap, even if the
  // sender gave one token and got another (for example USDC in, sUSDC receipt out).
  const dex = findDexName(s);
  const labeled = findLabeledCall(s, moveCalls);
  if (labeled && !dex) return actionHeadline(s, labeled);

  // ── Swap: sender lost one coin type and gained another ──
  const outCoins = flows.filter((b) => b.direction === 'out' && !isSui(b));
  const inCoins = flows.filter((b) => b.direction === 'in');

  // Swap SUI → other
  if (suiOut && inCoins.length === 1 && outCoins.length === 0) {
    const got = inCoins[0];
    return {
      headline: `Swapped ${formatAbs(suiOut.amountRaw, 9)} SUI for ${formatAbs(got.amountRaw, got.decimals)} ${got.symbol}`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }
  // Swap other → SUI
  if (outCoins.length === 1 && inCoins.length === 1 && isSui(inCoins[0])) {
    const sold = outCoins[0];
    const got = inCoins[0];
    return {
      headline: `Swapped ${formatAbs(sold.amountRaw, sold.decimals)} ${sold.symbol} for ${formatAbs(got.amountRaw, 9)} SUI`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }
  // Swap token → token
  if (outCoins.length === 1 && inCoins.length === 1) {
    const sold = outCoins[0];
    const got = inCoins[0];
    return {
      headline: `Swapped ${sold.symbol} for ${got.symbol}`,
      headlineSubtext: dex ? `via ${dex}` : undefined,
    };
  }

  // ── Simple SUI transfer ──
  if (s.commands) {
    const onlyTransfers = s.commands.every((c) => 'TransferObjects' in c || 'SplitCoins' in c);
    const transferred = s.commands.filter((c) => 'TransferObjects' in c);
    if (onlyTransfers && transferred.length > 0 && suiOut && inCoins.length === 0) {
      return {
        headline: `Sent ${formatAbs(suiOut.amountRaw, 9)} SUI`,
        headlineSubtext: 'Transfer to another wallet',
      };
    }
  }

  // ── Labeled protocol action (for example "Open position on Cetus") ──
  if (labeled) return actionHeadline(s, labeled);

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
  const mc = pickHeadlineCall(s, moveCalls);
  if (mc) {
    const proto = protocolOf(s, mc);
    if (proto) return { headline: `Interacted with ${proto.name}`, headlineSubtext: `${mc.module}::${mc.function}` };
    return {
      headline: `Called ${mc.module}::${mc.function}`,
      headlineSubtext: `on ${shortAddress(mc.package)}`,
    };
  }

  return { headline: 'Transaction Executed' };
}

function isNonSystemProtocol(s: TxSnapshot, mc: MoveCall): boolean {
  const proto = protocolOf(s, mc);
  return proto !== undefined && proto.category !== 'system';
}

/** First call with a human label, from a non-system protocol. */
function findLabeledCall(s: TxSnapshot, calls: MoveCall[]): MoveCall | undefined {
  return calls.find((mc) => isNonSystemProtocol(s, mc) && actionOf(s, mc) !== undefined);
}

function actionHeadline(s: TxSnapshot, mc: MoveCall): { headline: string; headlineSubtext?: string } {
  return { headline: actionOf(s, mc)!, headlineSubtext: protocolOf(s, mc)?.name };
}

/**
 * Picks the Move call to describe when no rule matched and no call has a label.
 * The first call is often a helper (for example `0x1::option::some`), so prefer, in order:
 * 1. any call to a known non-system protocol
 * 2. any call outside the system packages
 * 3. the first call
 */
function pickHeadlineCall(s: TxSnapshot, calls: MoveCall[]): MoveCall | undefined {
  return (
    calls.find((mc) => isNonSystemProtocol(s, mc)) ??
    calls.find((mc) => !SYSTEM_PACKAGES.has(normalizeSuiAddress(mc.package))) ??
    calls[0]
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Name for "via …". Aggregators wrap each other and the DEXes they route to
 * (7K settles a swap routed through the Cetus Aggregator router), and the
 * outermost one runs last. So: the last aggregator call, else the first DEX call.
 */
function findDexName(s: TxSnapshot): string | undefined {
  const dexes = getMoveCalls(s)
    .map((mc) => protocolOf(s, mc))
    .filter((p): p is ProtocolInfo => p?.category === 'dex');
  return dexes.filter((p) => p.aggregator).at(-1)?.name ?? dexes[0]?.name;
}

// GraphQL returns fully padded type names ("0x000…0002::coin::Coin"), unlike JSON-RPC ("0x2::coin::Coin").
const SYSTEM_PACKAGES = new Set(['0x1', '0x2', '0x3'].map((a) => normalizeSuiAddress(a)));

function isSystemType(objectType: string): boolean {
  const pkg = objectType.split('::')[0];
  return pkg.startsWith('0x') && SYSTEM_PACKAGES.has(normalizeSuiAddress(pkg));
}

/** "0x2::sui::SUI" -> "0x000…0002::sui::SUI", so coin types compare equal in either spelling. */
function normalizeType(type: string): string {
  const [pkg, ...rest] = type.split('::');
  return pkg.startsWith('0x') ? [normalizeSuiAddress(pkg), ...rest].join('::') : type;
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

function clampToZero(n: bigint): bigint {
  return n < 0n ? 0n : n;
}

function formatAbs(raw: bigint, decimals: number): string {
  const abs = raw < 0n ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
