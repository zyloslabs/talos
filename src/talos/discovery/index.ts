/**
 * Talos Discovery Subsystem
 *
 * GitHub MCP-based repository discovery and indexing.
 */

export { DiscoveryEngine, type DiscoveryEngineOptions } from "./discovery-engine.js";
export { GitHubApiClient, type GitHubApiClientOptions, type GitHubFile, type GitHubTree } from "./github-api-client.js";
export { FileChunker, type ChunkResult, type ChunkerOptions } from "./file-chunker.js";
export { resolveGitHubPat, type ResolvePatOptions, type EnvLookup } from "./resolve-pat.js";
