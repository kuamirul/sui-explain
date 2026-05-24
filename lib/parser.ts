import type {
  SuiTransactionBlockResponse,
  SuiObjectChange,
  BalanceChange,
  MoveCallSuiTransaction,
  SuiTransaction,
} from '@mysten/sui/jsonRpc';
import { suiClient } from './sui';
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

export async function parseTransaction(digest: string): Promise<ParsedTransaction> {
  const raw = await suiClient.getTransactionBlock({
    digest,
    options: {
      showInput: true,
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
      showBalanceChanges: true,
    },
  });

  const sender = raw.transaction?.data.sender ?? 'Unknown';
  const status = raw.effects?.status.status === 'success' ? 'success' : 'failure';
  const errorMessage = raw.effects?.status.error;

  const gasCostSui = calcGasSui(raw);
  const balanceChanges = await parseBalanceChanges(raw.balanceChanges ?? [], sender);
  const objectChanges = parseObjectChanges(raw.objectChanges ?? []);
  const commands = parseCommands(raw);
  const { headline, headlineSubtext } = deriveHeadline(raw, balanceChanges, commands, sender);

  return {
    digest,
    status,
    errorMessage,
    sender,
    timestampMs: raw.timestampMs ?? null,
    gasCostSui,
    headline,
    headlineSubtext,
    balanceChanges,
    objectChanges,
    commands,
  };
}

// ── Gas ─────────────────────────────────────────────────────────────────────

