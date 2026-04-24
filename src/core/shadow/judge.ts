import { KeelError } from '../../util/errors.js';
import type { Provider } from '../providers/base.js';
import type { CompletionRequest, CompletionResponse, Message } from '../types.js';

export interface Judge {
  score(
    request: CompletionRequest,
    primary: CompletionResponse,
    candidate: CompletionResponse,
  ): Promise<number>;
}

/**
 * LLM-as-judge. Asks a small fast model to compare two responses to the same
 * user query and return a single numeric score in [0, 1]:
 *   1.0 — candidate is equivalent to primary (same answer, same fidelity)
 *   0.5 — candidate is weaker but plausibly acceptable
 *   0.0 — candidate is clearly worse or wrong
 *
 * We intentionally force a single-number output and parse it strictly; if the
 * judge returns anything else the attempt is discarded (not counted as 0, to
 * avoid biasing the rolling window with parse failures).
 */
export class LlmJudge implements Judge {
  constructor(
    private readonly provider: Provider,
    private readonly model: string,
  ) {}

  async score(
    request: CompletionRequest,
    primary: CompletionResponse,
    candidate: CompletionResponse,
  ): Promise<number> {
    const userTurn = [...request.messages].reverse().find((m) => m.role === 'user');
    const query = userTurn?.content ?? '';

    const judgePrompt: Message[] = [
      {
        role: 'system',
        content: [
          'You are a strict quality judge for an LLM routing system.',
          'You will see a user query and two candidate responses: A (current production) and B (a cheaper candidate being tested).',
          'Score how well B could replace A for this query. Output one line only, of the form:',
          'SCORE: <float in [0,1]>',
          'Where 1.0 = equivalent or better, 0.5 = weaker but acceptable, 0.0 = clearly worse or wrong.',
          'Do not output anything else. No explanation.',
        ].join(' '),
      },
      {
        role: 'user',
        content:
          `USER QUERY:\n${truncate(query, 4000)}\n\n` +
          `RESPONSE A (primary):\n${truncate(primary.content, 4000)}\n\n` +
          `RESPONSE B (candidate):\n${truncate(candidate.content, 4000)}`,
      },
    ];

    const res = await this.provider.complete({
      model: this.model,
      messages: judgePrompt,
      maxTokens: 16,
      temperature: 0,
    });

    const match = /SCORE:\s*([01](?:\.\d+)?)/.exec(res.content);
    if (!match || !match[1]) {
      throw new KeelError('internal', `judge returned unparseable output: ${res.content.slice(0, 64)}`);
    }
    const n = Number.parseFloat(match[1]);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new KeelError('internal', `judge returned out-of-range score: ${n}`);
    }
    return n;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated ${s.length - max} chars]`;
}
