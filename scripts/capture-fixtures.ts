/**
 * Saves mainnet transactions as JSON fixtures for the parser tests.
 *
 * Run:  npm run fixtures
 *
 * Each fixture is a TxSnapshot: the exact input explainTransaction() receives,
 * so the tests run with no network access. Re-run this script only to add a new
 * fixture or to refresh coin metadata.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchSnapshot } from '../lib/snapshot';

export const FIXTURES: Record<string, string> = {
  'swap-sui-to-usdc': 'EAw2EK61WugYfHu87YtjHM1GGdUE4nhXBZsnb8ymDgYk',
  'swap-sui-to-wal': '4q6wbuikt1q6wAG9AedHAiEX445apmmrW6t9LCjqudNC',
  'swap-wal-to-sui-7k': '8yNrKckwEhuNRYmDKN2dLPdZVzx74KTX3dKmqgH5YagT',
  'swap-7k-aggregator': 'GMhYkkLENjkva7BotSvwXQoA1XXosAEGTzAEh11S2YE',
  'transfer-sui': '2zZaEDySCpNFKEaZAF6Qga4mcMAVMtrLyoMMUGiBV325',
  'stake-sui': '3pFVDk3Hm4FVYDVDV1Qdu3Q1LFd8cL2FFe5FGHkcDsho',
  'alphafi-deposit': '8S2obaVUMSnisWCz8PcA9Fh69PTan53gFtxQ3ZDg2ZKu',
  'suilend-deposit': '28vqTyXCS3SfL3SnGv75n22HAPVTKfGrUVPhpMbk9JcP',
  'navi-deposit': 'HZyKhcLLomT51JoPdNJf51L16LPqi4WMVCHt5nDs4rEv',
  'scallop-deposit': '89FaqeUmeceSjtZbbJZFDFsUDvdKffGx2oSxRnAgjQN3',
  'sponsored': '5uSqzzyP91hZV1bmVW6vtwhemc4XfjKncTXzGCZnihm4',
  'failed': '8TANSyWHQXu1ysoQ5gDTwM8V3hCandSjV7S6nzRkoAMg',
  'system-tx': '9skLCRcAz3tYmRrJbWGCYkZGzJmd9HmxzaG3btLoy1Hu',
};

const OUT_DIR = path.join(__dirname, '..', 'tests', 'fixtures');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, digest] of Object.entries(FIXTURES)) {
    const snapshot = await fetchSnapshot(digest);
    await writeFile(path.join(OUT_DIR, `${name}.json`), JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`saved ${name} (${digest})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
