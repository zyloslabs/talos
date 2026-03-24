/**
 * CopilotWrapper — Wraps @github/copilot-sdk for Talos.
 *
 * Provides device auth, streaming chat, tool-call hooks, and session-level token tracking.
 * Adapted from OpenZigs patterns for Talos standalone architecture.
 */

import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { CopilotClient } from "@github/copilot-sdk";
import { TokenTracker } from "./token-tracker.js";
import type { TokenUsage } from "./token-tracker.js";

export type { TokenUsage };

export type DeviceAuthInfo = {
  verificationUri: string;
  userCode: string;
};

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ProviderConfig =
  | { type: "openai"; baseUrl: string; apiKey?: string }
  | { type: "azure"; baseUrl: string; apiKey?: string }
  | { type: "anthropic"; baseUrl: string; apiKey?: string }
  | { type: "ollama"; baseUrl: string };

export type CopilotModel = {
  id: string;
  capabilities?: {
    supports: { reasoningEffort: boolean; vision?: boolean };
    limits?: { max_context_window_tokens?: number };
  };
  [key: string]: unknown;
};

type AuthState = {
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  obtainedAt: number;
};

// Permission types reserved for future approval-queue integration
// type PermissionRequest = { kind: string; toolName?: string; toolArgs?: unknown };
// type PermissionResponse = { kind: "approved" | "denied-by-rules" | "denied-by-user" };

export type ChatOptions = {
  model?: string;
  conversationId?: string;
  systemMessage?: { mode: "append" | "replace"; content: string };
  reasoningEffort?: ReasoningEffort;
  onToolCall?: (tool: string, args: unknown) => void;
};

// ── SDK Session abstraction ──

type CopilotSessionLike = {
  readonly sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (event: any) => void) => (() => void);
  sendAndWait: (input: { prompt: string }, timeout?: number) => Promise<unknown>;
  destroy: () => Promise<void>;
};

type CopilotClientLike = {
  start?: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSession: (config: any) => Promise<CopilotSessionLike>;
  stop?: () => Promise<Error[]>;
  startDeviceAuth?: (input: { clientId: string; scopes: string[] }) => Promise<DeviceAuthInfo>;
  waitForAuth?: (input: { timeoutMs: number }) => Promise<unknown>;
  listModels?: () => Promise<CopilotModel[]>;
};

