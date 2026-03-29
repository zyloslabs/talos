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
import { CopilotClient, defineTool, approveAll } from "@github/copilot-sdk";
import { TokenTracker } from "./token-tracker.js";
import type { TokenUsage } from "./token-tracker.js";
import type { ToolDefinition } from "../talos/tools.js";

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

// Permission types
export type PermissionHandler = typeof approveAll;

export type SdkAttachment = {
  type: "file" | "directory" | "selection";
  path: string;
  displayName?: string;
  languageId?: string;
  startLine?: number;
  endLine?: number;
  content?: string;
};

export type CustomAgentDefinition = {
  name: string;
  displayName: string;
  description: string;
  prompt: string;
  tools?: string[];
  infer?: boolean;
};

export type ChatOptions = {
  tools?: ToolDefinition[];
  model?: string;
  conversationId?: string;
  systemMessage?: { mode: "append" | "replace"; content: string };
  reasoningEffort?: ReasoningEffort;
  onToolCall?: (tool: string, args: unknown) => void;
  attachments?: SdkAttachment[];
  enableSubagents?: boolean;
  customAgents?: CustomAgentDefinition[];
};

// ── SDK Session abstraction ──

type CopilotSessionLike = {
  readonly sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (event: any) => void) => () => void;
  sendAndWait: (input: { prompt: string; attachments?: SdkAttachment[] }, timeout?: number) => Promise<unknown>;
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
  getAuthStatus?: () => Promise<{ isAuthenticated: boolean; authType?: string }>;
};

export interface CopilotWrapper {
  authenticate(): Promise<DeviceAuthInfo>;
  waitForAuth(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getAuthType(): Promise<string | undefined>;
  chat(message: string, options?: ChatOptions): AsyncGenerator<string>;
  listModels(): Promise<CopilotModel[]>;
  modelSupportsReasoning(modelId: string): boolean;
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
  getGithubToken(): Promise<string | null>;
  reinit(token?: string): Promise<void>;
  getCustomAgents(): CustomAgentDefinition[];
  setCustomAgents(agents: CustomAgentDefinition[]): void;
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
  permissionHandler?: PermissionHandler;
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
  const token = (
    typeof obj.token === "string" ? obj.token : typeof obj.accessToken === "string" ? obj.accessToken : ""
  ) as string;
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
    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }
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
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
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
  private startFailed = false;
  private startPromise?: Promise<void>;
  private modelCapabilitiesCache = new Map<string, { supportsReasoning: boolean }>();
  private defaultReasoningEffort?: ReasoningEffort;
  private providerConfig?: ProviderConfig;
  private sendAndWaitTimeoutMs: number;
  private sessionCache = new Map<string, CopilotSessionLike>();
  private githubToken?: string;
  private permissionHandler?: PermissionHandler;
  private customAgentsStore: CustomAgentDefinition[] = [];
  readonly tokenTracker = new TokenTracker();

  constructor(options: CopilotWrapperOptions = {}) {
    super();
    const resolvedToken = options.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.COPILOT_GITHUB_TOKEN;

    if (resolvedToken) {
      this.githubToken = resolvedToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client =
        options.client ?? (new CopilotClient({ githubToken: resolvedToken, useLoggedInUser: false }) as any);
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
    this.permissionHandler = options.permissionHandler;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started || this.startFailed) return;
    if (this.startPromise) {
      await this.startPromise;
      return;
    }
    this.startPromise = (async () => {
      try {
        if (this.client.start) await this.client.start();
        this.started = true;
      } catch {
        this.startFailed = true;
      }
    })();
    await this.startPromise;
  }

  modelSupportsReasoning(modelId: string): boolean {
    const cached = this.modelCapabilitiesCache.get(modelId);
    if (cached !== undefined) return cached.supportsReasoning;
    // Fallback for well-known reasoning model prefixes before cache is populated
    const lower = modelId.toLowerCase();
    return lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4");
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
    return (await this._getAuthStatus()).isAuthenticated;
  }

  async getAuthType(): Promise<string | undefined> {
    return (await this._getAuthStatus()).authType;
  }

  private async _getAuthStatus(): Promise<{ isAuthenticated: boolean; authType?: string }> {
    await this.ensureStarted().catch(() => {});
    if (!this.startFailed && this.client.getAuthStatus) {
      try {
        const status = await this.client.getAuthStatus();
        return { isAuthenticated: status.isAuthenticated, authType: status.authType };
      } catch {
        // SDK unresponsive — fall through to local checks
      }
    }
    // Fallback for token mode or when SDK is unavailable
    if (this.githubToken) return { isAuthenticated: true, authType: "env" };
    const state = await readAuthState(this.authPath);
    if (!state || (state.expiresAt && Date.now() >= state.expiresAt)) {
      return { isAuthenticated: false };
    }
    return { isAuthenticated: true, authType: "device" };
  }

