# SuiExplain

SuiExplain turns a Sui transaction digest into a plain-English summary.
Paste a digest from Sui Mainnet and the app shows what happened, who sent it, what it cost, and which tokens and objects changed.
No wallet connection is needed.

## Features

- **Headline summary.** Rule-based detection of common actions: transfers, swaps, staking, unstaking, mints, and package publishes.
- **Optional AI headline.** If a Google AI key is set, Gemini 1.5 Flash rewrites the headline in more natural language.
- **Token changes.** Balance changes for the sender's wallet, with correct decimals and symbols from on-chain coin metadata.
- **Step list.** Each command in the programmable transaction block, with known protocol actions labeled by name.
- **Object changes.** Objects created, consumed, transferred, wrapped, or published.
- **Status, fee, and time.** Success or failure (with the error message), net gas fee in SUI, and the execution timestamp.

## How it works

The app is a Next.js 14 (App Router) project.
The page `app/tx/[digest]/page.tsx` renders on the server, so no data is fetched from the browser.

| File | Purpose |
| --- | --- |
| `lib/sui.ts` | Sui GraphQL client and a small query for sender and timestamp |
| `lib/parser.ts` | Fetches a transaction and converts it into the `ParsedTransaction` shape the UI uses |
| `lib/coins.ts` | Coin metadata lookup with a built-in table and an in-memory cache |
| `lib/protocols.ts` | Known package IDs and human labels for their functions |
| `lib/llm.ts` | Optional Gemini headline rewrite |
| `components/` | UI cards for summary, token changes, steps, and object changes |

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
| `SUI_GRAPHQL_URL` | No | Overrides the GraphQL endpoint. Default: `https://graphql.mainnet.sui.io/graphql`. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Deploy

The app deploys to Vercel with no extra configuration.
Set `GOOGLE_AI_API_KEY` in the Vercel project settings if you want the AI headline.

## Limitations

- Mainnet only.
- Token changes show the sender's wallet only.
- Headline detection uses heuristics and a fixed list of known protocols. Unknown protocols fall back to "Called `module::function`".
