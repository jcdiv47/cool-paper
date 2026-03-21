import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const chunkInput = v.object({
  refId: v.string(),
  page: v.number(),
  order: v.number(),
  section: v.optional(v.string()),
  text: v.string(),
  normText: v.string(),
  prefix: v.optional(v.string()),
  suffix: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});

const chunkResultValidator = v.object({
  refId: v.string(),
  page: v.number(),
  order: v.number(),
  section: v.optional(v.string()),
  text: v.string(),
  normText: v.string(),
  prefix: v.optional(v.string()),
  suffix: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});

const chunkWithSanitizedIdValidator = v.object({
  refId: v.string(),
  page: v.number(),
  order: v.number(),
  section: v.optional(v.string()),
  text: v.string(),
  normText: v.string(),
  prefix: v.optional(v.string()),
  suffix: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  sanitizedId: v.string(),
});

function toChunkResult(chunk: {
  refId: string;
  page: number;
  order: number;
  section?: string;
  text: string;
  normText: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
}) {
  return {
    refId: chunk.refId,
    page: chunk.page,
    order: chunk.order,
    section: chunk.section,
    text: chunk.text,
    normText: chunk.normText,
    prefix: chunk.prefix,
    suffix: chunk.suffix,
    start: chunk.start,
    end: chunk.end,
  };
}

function buildChunkInsert(
  paperId: Id<"papers">,
  indexVersion: number,
  chunk: {
    refId: string;
    page: number;
    order: number;
    section?: string;
    text: string;
    normText: string;
    prefix?: string;
    suffix?: string;
    start?: number;
    end?: number;
  },
) {
  return {
    paperId,
    indexVersion,
    ...chunk,
    sectionSearchText: chunk.section?.toLowerCase() ?? "",
  };
}

async function clearIndexChunks(
  ctx: MutationCtx,
  paperId: Id<"papers">,
  indexVersion: number
) {
  const chunks = await ctx.db
    .query("paper_chunks")
    .withIndex("by_paperId_indexVersion", (q) =>
      q.eq("paperId", paperId).eq("indexVersion", indexVersion)
    )
    .collect();

  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

export const listByPage = query({
  args: { paperId: v.id("papers"), page: v.number() },
  returns: v.array(chunkResultValidator),
  handler: async (ctx, { paperId, page }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper || paper.activeIndexVersion === undefined) return [];
    const activeIndexVersion = paper.activeIndexVersion;

    const chunks = await ctx.db
      .query("paper_chunks")
      .withIndex("by_paperId_indexVersion_page", (q) =>
        q
          .eq("paperId", paperId)
          .eq("indexVersion", activeIndexVersion)
          .eq("page", page)
      )
      .collect();

    chunks.sort((a, b) => a.order - b.order);
    return chunks.map(toChunkResult);
  },
});

export const getByRefIds = query({
  args: {
    paperId: v.id("papers"),
    indexVersion: v.number(),
    refIds: v.array(v.string()),
  },
  returns: v.array(chunkResultValidator),
  handler: async (ctx, { paperId, indexVersion, refIds }) => {
    const uniqueRefIds = [...new Set(refIds)];
    const matches = await Promise.all(
      uniqueRefIds.map((refId) =>
        ctx.db
          .query("paper_chunks")
          .withIndex("by_paperId_indexVersion_refId", (q) =>
            q.eq("paperId", paperId)
              .eq("indexVersion", indexVersion)
              .eq("refId", refId)
          )
          .first()
      )
    );

    return matches.filter((chunk) => chunk !== null).map(toChunkResult);
  },
});

export const resolveBySanitizedId = query({
  args: {
    sanitizedId: v.string(),
    refIds: v.array(v.string()),
  },
  returns: v.array(chunkWithSanitizedIdValidator),
  handler: async (ctx, { sanitizedId, refIds }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();

    if (!paper || paper.activeIndexVersion === undefined) return [];
    const activeIndexVersion = paper.activeIndexVersion;

    const uniqueRefIds = [...new Set(refIds)];
    const matches = await Promise.all(
      uniqueRefIds.map((refId) =>
        ctx.db
          .query("paper_chunks")
          .withIndex("by_paperId_indexVersion_refId", (q) =>
            q.eq("paperId", paper._id)
              .eq("indexVersion", activeIndexVersion)
              .eq("refId", refId)
          )
          .first()
      )
    );

    return matches
      .filter((chunk) => chunk !== null)
      .map((chunk) => ({
        ...toChunkResult(chunk),
        sanitizedId,
      }));
  },
});

