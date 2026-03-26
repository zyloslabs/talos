/**
 * Docker MCP Server Manager
 *
 * Manages lifecycle of Docker containers running MCP servers for JDBC and
 * Atlassian integrations. Containers are started on-demand and tracked per
 * application + source combination.
 */

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { TalosDataSource, TalosAtlassianConfig } from "../types.js";

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export type McpServerHandle = {
  containerId: string;
  applicationId: string;
  sourceId: string;
  type: "jdbc" | "atlassian";
  startedAt: Date;
};

export type AtlassianCredentials = {
  jiraUsername?: string;
  jiraApiToken?: string;
  jiraPersonalToken?: string;
  confluenceUsername?: string;
  confluenceApiToken?: string;
  confluencePersonalToken?: string;
};

export type DockerMcpManagerOptions = {
  /** Docker executable path (default: "docker") */
  dockerPath?: string;
};

// ── Manager Class ─────────────────────────────────────────────────────────────

export class DockerMcpManager {
  private running = new Map<string, McpServerHandle>();
  private dockerPath: string;
  private shutdownRegistered = false;

  constructor(options: DockerMcpManagerOptions = {}) {
    this.dockerPath = options.dockerPath ?? "docker";
  }

  private makeKey(applicationId: string, sourceId: string): string {
    return `${applicationId}:${sourceId}`;
  }

  private registerShutdownHook(): void {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;

    const cleanup = () => {
      for (const handle of this.running.values()) {
        try {
          // Synchronous best-effort cleanup on exit
          execFileSync(this.dockerPath, ["rm", "-f", handle.containerId], { timeout: 5000 });
        } catch {
          // Best effort — process is exiting
        }
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(130); });
    process.on("SIGTERM", () => { cleanup(); process.exit(143); });
  }

  /**
   * Start a JDBC MCP server in a Docker container.
   */
  async startJdbcServer(
    dataSource: TalosDataSource,
    resolvedCredentials: { username: string; password: string }
  ): Promise<McpServerHandle> {
    const key = this.makeKey(dataSource.applicationId, dataSource.id);
    const existing = this.running.get(key);
    if (existing) return existing;

    this.registerShutdownHook();

    const containerName = `talos-jdbc-${dataSource.id.slice(0, 8)}`;

    const args = [
      "run", "--rm", "-d",
      "--name", containerName,
      "--memory", "512m",
      "--cpus", "1",
      "--network", "none",
      "eclipse-temurin:21-jre",
      "sh", "-c",
      `jbang jdbc@quarkiverse/quarkus-mcp-servers "${dataSource.jdbcUrl}" -u "${resolvedCredentials.username}" -p "${resolvedCredentials.password}"`,
    ];

    const { stdout } = await execFileAsync(this.dockerPath, args, { timeout: 30000 });
    const containerId = stdout.trim().slice(0, 12);

    const handle: McpServerHandle = {
      containerId,
      applicationId: dataSource.applicationId,
      sourceId: dataSource.id,
      type: "jdbc",
      startedAt: new Date(),
    };

    this.running.set(key, handle);
    return handle;
  }

  /**
   * Start an Atlassian MCP server in a Docker container.
   */
  async startAtlassianServer(
    config: TalosAtlassianConfig,
    resolvedCredentials: AtlassianCredentials
  ): Promise<McpServerHandle> {
    const key = this.makeKey(config.applicationId, config.id);
    const existing = this.running.get(key);
    if (existing) return existing;

    this.registerShutdownHook();

    const containerName = `talos-atlassian-${config.id.slice(0, 8)}`;

    const env: string[] = [];
    if (config.jiraUrl) {
      env.push("-e", `JIRA_URL=${config.jiraUrl}`);
      env.push("-e", `JIRA_PROJECT=${config.jiraProject}`);

      if (resolvedCredentials.jiraUsername) {
        env.push("-e", `JIRA_USERNAME=${resolvedCredentials.jiraUsername}`);
      }
      if (resolvedCredentials.jiraApiToken) {
        env.push("-e", `JIRA_API_TOKEN=${resolvedCredentials.jiraApiToken}`);
      }
      if (resolvedCredentials.jiraPersonalToken) {
        env.push("-e", `JIRA_PERSONAL_TOKEN=${resolvedCredentials.jiraPersonalToken}`);
      }
      if (!config.jiraSslVerify) {
        env.push("-e", "JIRA_SSL_VERIFY=false");
      }
    }

    if (config.confluenceUrl) {
      env.push("-e", `CONFLUENCE_URL=${config.confluenceUrl}`);
      env.push("-e", `CONFLUENCE_SPACES=${config.confluenceSpaces.join(",")}`);

      if (resolvedCredentials.confluenceUsername) {
        env.push("-e", `CONFLUENCE_USERNAME=${resolvedCredentials.confluenceUsername}`);
      }
      if (resolvedCredentials.confluenceApiToken) {
        env.push("-e", `CONFLUENCE_API_TOKEN=${resolvedCredentials.confluenceApiToken}`);
      }
      if (resolvedCredentials.confluencePersonalToken) {
        env.push("-e", `CONFLUENCE_PERSONAL_TOKEN=${resolvedCredentials.confluencePersonalToken}`);
      }
      if (!config.confluenceSslVerify) {
        env.push("-e", "CONFLUENCE_SSL_VERIFY=false");
      }
    }

    const args = [
      "run", "--rm", "-d",
      "--name", containerName,
      "--memory", "512m",
      "--cpus", "1",
      ...env,
      "ghcr.io/sooperset/mcp-atlassian:latest",
    ];

    const { stdout } = await execFileAsync(this.dockerPath, args, { timeout: 30000 });
    const containerId = stdout.trim().slice(0, 12);

    const handle: McpServerHandle = {
      containerId,
      applicationId: config.applicationId,
      sourceId: config.id,
      type: "atlassian",
      startedAt: new Date(),
    };

    this.running.set(key, handle);
    return handle;
  }

  /**
   * Stop and remove a specific container.
   */
  async stopServer(containerId: string): Promise<void> {
    await execFileAsync(this.dockerPath, ["rm", "-f", containerId], { timeout: 10000 });

    for (const [key, handle] of this.running.entries()) {
      if (handle.containerId === containerId) {
        this.running.delete(key);
        break;
      }
    }
  }

  /**
   * Stop all containers for a given application.
   */
  async stopAllForApp(applicationId: string): Promise<void> {
    const toStop: McpServerHandle[] = [];
    for (const [key, handle] of this.running.entries()) {
      if (handle.applicationId === applicationId) {
        toStop.push(handle);
        this.running.delete(key);
      }
    }

    await Promise.all(
      toStop.map((h) =>
        execFileAsync(this.dockerPath, ["rm", "-f", h.containerId], { timeout: 10000 }).catch(() => {})
      )
    );
  }

  /**
   * List all currently running managed containers.
   */
  listRunning(): McpServerHandle[] {
    return Array.from(this.running.values());
  }

  /**
   * Check if a specific container is tracked as running.
   */
  isRunning(containerId: string): boolean {
    for (const handle of this.running.values()) {
      if (handle.containerId === containerId) return true;
    }
    return false;
  }
}
