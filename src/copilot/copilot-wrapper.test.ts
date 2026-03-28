/**
 * CopilotWrapper + TokenTracker unit tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Copilot SDK so defineTool is a transparent passthrough in tests,
// allowing handler closures to be directly inspected.
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: class MockCopilotClient {},
  // defineTool(name, opts) — return a plain object that includes both name and opts props
  defineTool: vi.fn((name: string, opts: Record<string, unknown>) => ({ name, ...opts })),
  approveAll: vi.fn(async () => ({ kind: "approved" })),
}));

import { TokenTracker } from "./token-tracker.js";
import { CopilotWrapperService } from "./copilot-wrapper.js";
import type { DeviceAuthInfo, CopilotModel } from "./copilot-wrapper.js";

describe("TokenTracker", () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  it("tracks token usage for a session", () => {
    tracker.track("s1", { promptTokens: 100, completionTokens: 50 });
    const usage = tracker.get("s1");
    expect(usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
  });

  it("accumulates usage across multiple calls", () => {
    tracker.track("s1", { promptTokens: 100, completionTokens: 50 });
    tracker.track("s1", { promptTokens: 200, completionTokens: 100 });
    const usage = tracker.get("s1");
    expect(usage).toEqual({ promptTokens: 300, completionTokens: 150, totalTokens: 450 });
  });

  it("returns null for unknown session", () => {
    expect(tracker.get("unknown")).toBeNull();
  });

  it("clears session usage and returns it", () => {
    tracker.track("s1", { promptTokens: 100, completionTokens: 50 });
    const usage = tracker.clear("s1");
    expect(usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(tracker.get("s1")).toBeNull();
  });

  it("clears all sessions", () => {
    tracker.track("s1", { promptTokens: 10 });
    tracker.track("s2", { promptTokens: 20 });
    tracker.clearAll();
    expect(tracker.getAllSessions().size).toBe(0);
  });
});

describe("CopilotWrapperService", () => {
  function createMockClient() {
    const mockSession = {
      sessionId: "test-session",
      handlers: new Map<string, Array<(event: unknown) => void>>(),
      on(event: string, handler: (event: unknown) => void) {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event)!.push(handler);
        return () => {
          const handlers = this.handlers.get(event);
          if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) handlers.splice(idx, 1);
          }
        };
      },
      async sendAndWait() {
        // Simulate streaming text via new SDK event names
        const deltaHandlers = this.handlers.get("assistant.message_delta") ?? [];
        for (const h of deltaHandlers) h({ data: { deltaContent: "Hello " } });
        for (const h of deltaHandlers) h({ data: { deltaContent: "World" } });
        for (const h of this.handlers.get("usage") ?? []) {
          h({ promptTokens: 50, completionTokens: 20 });
        }
        return {};
      },
      destroy: vi.fn(async () => {}),
    };

    return {
      session: mockSession,
      client: {
        start: vi.fn(async () => {}),
        createSession: vi.fn(async () => mockSession),
        stop: vi.fn(async () => []),
        startDeviceAuth: vi.fn(
          async (): Promise<DeviceAuthInfo> => ({
            verificationUri: "https://github.com/login/device",
            userCode: "ABCD-1234",
          })
        ),
        waitForAuth: vi.fn(async () => ({ token: "test-token", expiresAt: Date.now() + 3600000 })),
        listModels: vi.fn(async (): Promise<CopilotModel[]> => [{ id: "gpt-4.1" }, { id: "claude-sonnet-4" }]),
        getAuthStatus: vi.fn(
          async (): Promise<{ isAuthenticated: boolean; authType?: string }> => ({
            isAuthenticated: true,
            authType: "device",
          })
        ),
      },
    };
  }

  it("authenticates via device flow", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, authPath: "/tmp/talos-test-auth.json" });
    const info = await wrapper.authenticate();
    expect(info.userCode).toBe("ABCD-1234");
    expect(client.startDeviceAuth).toHaveBeenCalled();
  });

  it("lists available models", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const models = await wrapper.listModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("gpt-4.1");
  });

  it("streams chat messages", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const chunks: string[] = [];
    for await (const chunk of wrapper.chat("Hello", { conversationId: "test-conv" })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["Hello ", "World"]);
  });

  it("tracks token usage during chat", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const chunks: string[] = [];
    for await (const chunk of wrapper.chat("Hello", { conversationId: "usage-test" })) {
      chunks.push(chunk);
    }
    const usage = wrapper.getSessionUsage("usage-test");
    expect(usage).toEqual({ promptTokens: 50, completionTokens: 20, totalTokens: 70 });
  });

  it("destroys sessions", async () => {
    const { client, session } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    // Force a session to be created
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "destroy-test" })) {
      /* consume */
    }
    expect(wrapper.hasSession("destroy-test")).toBe(true);
    await wrapper.destroySession("destroy-test");
    expect(wrapper.hasSession("destroy-test")).toBe(false);
    expect(session.destroy).toHaveBeenCalled();
  });

  it("gets and sets model", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, model: "gpt-4.1" });
    expect(wrapper.getModel()).toBe("gpt-4.1");
    wrapper.setModel("claude-sonnet-4");
    expect(wrapper.getModel()).toBe("claude-sonnet-4");
  });

  it("gets and sets reasoning effort", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    expect(wrapper.getReasoningEffort()).toBeUndefined();
    wrapper.setReasoningEffort("high");
    expect(wrapper.getReasoningEffort()).toBe("high");
  });

  it("modelSupportsReasoning returns false for gpt-4.1 before model list is fetched", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    expect(wrapper.modelSupportsReasoning("gpt-4.1")).toBe(false);
  });

  it("modelSupportsReasoning returns true for o1/o3/o4 prefix models before cache", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    expect(wrapper.modelSupportsReasoning("o1-preview")).toBe(true);
    expect(wrapper.modelSupportsReasoning("o3-mini")).toBe(true);
    expect(wrapper.modelSupportsReasoning("o4-mini")).toBe(true);
  });

  it("listModels caches reasoning capability and returns models", async () => {
    const { client } = createMockClient();
    client.listModels = vi.fn(
      async (): Promise<CopilotModel[]> => [
        { id: "gpt-4.1", capabilities: { supports: { reasoningEffort: false } } },
        { id: "o3-mini", capabilities: { supports: { reasoningEffort: true } } },
      ]
    );
    const wrapper = new CopilotWrapperService({ client });
    const models = await wrapper.listModels();
    expect(models).toHaveLength(2);
    // After listing, cache should be populated
    expect(wrapper.modelSupportsReasoning("gpt-4.1")).toBe(false);
    expect(wrapper.modelSupportsReasoning("o3-mini")).toBe(true);
  });

  it("does not pass reasoningEffort to non-reasoning models", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, defaultReasoningEffort: "high" });
    // Consume chat — model is gpt-4.1 (does not support reasoning)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { model: "gpt-4.1", conversationId: "no-reason" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.reasoningEffort).toBeUndefined();
  });

  it("passes reasoningEffort to reasoning models", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, defaultReasoningEffort: "high" });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { model: "o3-mini", conversationId: "with-reason" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.reasoningEffort).toBe("high");
  });

  it("wraps tools with defineTool and passes them to createSession", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const handlerMock = vi.fn(async () => ({ text: "result" }));
    const tool = {
      name: "test-tool",
      description: "A test tool",
      inputSchema: { type: "object" as const, properties: {} },
      zodSchema: {} as never,
      handler: handlerMock,
      category: "testing" as const,
      riskLevel: "low" as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { tools: [tool], conversationId: "tools-test" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Array.isArray(callArgs.tools)).toBe(true);
    expect(callArgs.tools).toHaveLength(1);
  });

  it("passes approveAll as onPermissionRequest to createSession", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "perm-test" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof callArgs.onPermissionRequest).toBe("function");
  });

  it("throws when startFailed and chat is called", async () => {
    const { client } = createMockClient();
    client.start = vi.fn(async () => {
      throw new Error("SDK unavailable");
    });
    const wrapper = new CopilotWrapperService({ client });
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of wrapper.chat("Hi")) {
        /* consume */
      }
    }).rejects.toThrow("Copilot SDK failed to start");
  });

  it("throws when startFailed and listModels is called", async () => {
    const { client } = createMockClient();
    client.start = vi.fn(async () => {
      throw new Error("SDK unavailable");
    });
    const wrapper = new CopilotWrapperService({ client });
    await expect(wrapper.listModels()).rejects.toThrow("Copilot SDK failed to start");
  });

  it("hasGithubToken returns true when githubToken is provided", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, githubToken: "ghp_test123" });
    expect(wrapper.hasGithubToken()).toBe(true);
  });

  it("hasGithubToken returns false when no githubToken and no env var", () => {
    const { client } = createMockClient();
    const origToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.COPILOT_GITHUB_TOKEN;
    const wrapper = new CopilotWrapperService({ client });
    expect(wrapper.hasGithubToken()).toBe(false);
    if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
  });

  it("tool handler returns error text when tool result isError", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const errorTool = {
      name: "error-tool",
      description: "A tool that returns an error",
      inputSchema: { type: "object" as const },
      zodSchema: {} as never,
      handler: async () => ({ text: "something went wrong", isError: true as const }),
      category: "testing" as const,
      riskLevel: "low" as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { tools: [errorTool], conversationId: "err-test" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Since defineTool is mocked as passthrough, handler is our closure
    const handler = callArgs.tools?.[0]?.handler as ((args: unknown) => Promise<string>) | undefined;
    expect(handler).toBeDefined();
    if (handler) {
      const result = await handler({});
      expect(result).toBe("[Tool Error] something went wrong");
    }
  });

  it("tool handler returns error text when tool throws", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const throwingTool = {
      name: "throw-tool",
      description: "A tool that throws",
      inputSchema: { type: "object" as const },
      zodSchema: {} as never,
      handler: async () => {
        throw new Error("boom");
      },
      category: "testing" as const,
      riskLevel: "low" as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { tools: [throwingTool], conversationId: "throw-test" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const handler = callArgs.tools?.[0]?.handler as ((args: unknown) => Promise<string>) | undefined;
    expect(handler).toBeDefined();
    if (handler) {
      const result = await handler({});
      expect(result).toBe("[Tool Error] boom");
    }
  });

  it("perCallToolCallback is called when tool is used", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    const onToolCall = vi.fn();
    const dummyTool = {
      name: "dummy-tool",
      description: "dummy",
      inputSchema: { type: "object" as const },
      zodSchema: {} as never,
      handler: async () => ({ text: "ok" }),
      category: "testing" as const,
      riskLevel: "low" as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { tools: [dummyTool], onToolCall, conversationId: "callback-test" })) {
      /* consume */
    }
    const callArgs = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const handler = callArgs.tools?.[0]?.handler as ((args: unknown) => Promise<string>) | undefined;
    expect(handler).toBeDefined();
    if (handler) {
      await handler({ arg: "val" });
      expect(onToolCall).toHaveBeenCalledWith("dummy-tool", { arg: "val" });
    }
  });

  it("reuses cached session on second chat call with same conversationId", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    // First call
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("First", { conversationId: "reuse-test" })) {
      /* consume */
    }
    // Second call — should reuse the session
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Second", { conversationId: "reuse-test" })) {
      /* consume */
    }
    // createSession should only have been called once
    expect((client.createSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("clearAllSessions destroys all cached sessions", async () => {
    const { client, session } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "clear-test" })) {
      /* consume */
    }
    expect(wrapper.hasSession("clear-test")).toBe(true);
    await wrapper.clearAllSessions();
    expect(wrapper.hasSession("clear-test")).toBe(false);
    expect(session.destroy).toHaveBeenCalled();
  });

  it("setProvider updates the provider config", () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    expect(wrapper.getProvider()).toBeUndefined();
    wrapper.setProvider({ type: "openai", baseUrl: "http://localhost:11434" });
    expect(wrapper.getProvider()).toEqual({ type: "openai", baseUrl: "http://localhost:11434" });
  });

  it("modelSupportsReasoning returns false from cache after listModels for non-reasoning model", async () => {
    const { client } = createMockClient();
    client.listModels = vi.fn(
      async (): Promise<CopilotModel[]> => [{ id: "gpt-4.1", capabilities: { supports: { reasoningEffort: false } } }]
    );
    const wrapper = new CopilotWrapperService({ client });
    await wrapper.listModels();
    expect(wrapper.modelSupportsReasoning("gpt-4.1")).toBe(false);
  });

  it("listModels returns fallback model when client.listModels is absent", async () => {
    const { client } = createMockClient();
    const { listModels: _lm, ...clientWithoutListModels } = client;
    const wrapper = new CopilotWrapperService({ client: clientWithoutListModels as typeof client });
    const models = await wrapper.listModels();
    // Falls back to [{ id: this.model }] where default model is gpt-4.1
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("gpt-4.1");
  });

  it("streams end cleanly when sendAndWait rejects", async () => {
    const { client } = createMockClient();
    (client.createSession as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      const handlers = new Map<string, Array<(event: unknown) => void>>();
      return {
        sessionId: "err-session",
        handlers,
        on(event: string, handler: (e: unknown) => void) {
          if (!handlers.has(event)) handlers.set(event, []);
          handlers.get(event)!.push(handler);
          return () => {};
        },
        async sendAndWait() {
          throw new Error("SDK connection lost");
        },
        destroy: vi.fn(async () => {}),
      };
    });
    const wrapper = new CopilotWrapperService({ client });
    const errorSpy = vi.fn();
    wrapper.on("error", errorSpy);

    const chunks: string[] = [];
    // Should not throw — the generator ends and an error event is emitted
    for await (const chunk of wrapper.chat("Hi", { conversationId: "err-conv" })) {
      chunks.push(chunk);
    }
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: "SDK connection lost" }));
    expect(chunks).toEqual([]);
  });

  it("toolCall event fires perCallToolCallback and emits tool:call", async () => {
    const { client } = createMockClient();
    (client.createSession as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      const handlers = new Map<string, Array<(event: unknown) => void>>();
      return {
        sessionId: "tool-session",
        on(event: string, handler: (e: unknown) => void) {
          if (!handlers.has(event)) handlers.set(event, []);
          handlers.get(event)!.push(handler);
          return () => {};
        },
        async sendAndWait() {
          // Fire a toolCall event to exercise the handler branch
          for (const h of handlers.get("toolCall") ?? []) {
            h({ name: "my-tool", arguments: { arg: "val" } });
          }
          // Then end the delta stream
          for (const h of handlers.get("assistant.message_delta") ?? []) {
            h({ data: { deltaContent: "done" } });
          }
        },
        destroy: vi.fn(async () => {}),
      };
    });
    const onToolCall = vi.fn();
    const toolCallEvents: unknown[] = [];
    const wrapper = new CopilotWrapperService({ client });
    wrapper.on("tool:call", (e) => toolCallEvents.push(e));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { onToolCall, conversationId: "tc-conv" })) {
      /* consume */
    }
    expect(onToolCall).toHaveBeenCalledWith("my-tool", { arg: "val" });
    expect(toolCallEvents[0]).toMatchObject({ tool: "my-tool", args: { arg: "val" } });
  });

  it("isAuthenticated returns true when SDK reports authenticated", async () => {
    const { client } = createMockClient();
    // Mock reports authenticated via SDK
    client.getAuthStatus = vi.fn(async () => ({ isAuthenticated: true, authType: "env" }));
    const wrapper = new CopilotWrapperService({ client, githubToken: "ghp_abc" });
    expect(await wrapper.isAuthenticated()).toBe(true);
  });

  it("isAuthenticated returns false when no auth state exists and SDK reports not authenticated", async () => {
    const { client } = createMockClient();
    client.getAuthStatus = vi.fn(async () => ({ isAuthenticated: false, authType: undefined as string | undefined }));
    const wrapper = new CopilotWrapperService({ client, authPath: "/tmp/no-such-talos-auth.json" });
    expect(await wrapper.isAuthenticated()).toBe(false);
  });

  it("clearSessionUsage removes and returns usage", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "usage-clear" })) {
      /* consume */
    }
    const usage = wrapper.clearSessionUsage("usage-clear");
    expect(usage).not.toBeNull();
    expect(wrapper.getSessionUsage("usage-clear")).toBeNull();
  });

  // ── getGithubToken() tests ──

  it("getGithubToken returns env token when githubToken is set", async () => {
    const { client } = createMockClient();
    const wrapper = new CopilotWrapperService({ client, githubToken: "ghp_envtoken123" });
    const token = await wrapper.getGithubToken();
    expect(token).toBe("ghp_envtoken123");
  });

  it("getGithubToken reads from auth file when no env token available", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpPath = path.join(os.tmpdir(), `talos-auth-test-${Date.now()}.json`);
    await fs.writeFile(tmpPath, JSON.stringify({ token: "ghp_fromfile" }), { mode: 0o600 });

    const { client } = createMockClient();
    const origToken = process.env.GITHUB_TOKEN;
    const origCopilotToken = process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.COPILOT_GITHUB_TOKEN;

    const wrapper = new CopilotWrapperService({ client, authPath: tmpPath });
    const token = await wrapper.getGithubToken();
    expect(token).toBe("ghp_fromfile");

    await fs.unlink(tmpPath).catch(() => {});
    if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
    if (origCopilotToken !== undefined) process.env.COPILOT_GITHUB_TOKEN = origCopilotToken;
  });

  it("getGithubToken returns null when neither env token nor auth file exists", async () => {
    const { client } = createMockClient();
    const origToken = process.env.GITHUB_TOKEN;
    const origCopilotToken = process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.COPILOT_GITHUB_TOKEN;

    const wrapper = new CopilotWrapperService({ client, authPath: "/tmp/nonexistent-talos-auth-xyz.json" });
    const token = await wrapper.getGithubToken();
    expect(token).toBeNull();

    if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
    if (origCopilotToken !== undefined) process.env.COPILOT_GITHUB_TOKEN = origCopilotToken;
  });

  // ── attachments passthrough tests ──

  it("chat passes attachments to sendAndWait when provided in options", async () => {
    const { client } = createMockClient();
    const sendAndWaitSpy = vi.fn(async function (this: unknown) {
      return {};
    });
    (client.createSession as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      sessionId: "attach-session",
      on: (_event: string, _handler: unknown) => () => {},
      sendAndWait: sendAndWaitSpy,
      destroy: vi.fn(async () => {}),
    }));

    const wrapper = new CopilotWrapperService({ client });
    const attachments = [{ type: "file" as const, path: "/src/app.ts", content: "export default {}" }];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "attach-test", attachments })) {
      /* consume */
    }

    expect(sendAndWaitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Hi", attachments }),
      expect.any(Number)
    );
  });

  it("chat does not include attachments key in sendAndWait when not provided", async () => {
    const { client } = createMockClient();
    const sendAndWaitSpy = vi.fn(async function (this: unknown) {
      return {};
    });
    (client.createSession as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      sessionId: "no-attach-session",
      on: (_event: string, _handler: unknown) => () => {},
      sendAndWait: sendAndWaitSpy,
      destroy: vi.fn(async () => {}),
    }));

    const wrapper = new CopilotWrapperService({ client });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of wrapper.chat("Hi", { conversationId: "no-attach-test" })) {
      /* consume */
    }

    const callArg = (sendAndWaitSpy.mock.calls as unknown as [Record<string, unknown>][])[0]?.[0] ?? {};
    expect("attachments" in callArg).toBe(false);
  });
});
