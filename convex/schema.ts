import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { normalizedModelMetadataEntryValidator } from "./lib/openRouterModels";

const sectionOutlineEntryValidator = v.object({
  title: v.string(),
  startPage: v.number(),
});

export default defineSchema({
  papers: defineTable({
    arxivId: v.string(),
    sanitizedId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    abstract: v.string(),
    summary: v.optional(v.string()),
    published: v.string(),
    categories: v.array(v.string()),
    addedAt: v.string(),
    activeIndexVersion: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    // Import status values: "queued", "downloading_pdf", "downloading_source",
    // "building_index", "generating_summary", "completed", or "failed: <reason>".
    // Uses v.string() because "failed:" prefix carries a dynamic error message.
    importStatus: v.optional(v.string()),
  })
    .index("by_arxivId", ["arxivId"])
    .index("by_sanitizedId", ["sanitizedId"])
    .index("by_addedAt", ["addedAt"]),

  threads: defineTable({
    title: v.string(),
    paperIds: v.array(v.string()),
    solePaperId: v.optional(v.string()),
    model: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    agentThreadId: v.optional(v.string()),
    chatStatus: v.optional(v.union(v.literal("generating"), v.literal("error"))),
    chatError: v.optional(v.string()),
    chatGeneration: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    preview: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .index("by_solePaperId", ["solePaperId"])
    .index("by_solePaperId_updatedAt", ["solePaperId", "updatedAt"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    thinking: v.optional(v.string()),
    model: v.optional(v.string()),
    timestamp: v.string(),
    isPartial: v.optional(v.boolean()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_threadId_timestamp", ["threadId", "timestamp"]),

  jobs: defineTable({
    type: v.union(
      v.literal("paper-import"),
      v.literal("paper-delete")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    sanitizedPaperId: v.string(),
    paperId: v.optional(v.string()),
    model: v.optional(v.string()),
    payload: v.optional(v.string()),
    workerId: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    completedAt: v.optional(v.string()),
    cancelRequestedAt: v.optional(v.string()),
    error: v.optional(v.string()),
    displayCommand: v.optional(v.string()),
  })
    .index("by_sanitizedPaperId", ["sanitizedPaperId"])
    .index("by_status", ["status"])
    .index("by_sanitizedPaperId_status", ["sanitizedPaperId", "status"]),

  job_events: defineTable({
    jobId: v.id("jobs"),
    eventType: v.string(),
    data: v.string(),
    sequenceNumber: v.number(),
    timestamp: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_sequence", ["jobId", "sequenceNumber"]),

  paper_indexes: defineTable({
    paperId: v.id("papers"),
    version: v.number(),
    extractorVersion: v.string(),
    createdAt: v.string(),
    sectionOutline: v.optional(v.array(sectionOutlineEntryValidator)),
  })
    .index("by_paperId", ["paperId"])
    .index("by_paperId_version", ["paperId", "version"]),

  paper_chunks: defineTable({
    paperId: v.id("papers"),
    indexVersion: v.number(),
    refId: v.string(),
    page: v.number(),
    order: v.number(),
    section: v.optional(v.string()),
    sectionSearchText: v.string(),
    text: v.string(),
    normText: v.string(),
    prefix: v.optional(v.string()),
    suffix: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  })
    .index("by_paperId_indexVersion", ["paperId", "indexVersion"])
    .index("by_paperId_indexVersion_refId", ["paperId", "indexVersion", "refId"])
    .index("by_paperId_page", ["paperId", "page"])
    .index("by_paperId_indexVersion_page", ["paperId", "indexVersion", "page"])
    .searchIndex("search_normText", {
      searchField: "normText",
      filterFields: ["paperId", "indexVersion", "page"],
    })
    .searchIndex("search_section", {
      searchField: "sectionSearchText",
      filterFields: ["paperId", "indexVersion", "page"],
    }),

  message_citations: defineTable({
    messageId: v.id("messages"),
    paperId: v.id("papers"),
    indexVersion: v.number(),
    refId: v.string(),
    occurrence: v.number(),
    createdAt: v.string(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_messageId_occurrence", ["messageId", "occurrence"])
    .index("by_paperId_refId", ["paperId", "refId"]),

  annotations: defineTable({
    paperId: v.id("papers"),
    indexVersion: v.number(),
    kind: v.union(v.literal("highlight"), v.literal("note")),
    authorType: v.union(v.literal("user"), v.literal("agent")),
    color: v.optional(v.string()),
    comment: v.optional(v.string()),
    chunkRefId: v.optional(v.string()),
    page: v.number(),
    exact: v.string(),
    prefix: v.optional(v.string()),
    suffix: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_paperId", ["paperId"])
    .index("by_paperId_indexVersion", ["paperId", "indexVersion"])
    .index("by_paperId_chunkRefId", ["paperId", "chunkRefId"]),

  paper_source_files: defineTable({
    paperId: v.id("papers"),
    relativePath: v.string(),
    content: v.string(),
    fileType: v.string(),
  })
    .index("by_paperId", ["paperId"])
    .index("by_paperId_path", ["paperId", "relativePath"]),

  model_metadata_cache: defineTable({
    cacheKey: v.string(),
    entries: v.array(normalizedModelMetadataEntryValidator),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_cacheKey", ["cacheKey"]),
});
