import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainTransaction } from '../lib/parser';
import { lookupAction, lookupProtocol } from '../lib/protocols';
import type { TxSnapshot } from '../lib/snapshot';

// Fixtures are real mainnet transactions saved by `npm run fixtures`.
function fixture(name: string): TxSnapshot {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}

function explain(name: string) {
  return explainTransaction(fixture(name));
}

describe('swaps', () => {
  it('uses the received token decimals (USDC has 6) and excludes gas from the SUI amount', () => {
    // Wallet change: -20.001423299 SUI, of which 0.001423299 is the fee.
    const tx = explain('swap-sui-to-usdc');
    expect(tx.headline).toBe('Swapped 20 SUI for 16.417388 USDC');
    expect(tx.headlineSubtext).toBe('via Bluefin');
    expect(tx.gasCostSui).toBe('0.001423299');
  });

  it('keeps the real wallet change, fee included, in the token list', () => {
    const tx = explain('swap-sui-to-usdc');
    expect(tx.balanceChanges.map((b) => b.amountFormatted)).toEqual(['−20.001423299 SUI', '+16.417388 USDC']);
  });

  it('handles a 9-decimal token with no known DEX', () => {
    const tx = explain('swap-sui-to-wal');
    expect(tx.headline).toBe('Swapped 45.630225338 SUI for 1365.167969987 WAL');
    expect(tx.headlineSubtext).toBeUndefined();
  });

  it('adds the fee back to SUI received in a token -> SUI swap', () => {
    // Wallet got +0.053777971 SUI after paying a 0.000103484 fee.
    const tx = explain('swap-wal-to-sui-7k');
    expect(tx.headline).toBe('Swapped 1.59376 WAL for 0.053881455 SUI');
  });

  it('credits the outermost aggregator (7K wraps the Cetus Aggregator router)', () => {
    expect(explain('swap-7k-aggregator').headlineSubtext).toBe('via 7K Aggregator');
    expect(explain('swap-wal-to-sui-7k').headlineSubtext).toBe('via 7K Aggregator');
  });
});

describe('transfers and staking', () => {
  it('excludes gas from a SUI transfer', () => {
    // Wallet change -24.385325153 SUI, fee 0.001088099.
    const tx = explain('transfer-sui');
    expect(tx.headline).toBe('Sent 24.384237054 SUI');
    expect(tx.headlineSubtext).toBe('Transfer to another wallet');
  });

  it('does not subtract gas when someone else paid it (sponsored transaction)', () => {
    const s = fixture('transfer-sui');
    const sponsored = { ...s, gasOwner: '0x' + 'ab'.repeat(32) };
    expect(explainTransaction(sponsored).headline).toBe('Sent 24.385325153 SUI');
  });

  it('excludes gas from the staked amount', () => {
    // Wallet change -7622.779540129 SUI, fee 0.001482809.
    const tx = explain('stake-sui');
    expect(tx.headline).toBe('Staked 7622.77805732 SUI');
    expect(tx.commands.map((c) => c.label)).toEqual(['Split coin into 1 piece', 'Stake SUI']);
  });
});

describe('protocol actions', () => {
  it('skips helper calls like 0x1::option::some and finds the AlphaFi deposit', () => {
    const tx = explain('alphafi-deposit');
    expect(tx.headline).toBe('Deposit into an AlphaFi vault');
    expect(tx.headlineSubtext).toBe('AlphaFi');
  });

  it('labels a Scallop deposit as a deposit, not a USDC -> sUSDC swap', () => {
    const tx = explain('scallop-deposit');
    expect(tx.headline).toBe('Deposit on Scallop');
    expect(tx.headlineSubtext).toBe('Scallop');
  });

  it('labels Suilend and Navi deposits', () => {
    expect(explain('suilend-deposit').headline).toBe('Deposit on Suilend');
    expect(explain('navi-deposit').headline).toBe('Deposit on Navi');
  });

  it('prefers a labeled action over the generic "Minted X" rule', () => {
    // Opening a Cetus position creates a Position object, which is not an NFT mint.
    const tx = explain('sponsored');
    expect(tx.headline).toBe('Open position on Cetus');
    expect(tx.headlineSubtext).toBe('Cetus');
  });
});

describe('edge cases', () => {
  it('reports a failed transaction with its error', () => {
    const tx = explain('failed');
    expect(tx.status).toBe('failure');
    expect(tx.headline).toBe('Transaction Failed');
    expect(tx.errorMessage).toMatch(/linkage/);
  });

  it('handles a system transaction with no sender and no commands', () => {
    const tx = explain('system-tx');
    expect(tx.sender).toBe('Unknown');
    expect(tx.commands).toEqual([]);
    expect(tx.headline).toBe('Transaction Executed');
  });

  it('shows a zero fee when the storage rebate exceeds the cost', () => {
    // Scallop fixture: 115000 + 338162000 - 340651131 < 0.
    expect(explain('scallop-deposit').gasCostSui).toBe('0');
  });
});

describe('protocol registry', () => {
  it('matches short and padded system addresses', () => {
    expect(lookupProtocol('0x2')?.name).toBe('Sui Framework');
    expect(lookupProtocol('0x' + '0'.repeat(63) + '2')?.name).toBe('Sui Framework');
  });

  it('labels a call to an upgraded package through its original ID', () => {
    // The Navi transaction calls an upgraded package version, not the original ID.
    const s = fixture('navi-deposit');
    const called = s.commands!.flatMap((c) => ('MoveCall' in c ? [c.MoveCall.package] : []));
    const upgraded = called.find((p) => s.originalPackages[p] && s.originalPackages[p] !== p);
    expect(upgraded).toBeDefined();
    expect(lookupProtocol(upgraded!)).toBeUndefined();
    expect(lookupAction(s.originalPackages[upgraded!], 'incentive_v3', 'entry_deposit')).toBe('Deposit on Navi');
  });
});
