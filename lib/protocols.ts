import { normalizeSuiAddress } from '@mysten/sui/utils';

export interface ProtocolInfo {
  name: string;
  category: 'dex' | 'lending' | 'yield' | 'nft' | 'system' | 'other';
  /** Routes swaps through other DEXes. Shown in "via …" in preference to the DEXes it routes to. */
  aggregator?: boolean;
  // Keys are "module::function", or a bare "function" to match it in any module.
  actions?: Record<string, string>;
}

// Keyed by ORIGINAL package ID (version 1).
//
// Every Sui package upgrade creates a new package ID, and transactions call the new ID.
// The parser resolves each called package to its original ID before lookup
// (see resolveOriginalPackages in lib/sui.ts), so these keys stay valid across upgrades.
//
// Each ID and action below was checked on mainnet: the package exists, has the module,
// and the function appears in recent transactions.
const PROTOCOLS: Record<string, ProtocolInfo> = {
  // ── Sui system packages ────────────────────────────────────────────────────
  '0x1': { name: 'Move Stdlib', category: 'system' },
  '0x2': {
    name: 'Sui Framework',
    category: 'system',
    actions: {
      'coin::split': 'Split coin',
      'coin::join': 'Merge coins',
      'transfer::transfer': 'Transfer object',
      'transfer::public_transfer': 'Transfer object',
      'pay::split': 'Split and transfer',
      'pay::join': 'Join coins',
    },
  },
  '0x3': {
    name: 'Sui System',
    category: 'system',
    actions: {
      'sui_system::request_add_stake': 'Stake SUI',
      'sui_system::request_withdraw_stake': 'Unstake SUI',
      'sui_system::request_add_stake_non_entry': 'Stake SUI',
    },
  },

  // ── DEXes ──────────────────────────────────────────────────────────────────
  '0xdee9': {
    name: 'DeepBook',
    category: 'dex',
    actions: {
      'clob_v2::swap_exact_base_for_quote': 'Swap on DeepBook',
      'clob_v2::swap_exact_quote_for_base': 'Swap on DeepBook',
      'clob_v2::place_limit_order': 'Place limit order on DeepBook',
      'clob_v2::cancel_order': 'Cancel order on DeepBook',
    },
  },
  '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809': {
    name: 'DeepBook V3',
    category: 'dex',
    actions: {
      'pool::swap_exact_base_for_quote': 'Swap on DeepBook V3',
      'pool::swap_exact_quote_for_base': 'Swap on DeepBook V3',
      'pool::place_limit_order': 'Place limit order on DeepBook V3',
    },
  },
  // Cetus CLMM
  '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb': {
    name: 'Cetus',
    category: 'dex',
    actions: {
      'pool::flash_swap': 'Swap on Cetus',
      'pool::add_liquidity': 'Add liquidity on Cetus',
      'pool::remove_liquidity': 'Remove liquidity on Cetus',
      'pool::open_position': 'Open position on Cetus',
      'pool::close_position': 'Close position on Cetus',
      'pool::collect_fee': 'Collect fees on Cetus',
    },
  },
  '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1': {
    name: 'Turbos',
    category: 'dex',
    actions: {
      'swap_router::swap_a_b': 'Swap on Turbos',
      'swap_router::swap_b_a': 'Swap on Turbos',
      'swap_router::swap_a_b_with_return_': 'Swap on Turbos',
      'swap_router::swap_b_a_with_return_': 'Swap on Turbos',
      'position_manager::mint': 'Open position on Turbos',
      'position_manager::increase_liquidity': 'Add liquidity on Turbos',
      'position_manager::decrease_liquidity': 'Remove liquidity on Turbos',
      'position_manager::collect': 'Collect fees on Turbos',
      'position_manager::collect_reward': 'Collect rewards on Turbos',
    },
  },
  '0xefe170ec0be4d762196bedecd7a065816576198a6527c99282a2551aaa7da38c': {
    name: 'Aftermath',
    category: 'dex',
    actions: {
      'swap::swap_exact_in': 'Swap on Aftermath',
      'swap::swap_exact_in_direct': 'Swap on Aftermath',
    },
  },
  // Bluefin spot CLMM
  '0x3492c874c1e3b3e2984e8c41b589e642d4d0a5d6459e5a9cfc2d52fd7c89c267': {
    name: 'Bluefin',
    category: 'dex',
    actions: {
      'pool::swap': 'Swap on Bluefin',
      'gateway::swap_assets': 'Swap on Bluefin',
      'pool::open_position': 'Open position on Bluefin',
      'gateway::provide_liquidity_with_fixed_amount': 'Add liquidity on Bluefin',
      'gateway::remove_liquidity': 'Remove liquidity on Bluefin',
      'gateway::close_position': 'Close position on Bluefin',
      'gateway::collect_fee': 'Collect fees on Bluefin',
      'gateway::collect_reward': 'Collect rewards on Bluefin',
    },
  },

  // ── Aggregators ────────────────────────────────────────────────────────────
  // 7K Aggregator: swap settlement
  '0x17c0b1f7a6ad73f51268f16b8c06c049eecc2f28a270cdd29c06e3d2dea23302': {
    name: '7K Aggregator',
    category: 'dex',
    aggregator: true,
    actions: {
      'settle::settle': 'Swap via 7K Aggregator',
    },
  },
  // 7K Aggregator: limit and DCA orders
  '0x0ef0f805710cf53c10f29c4f73e1144a662747e1839689a846e2520cae122adc': {
    name: '7K Aggregator',
    category: 'dex',
    actions: {
      'limit_order::place_limit_order': 'Place limit order on 7K',
      'limit_order::claim_expired_order': 'Claim expired 7K limit order',
      'dca_order::fill_dca_order': 'Fill DCA order on 7K',
    },
  },
  // Cetus Aggregator: adapter packages (one module per DEX) plus the router
  ...cetusAggregator([
    '0xb1e11ceaf3e7cd3031ef5e24804478ec3441c5aecdace910bdaca317a0c1c535',
    '0xeffc8ae61f439bb34c9b905ff8f29ec56873dcedf81c7123ff2f1f67c45ec302',
    '0x368d13376443a8051b22b42a9125f6a3bc836422bb2d9c4a53984b8d6624c326',
    '0x43811be4677f5a5de7bf2dac740c10abddfaa524aee6b18e910eeadda8a2f6ae',
    '0x33ec64e9bb369bf045ddc198c81adbf2acab424da37465d95296ee02045d2b17',
  ]),

  // ── Lending ────────────────────────────────────────────────────────────────
  '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf': {
    name: 'Suilend',
    category: 'lending',
    actions: {
      'lending_market::deposit_liquidity_and_mint_ctokens': 'Deposit on Suilend',
      'lending_market::redeem_ctokens_and_withdraw_liquidity': 'Withdraw from Suilend',
      'lending_market::redeem_ctokens_and_withdraw_liquidity_request': 'Withdraw from Suilend',
      'lending_market::borrow': 'Borrow on Suilend',
      'lending_market::repay': 'Repay on Suilend',
      'lending_market::claim_rewards': 'Claim rewards on Suilend',
      'lending_market::claim_rewards_and_deposit': 'Claim and redeposit rewards on Suilend',
      'lending_market::liquidate': 'Liquidate a position on Suilend',
    },
  },
  '0xd899cf7d2b5db716bd2cf55599fb0d5ee38a3061e7b6bb6eebf73fa5bc4c81ca': {
    name: 'Navi',
    category: 'lending',
    actions: {
      'incentive_v2::entry_deposit': 'Deposit on Navi',
      'incentive_v3::entry_deposit': 'Deposit on Navi',
      'incentive_v2::entry_withdraw': 'Withdraw from Navi',
      'incentive_v3::withdraw_v2': 'Withdraw from Navi',
      'incentive_v3::entry_repay_on_behalf_of_user': 'Repay on Navi',
      'lending::withdraw': 'Withdraw from Navi',
      'lending::repay': 'Repay on Navi',
      'incentive::claim_reward': 'Claim rewards on Navi',
      'incentive_v2::claim_reward': 'Claim rewards on Navi',
      'lending::liquidation_call': 'Liquidate a position on Navi',
    },
  },
  '0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf': {
    name: 'Scallop',
    category: 'lending',
    actions: {
      'mint::mint': 'Deposit on Scallop',
      'redeem::redeem': 'Withdraw from Scallop',
      'deposit_collateral::deposit_collateral': 'Deposit collateral on Scallop',
      'withdraw_collateral::withdraw_collateral': 'Withdraw collateral from Scallop',
      'borrow::borrow': 'Borrow on Scallop',
      'repay::repay': 'Repay on Scallop',
      'liquidate::liquidate': 'Liquidate a position on Scallop',
    },
  },

  // ── Yield ──────────────────────────────────────────────────────────────────
  // AlphaFi vaults span several packages. Deposit and withdraw function names repeat
  // across many pool modules, so they are matched by function name only.
  // Housekeeping calls (collect_reward, update_pool) are left unlabeled on purpose:
  // they run before a deposit and would otherwise become the headline.
  ...alphaFi([
    '0x9bbd650b8442abb082c20f3bc95a9434a8d47b4bef98b0832dab57c1a8ba7123', // Cetus/Navi pools
    '0x754afbce8c72c8e491e3b9d536aa9d9766fdbc68650224ce01072189b235eee3', // Bluefin pools
    '0xa095412a92ff0f063cbea962f2f88b1a93cbc85c72bebf5dd7d90a8e2d6375ae', // Navi/Bucket pools
    '0x41b1def47b6259cd7306e049d6500eabb1a984e25558b56eefa9b6c000a038c3', // AlphaLend/Slush pools
  ]),
};