  async *chat(message: string, options?: ChatOptions): AsyncGenerator<string> {
    await this.ensureStarted();

    if (this.startFailed) {
      throw new Error("Copilot SDK failed to start. Please ensure the GitHub Copilot CLI is up to date.");
    }

    const effectiveModel = options?.model ?? this.model;
    const conversationId = options?.conversationId ?? `chat-${Date.now()}`;
    let session = this.sessionCache.get(conversationId);

    // Wrap Talos tools with defineTool() so the SDK can invoke them
    const toolList = options?.tools ?? [];
    const perCallToolCallback = options?.onToolCall;
    const wrappedTools = toolList.map((tool) =>
      defineTool(tool.name, {
        description: tool.description,
        parameters: tool.inputSchema,
        handler: async (args) => {
          if (perCallToolCallback) perCallToolCallback(tool.name, args);
          this.emit("tool:call", { tool: tool.name, args });
          try {
            const result = await tool.handler(args as Record<string, unknown>);
            if (result.isError) return `[Tool Error] ${result.text}`;
            return result.text;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `[Tool Error] ${msg}`;
          }
        },
      })
    );

    // Only pass reasoningEffort to models that support it
    const rawReasoningEffort = options?.reasoningEffort ?? this.defaultReasoningEffort;
    const effectiveReasoningEffort =
      rawReasoningEffort && this.modelSupportsReasoning(effectiveModel) ? rawReasoningEffort : undefined;

    if (!session) {
      session = await this.client.createSession({
        model: effectiveModel,
        streaming: true,
        tools: wrappedTools,
        systemMessage: options?.systemMessage,
        ...(effectiveReasoningEffort ? { reasoningEffort: effectiveReasoningEffort } : {}),
        ...(this.providerConfig ? { provider: this.providerConfig } : {}),
        ...(options?.enableSubagents ? { enableSubagents: true } : {}),
        ...(options?.customAgents ? { customAgents: options.customAgents } : {}),
        onPermissionRequest: this.permissionHandler ?? approveAll,
      });
      this.sessionCache.set(conversationId, session);
    }

    const queue = new AsyncQueue<string>();

    const unsubDelta = session.on("assistant.message_delta", (event: { data?: { deltaContent?: string } }) => {
      const chunk = event?.data?.deltaContent ?? "";
      if (chunk) queue.push(chunk);
    });

    const unsubTool = session.on("toolCall", (event: { name?: string; arguments?: unknown }) => {
      if (event.name) {
        perCallToolCallback?.(event.name, event.arguments);
        this.emit("tool:call", { tool: event.name, args: event.arguments });
      }
    });

    const unsubUsage = session.on(
      "usage",
      (event: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => {
        this.tokenTracker.track(conversationId, event);
      }
    );

    session
      .sendAndWait(
        { prompt: message, ...(options?.attachments ? { attachments: options.attachments } : {}) },
        this.sendAndWaitTimeoutMs
      )
      .then(() => {
        queue.end();
      })
      .catch((err: Error) => {
        this.emit("error", err);
        queue.end();
      })
      .finally(() => {
        unsubDelta();
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
    if (this.startFailed) {
      throw new Error("Copilot SDK failed to start — cannot list models");
    }
    if (!this.client.listModels) return [{ id: this.model }];
    try {
      const models = await this.client.listModels();
      // Cache model capabilities for reasoning-effort gating
      for (const model of models) {
        const supportsReasoning = model.capabilities?.supports?.reasoningEffort === true;
        this.modelCapabilitiesCache.set(model.id, { supportsReasoning });
      }
      return models;
    } catch (err) {
      // PATs are not supported for models.list — fall back to configured model
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Personal Access Tokens are not supported")) {
        console.warn("[copilot] models.list unavailable with PAT auth — returning configured model only");
        return [{ id: this.model }];
      }
      throw err;
    }
  }

  getModel(): string {
    return this.model;
  }
  setModel(model: string): void {
    this.model = model;
  }
  getReasoningEffort(): ReasoningEffort | undefined {
    return this.defaultReasoningEffort;
  }
  setReasoningEffort(effort: ReasoningEffort | undefined): void {
    this.defaultReasoningEffort = effort;
  }
  getProvider(): ProviderConfig | undefined {
    return this.providerConfig;
  }

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

  async getGithubToken(): Promise<string | null> {
    if (this.githubToken) return this.githubToken;
    const state = await readAuthState(this.authPath);
    return state?.token ?? null;
  }

  async reinit(token?: string): Promise<void> {
    await this.clearAllSessions();
    this.githubToken = token;
    if (token) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client = new CopilotClient({ githubToken: token, useLoggedInUser: false }) as any;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client = new CopilotClient() as any;
    }
    this.started = false;
    this.startFailed = false;
    this.startPromise = undefined;
    this.modelCapabilitiesCache.clear();
  }

  getCustomAgents(): CustomAgentDefinition[] {
    return [...this.customAgentsStore];
  }

  setCustomAgents(agents: CustomAgentDefinition[]): void {
    this.customAgentsStore = [...agents];
  }

  /** @internal Not part of the CopilotWrapper public interface — promote when called through the interface type. */
  hasSession(conversationId: string): boolean {
    return this.sessionCache.has(conversationId);
  }
}
