/**
 * Tests for orchestrate-context module-level setters.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  setActiveOrchestrateContext,
  clearActiveOrchestrateContext,
  getActiveOrchestrateContext,
  type OrchestrateContext,
} from "./orchestrate-context.js";

describe("OrchestrateContext", () => {
  afterEach(() => {
    clearActiveOrchestrateContext();
  });

  it("returns null when no context is set", () => {
    expect(getActiveOrchestrateContext()).toBeNull();
  });

  it("sets and retrieves context", () => {
    const ctx: OrchestrateContext = {
      sessionId: "sess-1",
      chatId: "chat-1",
      parentTaskId: "task-1",
      model: "gpt-4.1",
    };
    setActiveOrchestrateContext(ctx);
    expect(getActiveOrchestrateContext()).toEqual(ctx);
  });

  it("returns a copy, not the original reference", () => {
    const ctx: OrchestrateContext = { sessionId: "sess-1", chatId: "chat-1" };
    setActiveOrchestrateContext(ctx);
    const retrieved = getActiveOrchestrateContext();
    expect(retrieved).not.toBe(ctx);
    expect(retrieved).toEqual(ctx);
  });

  it("clears the context", () => {
    setActiveOrchestrateContext({ sessionId: "sess-1", chatId: "chat-1" });
    clearActiveOrchestrateContext();
    expect(getActiveOrchestrateContext()).toBeNull();
  });

  it("overwrites previous context on re-set", () => {
    setActiveOrchestrateContext({ sessionId: "sess-1", chatId: "chat-1" });
    setActiveOrchestrateContext({ sessionId: "sess-2", chatId: "chat-2", model: "o4-mini" });
    expect(getActiveOrchestrateContext()).toEqual({
      sessionId: "sess-2",
      chatId: "chat-2",
      model: "o4-mini",
    });
  });

  it("handles context without optional fields", () => {
    setActiveOrchestrateContext({ sessionId: "sess-1", chatId: "chat-1" });
    const ctx = getActiveOrchestrateContext();
    expect(ctx?.parentTaskId).toBeUndefined();
    expect(ctx?.model).toBeUndefined();
  });
});
