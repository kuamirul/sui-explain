import { suiClient } from './sui';

export interface CoinMeta {
  symbol: string;
  decimals: number;
  name: string;
}

// Pre-populate well-known coins to avoid RPC calls
const KNOWN_COINS: Record<string, CoinMeta> = {
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI': {
    symbol: 'SUI',
    decimals: 9,
    name: 'Sui',
  },
  '0x2::sui::SUI': {
    symbol: 'SUI',
    decimals: 9,
    name: 'Sui',
  },
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': {
    symbol: 'wUSDC',
    decimals: 6,
    name: 'Wrapped USDC (Wormhole)',
  },
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT': {
    symbol: 'vSUI',
    decimals: 9,
    name: 'Volo Staked SUI',
  },
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': {
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin (Native)',
  },
  '0xb231fcda8bbddb31f2ef02e6161444aec64a514e2c89279584ac9806ce9cf037::coin::COIN': {
    symbol: 'wUSDT',
    decimals: 6,
    name: 'Tether USD (Wormhole)',
  },
  '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN': {
    symbol: 'wETH',
    decimals: 8,
    name: 'Wrapped Ether (Wormhole)',
  },
  '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK': {
    symbol: 'BUCK',
    decimals: 9,
    name: 'Bucket USD',
  },
};

const cache = new Map<string, CoinMeta>(Object.entries(KNOWN_COINS));

export async function getCoinMeta(coinType: string): Promise<CoinMeta> {
  const normalized = normalizeCoinType(coinType);

  if (cache.has(normalized)) return cache.get(normalized)!;

  try {
    const { coinMetadata: meta } = await suiClient.core.getCoinMetadata({ coinType: normalized });
    if (meta) {
      const result: CoinMeta = {
        symbol: meta.symbol,
        decimals: meta.decimals,
        name: meta.name,
      };
      cache.set(normalized, result);
      return result;
    }
  } catch {
    // Fall through to default
  }

  // Fallback: derive symbol from the type string
  const parts = normalized.split('::');
  const fallback: CoinMeta = {
    symbol: parts[parts.length - 1] ?? 'UNKNOWN',
    decimals: 9,
    name: parts[parts.length - 1] ?? 'Unknown',
  };
  cache.set(normalized, fallback);
  return fallback;
}

export function formatAmount(raw: string | bigint, decimals: number, symbol: string): string {
  const n = typeof raw === 'bigint' ? raw : BigInt(raw);
  const abs = n < 0n ? -n : n;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = abs % divisor;

  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const value = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  const sign = n < 0n ? '−' : '+';

  return `${sign}${value} ${symbol}`;
}

// Normalize "0x2::sui::SUI" to fully padded form
function normalizeCoinType(coinType: string): string {
  const [pkg, ...rest] = coinType.split('::');
  if (!pkg || rest.length === 0) return coinType;
  // Pad the package address to 66 chars (0x + 64 hex)
  const stripped = pkg.replace(/^0x/, '');
  const padded = '0x' + stripped.padStart(64, '0');
  return [padded, ...rest].join('::');
}
