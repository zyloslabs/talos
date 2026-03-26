/**
 * Integration module — JDBC and Atlassian MCP server management.
 */

export { DockerMcpManager, type McpServerHandle, type AtlassianCredentials } from "./docker-mcp-manager.js";
export { createJdbcTools, type JdbcToolsOptions } from "./jdbc-tools.js";
export { createAtlassianTools, type AtlassianToolsOptions } from "./atlassian-tools.js";
