import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { graphql } from '@mysten/sui/graphql/schema';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { SYSTEM_PACKAGE_IDS } from './protocols';

// Public JSON-RPC on Sui fullnodes is deprecated and now returns "Method not found".
// GraphQL is the supported replacement for reads.
// See https://docs.sui.io/develop/accessing-data/json-rpc-migration
const SUI_GRAPHQL_URL = process.env.SUI_GRAPHQL_URL ?? 'https://graphql.mainnet.sui.io/graphql';

export const suiClient = new SuiGraphQLClient({ url: SUI_GRAPHQL_URL, network: 'mainnet' });

// The SDK's transport-agnostic `core.getTransaction` does not return the sender for
// non-programmable transactions, and never returns the timestamp. This query fills the gap.
const TransactionMetaQuery = graphql(`
  query TransactionMeta($digest: String!) {
    transaction(digest: $digest) {
      sender {
        address
      }
      effects {
        timestamp
      }
    }
  }
`);

// Package ID -> original (version 1) package ID. Package versions never change, so this cache never goes stale.
const originalIdCache = new Map<string, string>();

/**
 * Resolves package IDs to their original (version 1) IDs.
 * A package that fails to resolve maps to itself, so a GraphQL error never fails the page.
 */
export async function resolveOriginalPackages(packageIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(packageIds.map((id) => normalizeSuiAddress(id)))];
  const missing = ids.filter((id) => isValidSuiAddress(id) && !SYSTEM_PACKAGE_IDS.has(id) && !originalIdCache.has(id));

  if (missing.length > 0) {
    // One request with an alias per package. IDs are validated hex above, so they are safe to inline.
    const fields = missing
      .map((id, i) => `p${i}: package(address: "${id}") { address packageVersionsBefore(first: 1) { nodes { address } } }`)
      .join('\n');
    try {
      const { data } = await suiClient.query<Record<string, OriginalIdResult | null>>({ query: `query { ${fields} }`, variables: {} });
      missing.forEach((id, i) => {
        const pkg = data?.[`p${i}`];
        if (!pkg) return;
        // `package(address)` returns the latest version; version 1 is the first "before" it.
        // If there is none, the latest version is version 1.
        originalIdCache.set(id, pkg.packageVersionsBefore.nodes[0]?.address ?? pkg.address);
      });
    } catch (err) {
      console.warn('Could not resolve original package IDs:', err);
    }
  }

  return Object.fromEntries(ids.map((id) => [id, originalIdCache.get(id) ?? id]));
}

interface OriginalIdResult {
  address: string;
  packageVersionsBefore: { nodes: { address: string }[] };
}

export interface TransactionMeta {
  sender: string | null;
  timestampMs: string | null;
}

export async function getTransactionMeta(digest: string): Promise<TransactionMeta> {
  const { data, errors } = await suiClient.query({ query: TransactionMetaQuery, variables: { digest } });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));

  const tx = data?.transaction;
  if (!tx) throw new Error(`Transaction ${digest} not found`);

  const ts = tx.effects?.timestamp;
  const parsed = ts ? Date.parse(ts) : NaN;
  return {
    sender: tx.sender?.address ?? null,
    timestampMs: Number.isNaN(parsed) ? null : String(parsed),
  };
}

const AddressTransactionsQuery = graphql(`
  query AddressTransactions($address: SuiAddress!, $before: String, $last: Int!) {
    transactions(last: $last, before: $before, filter: { affectedAddress: $address }) {
      pageInfo {
        hasPreviousPage
        startCursor
      }
      nodes {
        digest
      }
    }
  }
`);

export interface AddressTransactionsPage {
  /** Newest first. */
  digests: string[];
  /** Pass as `before` to load the next older page. Null when there are no older transactions. */
  olderCursor: string | null;
}

/** Transactions that touched an address (sent by it or changing its balances or objects), newest first. */
export async function listAddressTransactions(
  address: string,
  options: { before?: string; limit: number },
): Promise<AddressTransactionsPage> {
  const { data, errors } = await suiClient.query({
    query: AddressTransactionsQuery,
    variables: { address, before: options.before ?? null, last: options.limit },
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));

  const page = data?.transactions;
  if (!page) return { digests: [], olderCursor: null };

  return {
    // GraphQL returns each page oldest first.
    digests: page.nodes.map((n) => n.digest).reverse(),
    olderCursor: page.pageInfo.hasPreviousPage ? page.pageInfo.startCursor ?? null : null,
  };
}
