/**
 * Criteria Generator
 *
 * AI-powered acceptance criteria generation from RAG knowledge base.
 * Uses requirement, api_spec, and user_story chunks to generate
 * structured Given/When/Then acceptance criteria via LLM.
 */

import type { TalosAcceptanceCriteria, AcceptanceCriteriaScenario } from "../types.js";
import type { TalosRepository } from "../repository.js";
import type { RagPipeline } from "../rag/rag-pipeline.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CriteriaGeneratorOptions = {
  ragPipeline: RagPipeline;
  repository: TalosRepository;
  generateWithLLM: (prompt: string) => Promise<string>;
};

export type GenerationOptions = {
  requirementFilter?: string;
  maxCriteria?: number;
};

export type GenerationResult = {
  criteriaCreated: number;
  totalChunksAnalyzed: number;
  averageConfidence: number;
};

type LLMCriteriaOutput = {
  criteria: Array<{
    title: string;
    description: string;
    scenarios: AcceptanceCriteriaScenario[];
    preconditions: string[];
    dataRequirements: string[];
    nfrTags: string[];
    confidence: number;
  }>;
};

// ── Prompt Templates ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Senior QA Engineer specializing in acceptance criteria generation.
Your task is to generate structured acceptance criteria from the provided requirement context.

IMPORTANT CONSTRAINTS:
- Use ONLY the provided context to generate criteria. Do not invent requirements.
- Each criterion must use the Given/When/Then format for scenarios.
- Assign a confidence score (0-1) based on how clearly the requirement maps to the criterion.
- Include relevant preconditions, data requirements, and non-functional requirement tags.

OUTPUT FORMAT: Respond with ONLY valid JSON matching this structure:
{
  "criteria": [
    {
      "title": "Short descriptive title",
      "description": "Detailed description of the acceptance criterion",
      "scenarios": [
        { "given": "precondition state", "when": "action performed", "then": "expected result" }
      ],
      "preconditions": ["list of preconditions"],
      "dataRequirements": ["list of data requirements"],
      "nfrTags": ["performance", "security", "usability", etc.],
      "confidence": 0.85
    }
  ]
}`;

const FEW_SHOT_EXAMPLE = `
EXAMPLE INPUT:
Requirement: "Users must be able to reset their password via email verification"

EXAMPLE OUTPUT:
{
  "criteria": [
    {
      "title": "Password reset via email verification",
      "description": "Users can reset their password by requesting an email with a verification link",
      "scenarios": [
        {
          "given": "a registered user who has forgotten their password",
          "when": "they request a password reset and click the verification link in the email",
          "then": "they should be able to set a new password and log in with it"
        },
        {
          "given": "a registered user requesting a password reset",
          "when": "they enter an invalid or expired verification code",
          "then": "they should see an error message and be prompted to request a new code"
        }
      ],
      "preconditions": ["User has a registered account", "Email service is operational"],
      "dataRequirements": ["Valid user email address", "Password reset token"],
      "nfrTags": ["security", "usability"],
      "confidence": 0.92
    }
  ]
}`;

// ── Criteria Generator ────────────────────────────────────────────────────────

export class CriteriaGenerator {
  private ragPipeline: RagPipeline;
  private repository: TalosRepository;
  private generateWithLLM: (prompt: string) => Promise<string>;

  constructor(options: CriteriaGeneratorOptions) {
    this.ragPipeline = options.ragPipeline;
    this.repository = options.repository;
    this.generateWithLLM = options.generateWithLLM;
  }

  /**
   * Generate acceptance criteria from requirements in the knowledge base.
   */
  async generateCriteria(appId: string, options: GenerationOptions = {}): Promise<GenerationResult> {
    const maxCriteria = options.maxCriteria ?? 20;

    // Retrieve relevant requirement chunks via RAG
    const query = options.requirementFilter ?? "requirements acceptance criteria user stories";
    const ragContext = await this.ragPipeline.retrieveWithFilters(appId, query, {
      types: ["requirement", "api_spec", "user_story"],
      limit: 30,
    });

    const chunks = ragContext.chunks;
    if (chunks.length === 0) {
      return { criteriaCreated: 0, totalChunksAnalyzed: 0, averageConfidence: 0 };
    }

    // Build prompt with context
    const contextBlock = chunks
      .map((c, i) => `[Chunk ${i + 1} | type: ${c.type} | file: ${c.filePath}]\n${c.content}`)
      .join("\n\n---\n\n");

    // Include intelligence data if available (#429)
    let intelligenceBlock = "";
    const intelligence = this.repository.getIntelligenceReport(appId);
    if (intelligence) {
      const parts: string[] = [];
      if (intelligence.techStack.length > 0) {
        parts.push(
          "Tech Stack: " +
            intelligence.techStack
              .map((t) => `${t.name}${t.version ? ` v${t.version}` : ""} (${t.category})`)
              .join(", ")
        );
      }
      if (intelligence.databases.length > 0) {
        parts.push("Databases: " + intelligence.databases.map((d) => `${d.type} via ${d.source}`).join(", "));
      }
      if (intelligence.testUsers.length > 0) {
        parts.push(
          "Test Users: " +
            intelligence.testUsers.map((u) => `${u.variableName}${u.roleHint ? ` [${u.roleHint}]` : ""}`).join(", ")
        );
      }
      if (parts.length > 0) {
        intelligenceBlock = `\n\nAPPLICATION INTELLIGENCE (from repository scan):\n${parts.join("\n")}`;
      }
    }

    const prompt = `${SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLE}