function calcGasSui(raw: SuiTransactionBlockResponse): string {
  const g = raw.effects?.gasUsed;
  if (!g) return '0';
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
  changes: BalanceChange[],
  sender: string,
): Promise<ParsedBalanceChange[]> {
  // Dedupe coin types for batch metadata fetch
  const coinTypes = [...new Set(changes.map((c) => c.coinType))];
  const metas = await Promise.all(coinTypes.map(getCoinMeta));
  const metaMap = Object.fromEntries(coinTypes.map((t, i) => [t, metas[i]]));

  return changes
    .filter((c) => {
      // Only show changes for the sender's wallet
      const owner = c.owner;
      if (typeof owner === 'string') return false;
      if ('AddressOwner' in owner) return owner.AddressOwner === sender;
      return false;
    })
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

function parseObjectChanges(changes: SuiObjectChange[]): ParsedObjectChange[] {
  return changes
    .filter((c) => c.type !== 'mutated') // mutated objects are noisy
    .map((c) => {
      const id = 'objectId' in c ? c.objectId : 'packageId' in c ? c.packageId : '';
      const shortId = shortAddress(id);

      switch (c.type) {
        case 'created': {
          const typeName = shortObjectType(c.objectType);
          return { changeType: 'created', objectType: c.objectType, objectId: id, label: `Created ${typeName}` };
        }
        case 'deleted': {
          const typeName = shortObjectType(c.objectType);
          return { changeType: 'deleted', objectType: c.objectType, objectId: id, label: `Consumed ${typeName}` };
        }
        case 'transferred': {
          const typeName = shortObjectType(c.objectType);
          const recipient = 'recipient' in c && c.recipient ? recipientAddress(c.recipient) : undefined;
          return {
            changeType: 'transferred',
            objectType: c.objectType,
            objectId: id,
            label: `Transferred ${typeName}${recipient ? ` to ${shortAddress(recipient)}` : ''}`,
            recipient,
          };
        }
        case 'wrapped': {
          const typeName = shortObjectType(c.objectType);
          return { changeType: 'wrapped', objectType: c.objectType, objectId: id, label: `Deposited ${typeName} into protocol` };
        }
        case 'published':
          return { changeType: 'published', objectType: 'Move Package', objectId: id, label: `Published new Move package ${shortId}` };
        default:
          return { changeType: 'other', objectType: '', objectId: id, label: `Object change: ${shortId}` };
      }
    });
}

function recipientAddress(recipient: unknown): string {
  if (typeof recipient === 'string') return recipient;
  if (typeof recipient === 'object' && recipient !== null) {
    if ('AddressOwner' in recipient) return (recipient as { AddressOwner: string }).AddressOwner;
    if ('ObjectOwner' in recipient) return (recipient as { ObjectOwner: string }).ObjectOwner;
  }
  return '';
}

// ── Type guards ──────────────────────────────────────────────────────────────

function isMoveCall(cmd: SuiTransaction): cmd is { MoveCall: MoveCallSuiTransaction } {
  return 'MoveCall' in cmd;
}

function getMoveCall(cmd: SuiTransaction): MoveCallSuiTransaction | null {
  return isMoveCall(cmd) ? cmd.MoveCall : null;
}

function getMoveCallsFrom(txList: SuiTransaction[]): MoveCallSuiTransaction[] {
  return txList.flatMap((t) => (isMoveCall(t) ? [t.MoveCall] : []));
}

// ── Commands ─────────────────────────────────────────────────────────────────

function parseCommands(raw: SuiTransactionBlockResponse): ParsedCommand[] {
  const tx = raw.transaction?.data.transaction;
  if (!tx || tx.kind !== 'ProgrammableTransaction') return [];

  return tx.transactions.map((cmd, i) => {
    const mc = getMoveCall(cmd);
    if (mc) {
      const proto = lookupProtocol(mc.package);
      const action = lookupAction(mc.package, mc.module, mc.function);
      const label = action ?? (proto ? `${proto.name}: ${mc.module}::${mc.function}` : `${mc.module}::${mc.function}`);
      return {
        index: i + 1,
        label,
        detail: `${shortAddress(mc.package)}::${mc.module}::${mc.function}`,
      };
    }
    if ('TransferObjects' in cmd) {
      // TransferObjects: [objects[], recipient]
      const count = cmd.TransferObjects[0].length;
      return { index: i + 1, label: `Transfer ${count} object${count !== 1 ? 's' : ''} to recipient` };
    }
    if ('SplitCoins' in cmd) {
      // SplitCoins: [coin, amounts[]]
      const count = cmd.SplitCoins[1].length;
      return { index: i + 1, label: `Split coin into ${count} piece${count !== 1 ? 's' : ''}` };
    }
    if ('MergeCoins' in cmd) {
      // MergeCoins: [destination, sources[]]
      const count = cmd.MergeCoins[1].length;
      return { index: i + 1, label: `Merge ${count} coin${count !== 1 ? 's' : ''} together` };
    }
    if ('Publish' in cmd) {
      return { index: i + 1, label: 'Publish new Move package' };
    }
    if ('Upgrade' in cmd) {
      // Upgrade: [modules[], packageId, ticket]
      const pkgId = cmd.Upgrade[1];
      return { index: i + 1, label: `Upgrade Move package ${shortAddress(pkgId)}` };
    }
    if ('MakeMoveVec' in cmd) {
      return { index: i + 1, label: 'Build vector of objects' };
    }
    return { index: i + 1, label: 'Unknown command' };
  });
}

// ── Headline ─────────────────────────────────────────────────────────────────

function deriveHeadline(
  raw: SuiTransactionBlockResponse,
  balanceChanges: ParsedBalanceChange[],
  commands: ParsedCommand[],
  sender: string,
): { headline: string; headlineSubtext?: string } {
  if (raw.effects?.status.status !== 'success') {
    return { headline: 'Transaction Failed', headlineSubtext: raw.effects?.status.error };
  }

  const tx = raw.transaction?.data.transaction;

  // ── Staking ──
  if (tx?.kind === 'ProgrammableTransaction') {
    const calls = getMoveCallsFrom(tx.transactions);
    const stakeCall = calls.find((c) => c.module === 'sui_system' && c.function.includes('stake'));
    if (stakeCall) {
      const suiOut = balanceChanges.find((b) => b.direction === 'out' && b.symbol === 'SUI');
      return {
        headline: suiOut ? `Staked ${formatAbs(suiOut.amountRaw, 9)} SUI` : 'Staked SUI',
        headlineSubtext: 'Delegated to a validator',
      };
    }
    const unstakeCall = calls.find((c) => c.module === 'sui_system' && c.function.includes('withdraw'));
    if (unstakeCall) {
      return { headline: 'Unstaked SUI', headlineSubtext: 'Withdrew staked SUI' };
    }
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
  if (tx?.kind === 'ProgrammableTransaction') {
    const txList = tx.transactions;
    const onlyTransfers = txList.every((t) => 'TransferObjects' in t || 'SplitCoins' in t);
    const transferred = txList.filter((t) => 'TransferObjects' in t);
    if (onlyTransfers && transferred.length > 0 && suiOut && inCoins.length === 0) {
      return {
        headline: `Sent ${formatAbs(suiOut.amountRaw, 9)} SUI`,
        headlineSubtext: 'Transfer to another wallet',
      };
    }
  }

  // ── NFT mint (created objects that aren't system types) ──
  const objChanges = parseObjectChanges(raw.objectChanges ?? []);
  const created = objChanges.filter((o) => o.changeType === 'created' && !o.objectType.startsWith('0x2::') && !o.objectType.startsWith('0x3::'));
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
  if (tx?.kind === 'ProgrammableTransaction') {
    const moveCalls = getMoveCallsFrom(tx.transactions);
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
  }

  return { headline: 'Transaction Executed' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findDexName(raw: SuiTransactionBlockResponse): string | undefined {
  const tx = raw.transaction?.data.transaction;
  if (tx?.kind !== 'ProgrammableTransaction') return undefined;
  for (const cmd of tx.transactions) {
    const mc = getMoveCall(cmd);
    if (mc) {
      const proto = lookupProtocol(mc.package);
      if (proto?.category === 'dex') return proto.name;
    }
  }
  return undefined;
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
