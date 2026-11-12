import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ParsedTransaction } from './parser';

// `gemini-flash-lite-latest` is an alias that Google moves to the newest Flash-Lite model,
// so a model retirement does not break the app (gemini-1.5-flash was retired and returned 404).
// Override with GEMINI_MODEL, for example a pinned "gemini-2.5-flash-lite" or a Gemma model.
const DEFAULT_MODEL = 'gemini-flash-lite-latest';

/**
 * Uses a Gemini model to generate a richer plain-English headline
 * from the already-parsed transaction data.
 *
 * Returns the rule-based `headline` unchanged if:
 *  - GOOGLE_AI_API_KEY is not set
 *  - The API call fails for any reason (logged as a warning)
 */
export async function enhanceHeadline(tx: ParsedTransaction): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return tx.headline;

  try {
    const balanceSummary = tx.balanceChanges
      .map((b) => b.amountFormatted)
      .join(', ') || 'no token changes';

    const commandSummary = tx.commands
      .map((c) => c.label)
      .join(', ') || 'no commands';

    const objectSummary = (() => {
      const counts: Record<string, number> = {};
      for (const o of tx.objectChanges) {
        counts[o.changeType] = (counts[o.changeType] ?? 0) + 1;
      }
      return Object.entries(counts)
        .map(([type, n]) => `${n} ${type}`)
        .join(', ') || 'no object changes';
    })();

    const prompt = `You are explaining a Sui blockchain transaction to a non-technical user.

Draft summary: ${tx.headline}
Token flows: ${balanceSummary}
Actions taken: ${commandSummary}
Objects changed: ${objectSummary}
Network fee: ${tx.gasCostSui} SUI

Write ONE plain-English sentence (max 20 words) describing what the user did.
Be specific about token amounts and protocol names. No technical jargon. No markdown.`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || DEFAULT_MODEL });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Sanity check — if Gemini returns something unusable, fall back
    if (!text || text.length < 5) return tx.headline;

    return text;
  } catch (err) {
    // Log so a broken model or key is visible in server logs instead of failing silently.
    console.warn('AI headline failed, using rule-based headline:', err instanceof Error ? err.message : err);
    return tx.headline;
  }
}
