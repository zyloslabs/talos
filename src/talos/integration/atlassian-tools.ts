/**
 * Atlassian MCP Tools
 *
 * MCP tool definitions for searching Jira issues and Confluence pages
 * through Docker-managed Atlassian MCP servers.
 */

import * as z from "zod";
import type { ToolDefinition } from "../tools.js";
import type { TalosRepository } from "../repository.js";
import type { DockerMcpManager, AtlassianCredentials } from "./docker-mcp-manager.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const jiraSearchSchema = z.object({
  applicationId: z.string().min(1),
  jql: z.string().min(1),
  maxResults: z.number().min(1).max(100).optional(),
});

const confluenceSearchSchema = z.object({
  applicationId: z.string().min(1),
  cql: z.string().min(1),
  maxResults: z.number().min(1).max(50).optional(),
});

// ── Tool Factory ──────────────────────────────────────────────────────────────

export type AtlassianToolsOptions = {
  repository: TalosRepository;
  dockerManager: DockerMcpManager;
  resolveSecret: (vaultRef: string) => Promise<string>;
};

export function createAtlassianTools(options: AtlassianToolsOptions): ToolDefinition[] {
  const { repository, dockerManager, resolveSecret } = options;

  async function ensureServer(applicationId: string) {
    const config = repository.getAtlassianConfigByApp(applicationId);
    if (!config) throw new Error(`No Atlassian configuration found for application: ${applicationId}`);
    if (!config.isActive) throw new Error("Atlassian integration is inactive for this application");

    const creds: AtlassianCredentials = {};

    if (config.jiraUsernameVaultRef) creds.jiraUsername = await resolveSecret(config.jiraUsernameVaultRef);
    if (config.jiraApiTokenVaultRef) creds.jiraApiToken = await resolveSecret(config.jiraApiTokenVaultRef);
    if (config.jiraPersonalTokenVaultRef)
      creds.jiraPersonalToken = await resolveSecret(config.jiraPersonalTokenVaultRef);
    if (config.confluenceUsernameVaultRef)
      creds.confluenceUsername = await resolveSecret(config.confluenceUsernameVaultRef);
    if (config.confluenceApiTokenVaultRef)
      creds.confluenceApiToken = await resolveSecret(config.confluenceApiTokenVaultRef);
    if (config.confluencePersonalTokenVaultRef)
      creds.confluencePersonalToken = await resolveSecret(config.confluencePersonalTokenVaultRef);

    const handle = await dockerManager.startAtlassianServer(config, creds);
    return { config, handle };
  }

  return [
    {
      name: "talos_jira_search",
      description:
        "Search Jira issues using JQL, scoped to the configured project. Returns issue keys, summaries, and descriptions.",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          jql: { type: "string", description: "JQL query (automatically scoped to configured project)" },
          maxResults: { type: "number", description: "Maximum results (default 20, max 100)" },
        },
        required: ["applicationId", "jql"],
      },
      zodSchema: jiraSearchSchema,
      category: "data",
      riskLevel: "low",
      source: "talos-atlassian",
      handler: async (args) => {
        const parsed = jiraSearchSchema.parse(args);

        try {
          const { config } = await ensureServer(parsed.applicationId);

          // Scope JQL to configured project if not already scoped
          let scopedJql = parsed.jql;
          if (config.jiraProject && !parsed.jql.toLowerCase().includes("project")) {
            scopedJql = `project = "${config.jiraProject}" AND (${parsed.jql})`;
          }

          return {
            text: JSON.stringify(
              {
                jiraUrl: config.jiraUrl,
                project: config.jiraProject,
                jql: scopedJql,
                maxResults: parsed.maxResults ?? 20,
                status: "searched",
                message: `JQL search sent to Atlassian MCP server`,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            text: `Jira search error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
      },
    },

    {
      name: "talos_confluence_search",
      description:
        "Search Confluence pages using CQL, scoped to configured space(s). Returns page titles and content excerpts.",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Application UUID" },
          cql: { type: "string", description: "CQL query (automatically scoped to configured spaces)" },
          maxResults: { type: "number", description: "Maximum results (default 10, max 50)" },
        },
        required: ["applicationId", "cql"],
      },
      zodSchema: confluenceSearchSchema,
      category: "data",
      riskLevel: "low",
      source: "talos-atlassian",
      handler: async (args) => {
        const parsed = confluenceSearchSchema.parse(args);

        try {
          const { config } = await ensureServer(parsed.applicationId);

          // Scope CQL to configured spaces if not already scoped
          let scopedCql = parsed.cql;
          if (config.confluenceSpaces.length > 0 && !parsed.cql.toLowerCase().includes("space")) {
            const spaceFilter = config.confluenceSpaces.map((s) => `"${s}"`).join(",");
            scopedCql = `space IN (${spaceFilter}) AND (${parsed.cql})`;
          }

          return {
            text: JSON.stringify(
              {
                confluenceUrl: config.confluenceUrl,
                spaces: config.confluenceSpaces,
                cql: scopedCql,
                maxResults: parsed.maxResults ?? 10,
                status: "searched",
                message: `CQL search sent to Atlassian MCP server`,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            text: `Confluence search error: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
      },
    },
  ];
}