function cetusAggregator(ids: string[]): Record<string, ProtocolInfo> {
  const info: ProtocolInfo = {
    name: 'Cetus Aggregator',
    category: 'dex',
    aggregator: true,
    actions: {
      swap_a2b: 'Swap via Cetus Aggregator',
      swap_b2a: 'Swap via Cetus Aggregator',
      swap_a2b_v2: 'Swap via Cetus Aggregator',
      swap_b2a_v2: 'Swap via Cetus Aggregator',
      'router::new_swap_context': 'Swap via Cetus Aggregator',
      'router::new_swap_context_v2': 'Swap via Cetus Aggregator',
      'router::new_swap_context_v3': 'Swap via Cetus Aggregator',
    },
  };
  return Object.fromEntries(ids.map((id) => [id, info]));
}

function alphaFi(ids: string[]): Record<string, ProtocolInfo> {
  const deposit = 'Deposit into an AlphaFi vault';
  const withdraw = 'Withdraw from an AlphaFi vault';
  const info: ProtocolInfo = {
    name: 'AlphaFi',
    category: 'yield',
    actions: {
      user_deposit: deposit,
      user_deposit_v2: deposit,
      user_deposit_v3: deposit,
      user_deposit_v4: deposit,
      user_withdraw: withdraw,
      user_withdraw_v2: withdraw,
      user_withdraw_v3: withdraw,
      user_withdraw_v4: withdraw,
    },
  };
  return Object.fromEntries(ids.map((id) => [id, info]));
}

// Normalize keys once so lookups can use any address spelling ("0x2" or fully padded).
export const KNOWN_PROTOCOLS: Record<string, ProtocolInfo> = Object.fromEntries(
  Object.entries(PROTOCOLS).map(([id, info]) => [normalizeSuiAddress(id), info]),
);

// Packages whose ID never changes on upgrade, so they need no original-ID lookup.
export const SYSTEM_PACKAGE_IDS = new Set(['0x1', '0x2', '0x3', '0xdee9'].map((a) => normalizeSuiAddress(a)));

/** Look up a protocol by its ORIGINAL package ID. */
export function lookupProtocol(originalPackageId: string): ProtocolInfo | undefined {
  return KNOWN_PROTOCOLS[normalizeSuiAddress(originalPackageId)];
}

export function lookupAction(originalPackageId: string, module: string, fn: string): string | undefined {
  const proto = lookupProtocol(originalPackageId);
  if (!proto) return undefined;
  return proto.actions?.[`${module}::${fn}`] ?? proto.actions?.[fn];
}
