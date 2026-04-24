import { logger } from '../../util/logger.js';
import { costUsd } from '../pricing.js';
import type { ProviderRegistry } from '../providers/base.js';
import type { CompletionRequest, CompletionResponse } from '../types.js';
import type { Judge } from './judge.js';
import type { ShadowStats } from './stats.js';

export interface ShadowLogger {
  logAttempt(attempt: ShadowAttempt): Promise<void>;
}

export interface ShadowAttempt {
  requestId: string;
  primaryModel: string;
  candidateModel: string;
  judgeModel: string;
  judgeScore: number | null;
  costDeltaUsd: number;
  candidateOk: boolean;
}

export interface ShadowPlan {
  /** What model to compare against for a given primary. Null = no shadow. */
  candidateFor(primary: string): string | null;
  samplePercent: number;
}

/**
 * Simple candidate map: for each primary model, one cheaper candidate to try.
 * Operators override this via env / config. Defaults only fire if the primary
 * model is actually in the map — we never invent candidates.
 */
export class StaticShadowPlan implements ShadowPlan {
  constructor(
    private readonly candidates: Readonly<Record<string, string>>,
    readonly samplePercent: number,
  ) {}

  candidateFor(primary: string): string | null {
    return this.candidates[primary] ?? null;
  }
}

export interface ShadowControllerOptions {
  plan: ShadowPlan;
  registry: ProviderRegistry;
  judge: Judge;
  judgeModel: string;
  stats: ShadowStats;
  shadowLogger: ShadowLogger | null;
  /** Random source, for deterministic tests. */
  random?: () => number;
  /** Ceiling on concurrent in-flight shadow attempts; drops above this. */
  maxConcurrent?: number;
}

/**
 * ShadowController decides whether a given request is eligible for a shadow
 * call, and if so, asynchronously fires the candidate + judges the result.
 *
 * The shadow call NEVER blocks or mutates the primary response. Failures are
 * swallowed (logged at warn). This is critical: the gateway must not get
 * slower because shadow eval is enabled.
 */
export class ShadowController {
  private inflight = 0;
  private readonly random: () => number;
  private readonly maxConcurrent: number;

  constructor(private readonly opts: ShadowControllerOptions) {
    this.random = opts.random ?? Math.random;
    this.maxConcurrent = opts.maxConcurrent ?? 32;
  }

  /**
   * Decide + fire (async). Returns immediately. If the caller awaits the
   * returned promise, it will resolve when the shadow attempt is fully logged;
   * in normal operation the gateway discards the promise.
   */
  maybeShadow(args: {
    requestId: string;
    request: CompletionRequest;
    primary: CompletionResponse;
  }): Promise<void> | null {
    const candidate = this.opts.plan.candidateFor(args.request.model);
    if (!candidate) return null;
    if (candidate === args.request.model) return null;
    if (args.request.stream) return null;
    if (this.random() * 100 >= this.opts.plan.samplePercent) return null;
    if (this.inflight >= this.maxConcurrent) {
      logger.warn({ inflight: this.inflight }, 'shadow: backpressure, dropping');
      return null;
    }

    this.inflight++;
    const promise = this.runAttempt(args.requestId, args.request, args.primary, candidate).finally(
      () => {
        this.inflight--;
      },
    );
    // Don't crash the process on unhandled shadow failures.
    promise.catch((err) => logger.warn({ err }, 'shadow: attempt failed'));
    return promise;
  }

  private async runAttempt(
    requestId: string,
    request: CompletionRequest,
    primary: CompletionResponse,
    candidateModel: string,
  ): Promise<void> {
    let candidate: CompletionResponse;
    try {
      const provider = this.opts.registry.forModel(candidateModel);
      candidate = await provider.complete({ ...request, model: candidateModel, stream: false });
    } catch (err) {
      logger.warn({ err, candidateModel, requestId }, 'shadow: candidate failed');
      await this.record(requestId, primary.model, candidateModel, null, 0, false);
      return;
    }

    let score: number | null = null;
    try {
      score = await this.opts.judge.score(request, primary, candidate);
    } catch (err) {
      logger.warn({ err, requestId }, 'shadow: judge failed');
    }

    const primaryCost = costUsd(primary.model, primary.usage.inputTokens, primary.usage.outputTokens);
    const candidateCost = costUsd(
      candidate.model,
      candidate.usage.inputTokens,
      candidate.usage.outputTokens,
    );
    // Positive delta = candidate is more expensive (bad). Negative = savings.
    const costDelta = candidateCost - primaryCost;

    if (score !== null) {
      this.opts.stats.record(primary.model, candidateModel, score, -costDelta);
    }
    await this.record(requestId, primary.model, candidateModel, score, costDelta, true);
  }

  private async record(
    requestId: string,
    primaryModel: string,
    candidateModel: string,
    score: number | null,
    costDeltaUsd: number,
    ok: boolean,
  ): Promise<void> {
    if (!this.opts.shadowLogger) return;
    await this.opts.shadowLogger.logAttempt({
      requestId,
      primaryModel,
      candidateModel,
      judgeModel: this.opts.judgeModel,
      judgeScore: score,
      costDeltaUsd,
      candidateOk: ok,
    });
  }
}
