import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  papers: defineTable({
    arxivId: v.string(),
    sanitizedId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    abstract: v.string(),
    published: v.string(),
    categories: v.array(v.string()),
    addedAt: v.string(),
  })
    .index("by_arxivId", ["arxivId"])
    .index("by_sanitizedId", ["sanitizedId"])
    .index("by_addedAt", ["addedAt"]),

  notes: defineTable({
    paperId: v.id("papers"),
    sanitizedPaperId: v.string(),
    filename: v.string(),
    title: v.string(),
    content: v.string(),
    model: v.optional(v.string()),
    createdAt: v.string(),
    modifiedAt: v.string(),
  })
    .index("by_paperId", ["paperId"])
    .index("by_sanitizedPaperId", ["sanitizedPaperId"])
    .index("by_modifiedAt", ["modifiedAt"]),

  threads: defineTable({
    title: v.string(),
    paperIds: v.array(v.string()),
    model: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_updatedAt", ["updatedAt"]),

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
      v.literal("note-generation"),
      v.literal("paper-import")
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
    noteFilename: v.optional(v.string()),
    prompt: v.optional(v.string()),
    taskType: v.optional(v.string()),
    model: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
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
});
