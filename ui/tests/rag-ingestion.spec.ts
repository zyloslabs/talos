/**
 * RAG ingestion (issue #553) — App Detail knowledge panel calls the ingest
 * endpoint and the chunk count surfaces back.
 *
 * Pending: the Knowledge tab on `/talos/[appId]` does not yet expose an upload
 * affordance — ingestion is currently only reachable through the Setup Wizard.
 * Tracked in #565. Once that ships, replace the fixme below with a real flow
 * that drives the upload and asserts the chunk count card updates.
 */
import { test } from "@playwright/test";

test.fixme("Knowledge tab upload → chunkCount updates (Pending #565)", async () => {
  // intentionally empty — see #565 (UI gap: Knowledge tab missing document upload)
});
