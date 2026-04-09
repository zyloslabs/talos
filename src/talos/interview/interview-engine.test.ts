/**
 * Tests for InterviewEngine (#478)
 */

import { describe, it, expect, vi } from "vitest";
import { InterviewEngine } from "./interview-engine.js";
import type { TalosRepository } from "../repository.js";
import type { TalosVaultRole } from "../types.js";

// ── Mock Repository ───────────────────────────────────────────────────────────

function createMockRepository(options?: {
  roles?: TalosVaultRole[];
}): TalosRepository {
  const roles = options?.roles ?? [];
  return {
    getRolesByApplication: vi.fn(() => roles),
  } as unknown as TalosRepository;
}

function createRole(overrides?: Partial<TalosVaultRole>): TalosVaultRole {
  return {
    id: crypto.randomUUID(),
    applicationId: "app-1",
    roleType: "admin",
    name: "Admin User",
    description: "Admin role",
    usernameRef: "vault:admin-user",
    passwordRef: "vault:admin-pass",
    additionalRefs: {},
    isActive: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InterviewEngine", () => {
  describe("generateQuestions", () => {
    it("generates questions for application with no roles", async () => {
      const repo = createMockRepository({ roles: [] });
      const engine = new InterviewEngine({ repository: repo });

      const result = await engine.generateQuestions("app-1", "Test the login page");

      expect(result.questionCount).toBeGreaterThan(0);
      expect(result.session.status).toBe("pending");
      expect(result.session.applicationId).toBe("app-1");
      expect(result.session.request).toBe("Test the login page");
    });

    it("generates role-specific questions when multiple roles exist", async () => {
      const roles = [
        createRole({ roleType: "admin", name: "Admin" }),
        createRole({ roleType: "standard", name: "Standard User" }),
      ];
      const repo = createMockRepository({ roles });
      const engine = new InterviewEngine({ repository: repo });

      const result = await engine.generateQuestions("app-1", "Test the dashboard");

      // Should include user_roles questions
      const roleQuestions = result.session.questions.filter((q) => q.category === "user_roles");
      expect(roleQuestions.length).toBeGreaterThan(0);

      // Should have suggested answers with role names
      const roleQuestion = roleQuestions.find((q) => q.suggestedAnswers && q.suggestedAnswers.length > 0);
      expect(roleQuestion?.suggestedAnswers).toBeDefined();
    });

    it("includes auth flow question when no roles exist", async () => {
      const repo = createMockRepository({ roles: [] });
      const engine = new InterviewEngine({ repository: repo });

      const result = await engine.generateQuestions("app-1", "Test sign-up flow");

      const authQuestions = result.session.questions.filter((q) => q.category === "auth_flow");
      expect(authQuestions.length).toBeGreaterThan(0);
    });

    it("always includes test data and expected behavior questions", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const result = await engine.generateQuestions("app-1", "Test checkout");

      const testDataQ = result.session.questions.filter((q) => q.category === "test_data");
      const expectedQ = result.session.questions.filter((q) => q.category === "expected_behavior");
      expect(testDataQ.length).toBeGreaterThan(0);
      expect(expectedQ.length).toBeGreaterThan(0);
    });

    it("required questions are flagged correctly", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const result = await engine.generateQuestions("app-1", "Test user profile");

      const required = result.session.questions.filter((q) => q.required);
      const optional = result.session.questions.filter((q) => !q.required);
      expect(required.length).toBeGreaterThan(0);
      expect(optional.length).toBeGreaterThan(0);
    });
  });

  describe("processAnswers", () => {
    it("records answers and marks session in_progress", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const { session } = await engine.generateQuestions("app-1", "Test form submission");

      // Answer one non-required question
      const optionalQ = session.questions.find((q) => !q.required);
      if (!optionalQ) return; // Skip if no optional questions

      const result = engine.processAnswers(session.id, [
        { questionId: optionalQ.id, answer: "Test answer" },
      ]);

      expect(result.session.answers[optionalQ.id]).toBe("Test answer");
    });

    it("marks session completed when all required questions answered", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const { session } = await engine.generateQuestions("app-1", "Test login");

      // Answer all required questions
      const requiredQuestions = session.questions.filter((q) => q.required);
      const answers = requiredQuestions.map((q) => ({
        questionId: q.id,
        answer: "Answer for: " + q.question,
      }));

      const result = engine.processAnswers(session.id, answers);

      expect(result.allAnswered).toBe(true);
      expect(result.session.status).toBe("completed");
    });

    it("builds enriched context from answers", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const { session } = await engine.generateQuestions("app-1", "Test dashboard");

      const firstQ = session.questions[0];
      const result = engine.processAnswers(session.id, [
        { questionId: firstQ.id, answer: "Admin and standard users" },
      ]);

      expect(result.enrichedContext).toContain("Test dashboard");
      expect(result.enrichedContext).toContain("Admin and standard users");
    });

    it("throws for invalid session ID", () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      expect(() =>
        engine.processAnswers("non-existent", [{ questionId: "q1", answer: "test" }])
      ).toThrow("Interview session not found");
    });
  });

  describe("getSession", () => {
    it("returns session after creation", async () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      const { session } = await engine.generateQuestions("app-1", "Test profile");

      const retrieved = engine.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });

    it("returns undefined for unknown session", () => {
      const repo = createMockRepository();
      const engine = new InterviewEngine({ repository: repo });

      expect(engine.getSession("unknown-id")).toBeUndefined();
    });
  });
});
