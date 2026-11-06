import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { graphql } from '@mysten/sui/graphql/schema';

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