export interface CopilotWrapper {
  authenticate(): Promise<DeviceAuthInfo>;
  waitForAuth(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  chat(message: string, options?: ChatOptions): AsyncGenerator<string>;
  listModels(): Promise<CopilotModel[]>;
  getModel(): string;
  setModel(model: string): void;
  getReasoningEffort(): ReasoningEffort | undefined;
  setReasoningEffort(effort: ReasoningEffort | undefined): void;
  getProvider(): ProviderConfig | undefined;
  setProvider(provider: ProviderConfig | undefined): void;
  destroySession(conversationId: string): Promise<void>;
  clearAllSessions(): Promise<void>;
  getSessionUsage(sessionId: string): TokenUsage | null;
  clearSessionUsage(sessionId: string): TokenUsage | null;
  hasGithubToken(): boolean;
}

export type CopilotWrapperOptions = {
  client?: CopilotClientLike;
  authPath?: string;
  clientId?: string;
  model?: string;
  authTimeoutMs?: number;
  defaultReasoningEffort?: ReasoningEffort;
  provider?: ProviderConfig;
  sendAndWaitTimeoutMs?: number;
  githubToken?: string;
};

const defaultAuthPath = () => path.join(os.homedir(), ".talos", "auth.json");

const readAuthState = async (authPath: string): Promise<AuthState | null> => {
  try {
    const raw = await fs.readFile(authPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.token) return null;
    return {
      token: parsed.token,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      obtainedAt: parsed.obtainedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
};

const writeAuthState = async (authPath: string, state: AuthState) => {
  await fs.mkdir(path.dirname(authPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(authPath, JSON.stringify(state, null, 2), { mode: 0o600 });
};

const normalizeAuthResult = (result: unknown): { token: string; refreshToken?: string; expiresAt?: number } => {
  if (!result || typeof result !== "object") throw new Error("Auth returned empty result");
  const obj = result as Record<string, unknown>;
  const token = (typeof obj.token === "string" ? obj.token : typeof obj.accessToken === "string" ? obj.accessToken : "") as string;
  if (!token) throw new Error("Auth did not return a token");
  return {
    token,
    refreshToken: typeof obj.refreshToken === "string" ? obj.refreshToken : undefined,
    expiresAt: typeof obj.expiresAt === "number" ? obj.expiresAt : undefined,
  };
};

// ── Async Queue for streaming ──

class AsyncQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private done = false;

  push(item: T) {
    if (this.done) return;
    const resolver = this.resolvers.shift();
    if (resolver) { resolver({ value: item, done: false }); return; }
    this.items.push(item);
  }

  end() {
    if (this.done) return;
    this.done = true;
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.({ value: undefined as unknown as T, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) return { value: this.items.shift() as T, done: false };
    if (this.done) return { value: undefined as unknown as T, done: true };
    return new Promise((resolve) => { this.resolvers.push(resolve); });
  }
}

// ── Service Implementation ──

export class CopilotWrapperService extends EventEmitter implements CopilotWrapper {
  private client: CopilotClientLike;
  private authPath: string;
  private clientId: string;
  private model: string;
  private authTimeoutMs: number;
  private started = false;
  private startPromise?: Promise<void>;
  private defaultReasoningEffort?: ReasoningEffort;
  private providerConfig?: ProviderConfig;
  private sendAndWaitTimeoutMs: number;
  private sessionCache = new Map<string, CopilotSessionLike>();
  private githubToken?: string;
  readonly tokenTracker = new TokenTracker();

  constructor(options: CopilotWrapperOptions = {}) {
    super();
    const resolvedToken = options.githubToken
      ?? process.env.GITHUB_TOKEN
      ?? process.env.COPILOT_GITHUB_TOKEN;

    if (resolvedToken) {
      this.githubToken = resolvedToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client = options.client ?? (new CopilotClient({ githubToken: resolvedToken, useLoggedInUser: false }) as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client = options.client ?? (new CopilotClient() as any);
    }
    this.authPath = options.authPath ?? defaultAuthPath();
    this.clientId = options.clientId ?? process.env.GITHUB_CLIENT_ID ?? "";
    this.model = options.model ?? "gpt-4.1";
    this.authTimeoutMs = options.authTimeoutMs ?? 5 * 60 * 1000;
    this.defaultReasoningEffort = options.defaultReasoningEffort;
    this.providerConfig = options.provider;
    this.sendAndWaitTimeoutMs = options.sendAndWaitTimeoutMs ?? 10 * 60 * 1000;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) { await this.startPromise; return; }
    this.startPromise = (async () => {
      if (this.client.start) await this.client.start();
      this.started = true;
    })();
    await this.startPromise;
  }

  async authenticate(): Promise<DeviceAuthInfo> {
    await this.ensureStarted();
    if (!this.client.startDeviceAuth) throw new Error("Client does not support device auth");
    const info = await this.client.startDeviceAuth({
      clientId: this.clientId,
      scopes: ["read:user"],
    });
    this.emit("auth:pending", info);
    return info;
  }

  async waitForAuth(): Promise<void> {
    await this.ensureStarted();
    if (!this.client.waitForAuth) throw new Error("Client does not support waitForAuth");
    const result = await this.client.waitForAuth({ timeoutMs: this.authTimeoutMs });
    const { token, refreshToken, expiresAt } = normalizeAuthResult(result);
    await writeAuthState(this.authPath, { token, refreshToken, expiresAt, obtainedAt: Date.now() });
    this.emit("auth:complete");
  }

  async isAuthenticated(): Promise<boolean> {
    if (this.githubToken) return true;
    const state = await readAuthState(this.authPath);
    if (!state) return false;
    if (state.expiresAt && Date.now() >= state.expiresAt) return false;
    return true;
  }

  async *chat(message: string, options?: ChatOptions): AsyncGenerator<string> {
    await this.ensureStarted();

    const conversationId = options?.conversationId ?? `chat-${Date.now()}`;
    let session = this.sessionCache.get(conversationId);

    if (!session) {
      session = await this.client.createSession({
        model: options?.model ?? this.model,
        streaming: true,
        systemMessage: options?.systemMessage,
        reasoningEffort: options?.reasoningEffort ?? this.defaultReasoningEffort,
        provider: this.providerConfig,
      });
      this.sessionCache.set(conversationId, session);
    }

    const queue = new AsyncQueue<string>();

    const unsubText = session.on("text", (event: { delta?: string; text?: string }) => {
      const chunk = event.delta ?? event.text ?? "";
      if (chunk) queue.push(chunk);
    });

    const unsubTool = session.on("toolCall", (event: { name?: string; arguments?: unknown }) => {
      if (event.name) {
        options?.onToolCall?.(event.name, event.arguments);
        this.emit("tool:call", { tool: event.name, args: event.arguments });
      }
    });

    const unsubUsage = session.on("usage", (event: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => {
      this.tokenTracker.track(conversationId, event);
    });

    session.sendAndWait({ prompt: message }, this.sendAndWaitTimeoutMs)
      .then(() => { queue.end(); })
      .catch((err: Error) => {
        this.emit("error", err);
        queue.end();
      })
      .finally(() => {
        unsubText();
        unsubTool();
        unsubUsage();
      });

    while (true) {
      const { value, done } = await queue.next();
      if (done) break;
      yield value;
    }
  }

  async listModels(): Promise<CopilotModel[]> {
    await this.ensureStarted();
    if (!this.client.listModels) return [{ id: this.model }];
    return this.client.listModels();
  }

  getModel(): string { return this.model; }
  setModel(model: string): void { this.model = model; }
  getReasoningEffort(): ReasoningEffort | undefined { return this.defaultReasoningEffort; }
  setReasoningEffort(effort: ReasoningEffort | undefined): void { this.defaultReasoningEffort = effort; }
  getProvider(): ProviderConfig | undefined { return this.providerConfig; }

  setProvider(provider: ProviderConfig | undefined): void {
    this.providerConfig = provider;
    void this.clearAllSessions();
  }

  async destroySession(conversationId: string): Promise<void> {
    const session = this.sessionCache.get(conversationId);
    if (session) {
      await session.destroy();
      this.sessionCache.delete(conversationId);
    }
  }

  async clearAllSessions(): Promise<void> {
    const promises = [...this.sessionCache.values()].map((s) => s.destroy().catch(() => {}));
    await Promise.all(promises);
    this.sessionCache.clear();
  }

  getSessionUsage(sessionId: string): TokenUsage | null {
    return this.tokenTracker.get(sessionId);
  }

  clearSessionUsage(sessionId: string): TokenUsage | null {
    return this.tokenTracker.clear(sessionId);
  }

  hasGithubToken(): boolean {
    return !!this.githubToken;
  }

  hasSession(conversationId: string): boolean {
    return this.sessionCache.has(conversationId);
  }
}
