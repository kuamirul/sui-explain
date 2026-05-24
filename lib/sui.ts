import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const suiClient = new SuiJsonRpcClient({ network: 'mainnet', url: getJsonRpcFullnodeUrl('mainnet') });
