/**
 * Interview Engine (#478)
 *
 * Analyzes user request + RAG context and generates clarifying questions
 * about user roles, auth flows, test data, edge cases, and expected behaviors.
 */

import type {
  InterviewQuestion,
  InterviewSession,
  InterviewAnswer,
  InterviewQuestionCategory,
  TalosVaultRole,
  TalosChunk,
  CrawledPage,
} from "../types.js";
import type { TalosRepository } from "../repository.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InterviewEngineOptions = {
  repository: TalosRepository;
  /** LLM call for generating questions */
  generateWithLLM?: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

export type InterviewContext = {
  applicationId: string;
  request: string;
  vaultRoles: TalosVaultRole[];
  ragChunks: TalosChunk[];
  crawledPages: CrawledPage[];
};

export type GenerateQuestionsResult = {
  session: InterviewSession;
  questionCount: number;
};

export type AnswerResult = {
  session: InterviewSession;
  allAnswered: boolean;
  enrichedContext: string;
};

// ── Question Templates ────────────────────────────────────────────────────────

type QuestionTemplate = {
  category: InterviewQuestionCategory;
  question: string;
  context: string;
  condition: (ctx: InterviewContext) => boolean;
  suggestedAnswers?: (ctx: InterviewContext) => string[];
  required: boolean;
};

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    category: "user_roles",
    question: "Which user roles should be tested?",
    context: "Testing with different roles ensures proper authorization enforcement.",
    condition: (ctx) => ctx.vaultRoles.length > 1,
    suggestedAnswers: (ctx) => ctx.vaultRoles.map((r) => `${r.roleType} (${r.name})`),
    required: true,
  },
  {
    category: "user_roles",
    question: "Are there any user roles that should NOT have access to this feature?",
    context: "Negative testing verifies access is properly denied for unauthorized roles.",
    condition: (ctx) => ctx.vaultRoles.length > 1,
    required: false,
  },
  {
    category: "auth_flow",
    question: "What authentication method does this app use? (e.g., username/password, SSO, OAuth, MFA)",
    context: "Understanding auth flow is critical for test setup and credential injection.",
    condition: (ctx) => ctx.vaultRoles.length === 0,
    required: true,
  },
  {
    category: "auth_flow",
    question: "Does this feature require multi-factor authentication (MFA/2FA)?",
    context: "MFA flows require special handling with TOTP or email verification.",
    condition: () => true,
    required: false,
  },
  {
    category: "test_data",
    question: "What test data is needed? Should tests create their own data or use existing data?",
    context: "Test data strategy affects test isolation and reliability.",
    condition: () => true,
    required: true,
  },
  {
    category: "test_data",
    question: "Are there specific database states or seed data required before testing?",
    context: "Some tests need pre-existing records to validate editing/deletion workflows.",
    condition: (ctx) => ctx.ragChunks.some((c) => c.type === "schema"),
    required: false,
  },
  {
    category: "edge_cases",
    question: "What edge cases should be covered? (e.g., empty states, max values, special characters)",
    context: "Edge case coverage improves test robustness.",
    condition: () => true,
    required: false,
  },
  {
    category: "edge_cases",
    question: "Should the tests cover error scenarios? (e.g., network failures, invalid inputs, timeout handling)",
    context: "Error handling tests verify the app gracefully handles failures.",
    condition: () => true,
    required: false,
  },
  {
    category: "expected_behavior",
    question: "What is the expected success outcome? (e.g., redirect, toast message, data saved)",
    context: "Clear success criteria enable accurate assertions.",
    condition: () => true,
    required: true,
  },
  {
    category: "scope",
    question: "Should the test cover only the happy path, or also failure scenarios?",
    context: "Scope clarity prevents over-engineered tests.",
    condition: () => true,
    required: false,
  },
  {
    category: "scope",
    question: "Which specific pages or features should be tested?",
    context: "Targeted scope produces more relevant tests.",
    condition: (ctx) => ctx.crawledPages.length > 3,
    suggestedAnswers: (ctx) => ctx.crawledPages.slice(0, 10).map((p) => `${p.title} (${p.url})`),
    required: false,
  },
  {
    category: "priority",
    question: "What is the priority level? Should we focus on critical paths or comprehensive coverage?",
    context: "Priority helps allocate test generation resources effectively.",
    condition: () => true,
    required: false,
  },
];

// ── Interview Engine ──────────────────────────────────────────────────────────

export class InterviewEngine {
  private repository: TalosRepository;
  private sessions = new Map<string, InterviewSession>();

  constructor(options: InterviewEngineOptions) {
    this.repository = options.repository;
    // generateWithLLM reserved for future LLM-based dynamic question generation
    void options.generateWithLLM;
  }

  /**
   * Generate clarifying questions based on request + RAG context.
   */
  async generateQuestions(
    applicationId: string,
    request: string
  ): Promise<GenerateQuestionsResult> {
    // Gather context
    const vaultRoles = this.repository.getRolesByApplication(applicationId);
    const ragChunks: TalosChunk[] = [];
    const crawledPages: CrawledPage[] = this.extractCrawledPages(ragChunks);

    const context: InterviewContext = {
      applicationId,
      request,
      vaultRoles,
      ragChunks,
      crawledPages,
    };

    // Generate questions from templates
    const questions = this.buildQuestions(context);

    // Create session
    const session: InterviewSession = {
      id: crypto.randomUUID(),
      applicationId,
      request,
      questions,
      answers: {},
      status: "pending",
      createdAt: new Date(),
    };

    this.sessions.set(session.id, session);

    return {
      session,
      questionCount: questions.length,
    };
  }

  /**
   * Process answers to an interview session.
   */
  processAnswers(
    sessionId: string,
    answers: InterviewAnswer[]
  ): AnswerResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Interview session not found: ${sessionId}`);
    }

    // Record answers
    for (const answer of answers) {
      session.answers[answer.questionId] = answer.answer;
    }

    // Check if all required questions are answered
    const requiredQuestions = session.questions.filter((q) => q.required);
    const allAnswered = requiredQuestions.every((q) => session.answers[q.id]);

    session.status = allAnswered ? "completed" : "in_progress";

    // Build enriched context from answers
    const enrichedContext = this.buildEnrichedContext(session);

    return {
      session,
      allAnswered,
      enrichedContext,
    };
  }

  /**
   * Get an existing session.
   */
  getSession(sessionId: string): InterviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private buildQuestions(context: InterviewContext): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];

    for (const template of QUESTION_TEMPLATES) {
      if (!template.condition(context)) continue;

      const question: InterviewQuestion = {
        id: crypto.randomUUID(),
        category: template.category,
        question: template.question,
        context: template.context,
        suggestedAnswers: template.suggestedAnswers?.(context),
        required: template.required,
      };

      questions.push(question);
    }

    return questions;
  }

  private buildEnrichedContext(session: InterviewSession): string {
    const parts: string[] = [
      `## Original Request\n${session.request}`,
      "",
      "## Interview Answers",
    ];

    for (const question of session.questions) {
      const answer = session.answers[question.id];
      if (answer) {
        parts.push(`### ${question.category}: ${question.question}`);
        parts.push(answer);
        parts.push("");
      }
    }

    return parts.join("\n");
  }

  private extractCrawledPages(chunks: TalosChunk[]): CrawledPage[] {
    return chunks
      .filter((c) => c.type === "crawled_page")
      .map((c) => {
        try {
          return JSON.parse(c.content) as CrawledPage;
        } catch {
          return null;
        }
      })
      .filter((p): p is CrawledPage => p !== null);
  }
}
