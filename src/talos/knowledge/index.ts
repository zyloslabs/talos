/**
 * Talos Knowledge Subsystem
 *
 * Document ingestion, auto-tagging, and knowledge base management.
 */

export {
  DocumentIngester,
  type DocumentIngesterOptions,
  type DocFormat,
  type DocMetadata,
  type IngestResult,
} from "./document-ingester.js";

export {
  AutoTagger,
  DOC_TYPES,
  PERSONAS,
  NFR_TAGS,
  ENVIRONMENTS,
} from "./auto-tagger.js";

export {
  CriteriaGenerator,
  type CriteriaGeneratorOptions,
  type GenerationOptions,
  type GenerationResult,
} from "./criteria-generator.js";
