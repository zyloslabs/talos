/**
 * GitHubExportService
 *
 * Pushes exported Playwright test packages to a user-chosen GitHub repository
 * using the GitHub REST API.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type GitHubExportServiceOptions = {
  pat: string;
  baseUrl?: string;
};

export type EnsureRepoResult = {
  created: boolean;
  exists: boolean;
};

export type PushFilesResult = {
  pushedCount: number;
  repoUrl: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

export class GitHubExportService {
  private pat: string;
  private baseUrl: string;

  constructor({ pat, baseUrl = "https://api.github.com" }: GitHubExportServiceOptions) {
    if (!pat) throw new Error("GitHub PAT is required");
    this.pat = pat;
    // Validate baseUrl scheme — only https is allowed for GitHub API calls
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("GitHubExportService: baseUrl must use https");
    }
    // Remove trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    };
  }

  /**
   * Ensure the repository exists. If it doesn't exist and createIfNotExists is true,
   * it will be created under the authenticated user's account.
   */
  async ensureRepo(owner: string, repo: string, createIfNotExists: boolean): Promise<EnsureRepoResult> {
    const checkRes = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: this.headers,
    });

    if (checkRes.ok) {
      return { created: false, exists: true };
    }

    if (checkRes.status === 404 && createIfNotExists) {
      const createRes = await fetch(`${this.baseUrl}/user/repos`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          name: repo,
          description: "Playwright tests exported from Talos",
          private: false,
          auto_init: true,
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Failed to create repository ${owner}/${repo}: ${createRes.status} ${text}`);
      }

      return { created: true, exists: true };
    }

    if (checkRes.status === 404) {
      return { created: false, exists: false };
    }

    const text = await checkRes.text();
    throw new Error(`Failed to check repository ${owner}/${repo}: ${checkRes.status} ${text}`);
  }

  /**
   * Push files to the repository on the given branch.
   * For each file, GET the current SHA (if it exists) then PUT to create/update.
   */
  async pushFiles(
    owner: string,
    repo: string,
    branch: string,
    files: Array<{ path: string; content: string }>
  ): Promise<PushFilesResult> {
    let pushedCount = 0;

    for (const file of files) {
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      const contentsUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;

      // Get existing SHA for updates
      let existingSha: string | undefined;
      const getRes = await fetch(`${contentsUrl}?ref=${encodeURIComponent(branch)}`, {
        headers: this.headers,
      });
      if (getRes.ok) {
        const data = (await getRes.json()) as { sha?: string };
        existingSha = data.sha;
      }

      // Create or update the file
      const body: Record<string, unknown> = {
        message: "chore: update test suite via Talos export",
        content: Buffer.from(file.content).toString("base64"),
        branch,
      };
      if (existingSha) {
        body.sha = existingSha;
      }

      const putRes = await fetch(contentsUrl, {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!putRes.ok) {
        const text = await putRes.text();
        throw new Error(`Failed to push file ${file.path} to ${owner}/${repo}: ${putRes.status} ${text}`);
      }

      pushedCount++;
    }

    return {
      pushedCount,
      repoUrl: `https://github.com/${owner}/${repo}`,
    };
  }
}