---

CONTEXT (from knowledge base):
${contextBlock}${intelligenceBlock}

Generate up to ${maxCriteria} acceptance criteria from the above context. Respond with ONLY valid JSON.`;

    // Call LLM
    const llmResponse = await this.generateWithLLM(prompt);

    // Parse and validate response
    const parsed = this.parseResponse(llmResponse);
    if (!parsed || parsed.criteria.length === 0) {
      return { criteriaCreated: 0, totalChunksAnalyzed: chunks.length, averageConfidence: 0 };
    }

    // Limit to maxCriteria
    const criteriaToCreate = parsed.criteria.slice(0, maxCriteria);

    // Save criteria to repository atomically
    let totalConfidence = 0;
    let created = 0;

    this.repository.runInTransaction(() => {
      for (const c of criteriaToCreate) {
        const confidence = Math.max(0, Math.min(1, c.confidence ?? 0.5));
        this.repository.createAcceptanceCriteria({
          applicationId: appId,
          title: c.title,
          description: c.description,
          scenarios: c.scenarios ?? [],
          preconditions: c.preconditions ?? [],
          dataRequirements: c.dataRequirements ?? [],
          nfrTags: c.nfrTags ?? [],
          confidence,
          tags: [],
        });
        totalConfidence += confidence;
        created++;
      }
    });

    return {
      criteriaCreated: created,
      totalChunksAnalyzed: chunks.length,
      averageConfidence: created > 0 ? totalConfidence / created : 0,
    };
  }

  /**
   * Generate a single acceptance criterion from a natural language description.
   */
  async suggestCriteria(description: string, appId: string): Promise<TalosAcceptanceCriteria> {
    const prompt = `${SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLE}

---

USER REQUEST:
${description}

Generate exactly 1 acceptance criterion for the above request. Respond with ONLY valid JSON.`;

    const llmResponse = await this.generateWithLLM(prompt);
    const parsed = this.parseResponse(llmResponse);

    if (!parsed || parsed.criteria.length === 0) {
      // Return a minimal criterion if parsing fails
      return this.repository.createAcceptanceCriteria({
        applicationId: appId,
        title: description.slice(0, 100),
        description,
        scenarios: [],
        preconditions: [],
        dataRequirements: [],
        nfrTags: [],
        confidence: 0,
        tags: [],
        status: "draft",
      });
    }

    const c = parsed.criteria[0];
    return this.repository.createAcceptanceCriteria({
      applicationId: appId,
      title: c.title,
      description: c.description,
      scenarios: c.scenarios ?? [],
      preconditions: c.preconditions ?? [],
      dataRequirements: c.dataRequirements ?? [],
      nfrTags: c.nfrTags ?? [],
      confidence: Math.max(0, Math.min(1, c.confidence ?? 0.5)),
      tags: [],
      status: "draft",
    });
  }

  /**
   * Parse and validate LLM JSON response.
   */
  private parseResponse(response: string): LLMCriteriaOutput | null {
    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = response;
      const jsonMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(response);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr) as LLMCriteriaOutput;
      if (!parsed.criteria || !Array.isArray(parsed.criteria)) {
        return null;
      }

      // Validate each criterion structure
      const valid = parsed.criteria.filter((c) => typeof c.title === "string" && c.title.length > 0);

      return { criteria: valid };
    } catch {
      return null;
    }
  }
}
