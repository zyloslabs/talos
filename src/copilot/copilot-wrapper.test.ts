/**
 * CopilotWrapper + TokenTracker unit tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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
        // Simulate streaming text
        for (const h of this.handlers.get("text") ?? []) {
          h({ delta: "Hello " });
          h({ delta: "World" });
        }
        for (const h of this.handlers.get("usage") ?? []) {
          h({ promptTokens: 50, completionTokens: 20 });
        }
        return { text: "Hello World" };
      },
      destroy: vi.fn(async () => {}),
    };

    return {
      session: mockSession,
      client: {
        start: vi.fn(async () => {}),
        createSession: vi.fn(async () => mockSession),
        stop: vi.fn(async () => []),
        startDeviceAuth: vi.fn(async (): Promise<DeviceAuthInfo> => ({
          verificationUri: "https://github.com/login/device",
          userCode: "ABCD-1234",
        })),
        waitForAuth: vi.fn(async () => ({ token: "test-token", expiresAt: Date.now() + 3600000 })),
        listModels: vi.fn(async (): Promise<CopilotModel[]> => [
          { id: "gpt-4.1" },
          { id: "claude-sonnet-4" },
        ]),
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
    for await (const _ of wrapper.chat("Hi", { conversationId: "destroy-test" })) { /* consume */ }
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
});
