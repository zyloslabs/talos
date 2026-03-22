/**
 * TokenTracker — Tracks token usage per session for the Copilot SDK.
 */

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TokenUsageEvent = {
  sessionId: string;
  usage: TokenUsage;
  timestamp: string;
};

export type CompactionEvent = {
  sessionId: string;
  previousTokens: number;
  compactedTokens: number;
  timestamp: string;
};

export class TokenTracker {
  private sessions = new Map<string, TokenUsage>();

  track(sessionId: string, usage: Partial<TokenUsage>): void {
    const existing = this.sessions.get(sessionId) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    existing.promptTokens += usage.promptTokens ?? 0;
    existing.completionTokens += usage.completionTokens ?? 0;
    existing.totalTokens += usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
    this.sessions.set(sessionId, existing);
  }

  get(sessionId: string): TokenUsage | null {
    return this.sessions.get(sessionId) ?? null;
  }

  clear(sessionId: string): TokenUsage | null {
    const usage = this.sessions.get(sessionId) ?? null;
    this.sessions.delete(sessionId);
    return usage;
  }

  clearAll(): void {
    this.sessions.clear();
  }

  getAllSessions(): Map<string, TokenUsage> {
    return new Map(this.sessions);
  }
}
