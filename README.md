# SuiExplain

SuiExplain turns a Sui transaction digest into a plain-English summary.
Paste a digest from Sui Mainnet and the app shows what happened, who sent it, what it cost, and which tokens and objects changed.
No wallet connection is needed.

## Features

- **Headline summary.** Rule-based detection of common actions: transfers, swaps, staking, unstaking, mints, and package publishes. Amounts exclude the gas fee.
- **Protocol labels.** Known actions on DeepBook, Cetus, Turbos, Aftermath, Bluefin, 7K, Cetus Aggregator, Suilend, Navi, Scallop, and AlphaFi.
- **Optional AI headline.** If a Google AI key is set, a Gemini model rewrites the headline in more natural language.
- **Token changes.** Balance changes for the sender's wallet, with correct decimals and symbols from on-chain coin metadata.
- **Step list.** Each command in the programmable transaction block, with known protocol actions labeled by name.
- **Object changes.** Objects created, consumed, transferred, wrapped, or published.
- **Status, fee, and time.** Success or failure (with the error message), net gas fee in SUI, and the execution timestamp.

## How it works

The app is a Next.js 14 (App Router) project.
The page `app/tx/[digest]/page.tsx` renders on the server, so no data is fetched from the browser.

| File | Purpose |
| --- | --- |
| `lib/sui.ts` | Sui GraphQL client, sender and timestamp query, and original package ID lookup |
| `lib/snapshot.ts` | Fetches everything about one transaction into a plain-JSON `TxSnapshot` |
| `lib/parser.ts` | Converts a `TxSnapshot` into the `ParsedTransaction` shape the UI uses. No network access |
| `lib/coins.ts` | Coin metadata lookup with a built-in table and an in-memory cache |
| `lib/protocols.ts` | Known protocols, keyed by original package ID, with labels for their functions |
| `lib/llm.ts` | Optional Gemini headline rewrite |
| `components/` | UI cards for summary, token changes, steps, and object changes |
| `tests/` | Parser tests on saved mainnet transactions (`tests/fixtures/`) |
| `scripts/capture-fixtures.ts` | Saves mainnet transactions as test fixtures |

### Protocol matching

Every Sui package upgrade creates a new package ID, and transactions call the newest one.
The app resolves each called package to its original (version 1) ID through GraphQL, then looks that up in `lib/protocols.ts`.
So a protocol upgrade does not break its labels.

To add a protocol, add its original package ID and labels to `lib/protocols.ts`.
Use function names that appear in real mainnet transactions.

### Data source

SuiExplain reads chain data from the Sui GraphQL API (`https://graphql.mainnet.sui.io/graphql`) through the `@mysten/sui` SDK.
Public fullnodes no longer serve JSON-RPC. See the [Sui JSON-RPC migration guide](https://docs.sui.io/develop/accessing-data/json-rpc-migration).

## Getting started

Requirements: Node.js 18.17 or later and npm.

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Optional: create a `.env.local` file to set environment variables (see below).

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and paste a transaction digest, or click the example on the home page.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `GOOGLE_AI_API_KEY` | No | Enables the AI headline. Without it, the app shows the rule-based headline only. |
| `GEMINI_MODEL` | No | Model for the AI headline. Default: `gemini-flash-lite-latest`, an alias Google keeps on its newest Flash-Lite model. |
| `SUI_GRAPHQL_URL` | No | Overrides the GraphQL endpoint. Default: `https://graphql.mainnet.sui.io/graphql`. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the parser tests (no network access needed) |
| `npm run fixtures` | Re-download the test fixtures from mainnet |

## Deploy

The app deploys to Vercel with no extra configuration.
Set `GOOGLE_AI_API_KEY` in the Vercel project settings if you want the AI headline.

## Limitations

- Mainnet only.
- Token changes show the sender's wallet only.
- Headline detection uses heuristics and a fixed list of known protocols. Unknown protocols fall back to "Called `module::function`".
