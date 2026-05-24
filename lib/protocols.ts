export interface ProtocolInfo {
  name: string;
  category: 'dex' | 'lending' | 'nft' | 'system' | 'other';
  actions?: Record<string, string>; // module::function -> human label
}

// Maps a package ID prefix (or full ID) to protocol info.
// Sui packages get upgraded and change their IDs — we match on known IDs.
export const KNOWN_PROTOCOLS: Record<string, ProtocolInfo> = {
  // Sui system packages
  '0x0000000000000000000000000000000000000000000000000000000000000002': {
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
  '0x0000000000000000000000000000000000000000000000000000000000000003': {
    name: 'Sui System',
    category: 'system',
    actions: {
      'sui_system::request_add_stake': 'Stake SUI',
      'sui_system::request_withdraw_stake': 'Unstake SUI',
      'sui_system::request_add_stake_non_entry': 'Stake SUI',
    },
  },
  // DeepBook v2
  '0x000000000000000000000000000000000000000000000000000000000000dee9': {
    name: 'DeepBook',
    category: 'dex',
    actions: {
      'clob_v2::swap_exact_base_for_quote': 'Swap on DeepBook',
      'clob_v2::swap_exact_quote_for_base': 'Swap on DeepBook',
      'clob_v2::place_limit_order': 'Place limit order on DeepBook',
      'clob_v2::cancel_order': 'Cancel order on DeepBook',
    },
  },
  // DeepBook v3
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
      'pool::swap': 'Swap on Cetus',
      'pool::add_liquidity': 'Add liquidity on Cetus',
      'pool::remove_liquidity': 'Remove liquidity on Cetus',
      'pool::open_position': 'Open position on Cetus',
      'pool::close_position': 'Close position on Cetus',
      'pool::collect_fee': 'Collect fees on Cetus',
    },
  },
  // Turbos Finance
  '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1': {
    name: 'Turbos',
    category: 'dex',
    actions: {
      'pool::swap_a_b': 'Swap on Turbos',
      'pool::swap_b_a': 'Swap on Turbos',
      'pool::add_liquidity': 'Add liquidity on Turbos',
    },
  },
  // Scallop
  '0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061ab349': {
    name: 'Scallop',
    category: 'lending',
    actions: {
      'market::deposit': 'Deposit on Scallop',
      'market::withdraw': 'Withdraw from Scallop',
      'market::borrow': 'Borrow on Scallop',
      'market::repay': 'Repay on Scallop',
    },
  },
  // Navi Protocol
  'd899cf7d2b5db716bd2cf55599fb0d5ee38a3061e7b6bb6eebf73fa5bc4c81ca': {
    name: 'Navi',
    category: 'lending',
    actions: {
      'lending::deposit': 'Deposit on Navi',
      'lending::withdraw': 'Withdraw from Navi',
      'lending::borrow': 'Borrow on Navi',
      'lending::repay': 'Repay on Navi',
    },
  },
  // Aftermath Finance
  '0xefe170ec0be4d762196bedecd7a065816576198a6527c99282a2551aaa7da38c': {
    name: 'Aftermath',
    category: 'dex',
    actions: {
      'pool::swap': 'Swap on Aftermath',
    },
  },
  // Bluefin
  '0x1b881e6f59a4ac22a9fa62b30b74095a68bda2dc5da96b7b83f6a0c39987e56a': {
    name: 'Bluefin',
    category: 'dex',
    actions: {
      'gateway::trade': 'Trade on Bluefin',
    },
  },
};

export function lookupProtocol(packageId: string): ProtocolInfo | undefined {
  const normalized = packageId.toLowerCase();
  return KNOWN_PROTOCOLS[normalized] ?? KNOWN_PROTOCOLS[normalized.replace(/^0x0*/, '0x')];
}

export function lookupAction(packageId: string, module: string, fn: string): string | undefined {
  const proto = lookupProtocol(packageId);
  if (!proto) return undefined;
  return proto.actions?.[`${module}::${fn}`] ?? proto.actions?.[fn];
}
