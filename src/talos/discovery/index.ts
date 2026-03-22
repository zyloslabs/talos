/**
 * Talos Discovery Subsystem
 *
 * GitHub MCP-based repository discovery and indexing.
 */

export { DiscoveryEngine, type DiscoveryEngineOptions } from "./discovery-engine.js";
export { GitHubMcpClient, type GitHubMcpClientOptions, type GitHubFile, type GitHubTree } from "./github-mcp-client.js";
export { FileChunker, type ChunkResult, type ChunkerOptions } from "./file-chunker.js";
