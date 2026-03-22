/**
 * Talos Runner Subsystem
 *
 * Playwright-based test execution with artifact capture.
 */

export { PlaywrightRunner, type PlaywrightRunnerOptions, type TestExecutionResult, type ExecutionOptions } from "./playwright-runner.js";
export { ArtifactManager, type ArtifactManagerOptions, type SaveArtifactInput } from "./artifact-manager.js";
export { CredentialInjector, type CredentialInjectorOptions, type ResolvedCredentials, type StorageState } from "./credential-injector.js";
