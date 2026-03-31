/**
 * Shared PAT resolution logic for GitHub API access.
 *
 * Determines the correct Personal Access Token based on whether the target
 * host is GitHub Enterprise (GHE) or github.com.
 */

export type EnvLookup = (key: string) => string | undefined;

export interface ResolvePatOptions {
  isGhe: boolean;
  envLookup?: EnvLookup;
}

/**
 * Resolve the GitHub PAT for a given host context.
 *
 * For GHE hosts: GHE_PERSONAL_ACCESS_TOKEN → GITHUB_PERSONAL_ACCESS_TOKEN → GITHUB_TOKEN → COPILOT_GITHUB_TOKEN
 * For github.com: GITHUB_PERSONAL_ACCESS_TOKEN → GITHUB_TOKEN → COPILOT_GITHUB_TOKEN
 *
 * Each key is checked in process.env first, then via the optional envLookup
 * (e.g. EnvManager.getRaw) for user-managed .env files.
 */
export function resolveGitHubPat(options: ResolvePatOptions): string {
  const { isGhe, envLookup } = options;
  const lookup = envLookup ?? (() => undefined);

  const keys = isGhe
    ? [
        "GHE_PERSONAL_ACCESS_TOKEN",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "GITHUB_TOKEN",
        "COPILOT_GITHUB_TOKEN",
      ]
    : [
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "GITHUB_TOKEN",
        "COPILOT_GITHUB_TOKEN",
      ];

  for (const key of keys) {
    const value = process.env[key] ?? lookup(key);
    if (value) return value;
  }

  return "";
}