export const resolveAcrossSanitizedIds = query({
  args: {
    sanitizedIds: v.array(v.string()),
    refIds: v.array(v.string()),
  },
  returns: v.array(chunkWithSanitizedIdValidator),
  handler: async (ctx, { sanitizedIds, refIds }) => {
    if (sanitizedIds.length > 50) throw new Error("Too many sanitizedIds (max 50)");
    if (refIds.length > 500) throw new Error("Too many refIds (max 500)");

    const uniqueRefIds = [...new Set(refIds)];
    const results: Array<{
      refId: string;
      page: number;
      order: number;
      section?: string;
      text: string;
      normText: string;
      prefix?: string;
      suffix?: string;
      start?: number;
      end?: number;
      sanitizedId: string;
    }> = [];

    for (const sanitizedId of [...new Set(sanitizedIds)]) {
      const paper = await ctx.db
        .query("papers")
        .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
        .first();

      if (!paper || paper.activeIndexVersion === undefined) continue;
      const activeIndexVersion = paper.activeIndexVersion;

      const matches = await Promise.all(
        uniqueRefIds.map((refId) =>
          ctx.db
            .query("paper_chunks")
            .withIndex("by_paperId_indexVersion_refId", (q) =>
              q.eq("paperId", paper._id)
                .eq("indexVersion", activeIndexVersion)
                .eq("refId", refId)
            )
            .first()
        )
      );

      for (const chunk of matches) {
        if (!chunk) continue;
        results.push({
          ...toChunkResult(chunk),
          sanitizedId,
        });
      }
    }

    return results;
  },
});

export const search = query({
  args: {
    paperId: v.id("papers"),
    query: v.optional(v.string()),
    page: v.optional(v.number()),
    section: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(chunkResultValidator),
  handler: async (ctx, { paperId, query: queryText, page, section, limit = 20 }) => {
    const paper = await ctx.db.get(paperId);
    const activeIndexVersion = paper?.activeIndexVersion;
    if (activeIndexVersion === undefined) return [];

    let chunks;
    if (queryText) {
      chunks = await ctx.db
        .query("paper_chunks")
        .withSearchIndex("search_normText", (q) => {
          const filtered = q
            .search("normText", queryText.toLowerCase())
            .eq("paperId", paperId)
            .eq("indexVersion", activeIndexVersion);
          return page !== undefined ? filtered.eq("page", page) : filtered;
        })
        .take(limit);
    } else if (section) {
      chunks = await ctx.db
        .query("paper_chunks")
        .withSearchIndex("search_section", (q) => {
          const filtered = q
            .search("sectionSearchText", section.toLowerCase())
            .eq("paperId", paperId)
            .eq("indexVersion", activeIndexVersion);
          return page !== undefined ? filtered.eq("page", page) : filtered;
        })
        .take(limit);
    } else if (page !== undefined) {
      chunks = await ctx.db
        .query("paper_chunks")
        .withIndex("by_paperId_indexVersion_page", (q) =>
          q
            .eq("paperId", paperId)
            .eq("indexVersion", activeIndexVersion)
            .eq("page", page)
        )
        .collect();
    } else {
      chunks = await ctx.db
        .query("paper_chunks")
        .withIndex("by_paperId_indexVersion", (q) =>
          q.eq("paperId", paperId).eq("indexVersion", activeIndexVersion)
        )
        .take(limit);
    }

    if (section && queryText) {
      const sectionLower = section.toLowerCase();
      chunks = chunks.filter(
        (c) => c.section && c.section.toLowerCase().includes(sectionLower)
      );
    }

    chunks.sort((a, b) => a.page - b.page || a.order - b.order);

    return chunks.slice(0, limit).map(toChunkResult);
  },
});

export const replaceForIndex = mutation({
  args: {
    paperId: v.id("papers"),
    indexVersion: v.number(),
    chunks: v.array(chunkInput),
  },
  returns: v.number(),
  handler: async (ctx, { paperId, indexVersion, chunks }) => {
    await clearIndexChunks(ctx, paperId, indexVersion);

    for (const chunk of chunks) {
      await ctx.db.insert("paper_chunks", buildChunkInsert(paperId, indexVersion, chunk));
    }

    return chunks.length;
  },
});

export const appendForIndex = mutation({
  args: {
    paperId: v.id("papers"),
    indexVersion: v.number(),
    chunks: v.array(chunkInput),
  },
  returns: v.number(),
  handler: async (ctx, { paperId, indexVersion, chunks }) => {
    for (const chunk of chunks) {
      await ctx.db.insert("paper_chunks", buildChunkInsert(paperId, indexVersion, chunk));
    }
    return chunks.length;
  },
});
