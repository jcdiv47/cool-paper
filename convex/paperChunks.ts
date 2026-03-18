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
  handler: async (ctx, { paperId, page }) => {
    const chunks = await ctx.db
      .query("paper_chunks")
      .withIndex("by_paperId_page", (q) =>
        q.eq("paperId", paperId).eq("page", page)
      )
      .collect();

    chunks.sort((a, b) => a.order - b.order);
    return chunks;
  },
});

export const getByRefIds = query({
  args: {
    paperId: v.id("papers"),
    indexVersion: v.number(),
    refIds: v.array(v.string()),
  },
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

    return matches.filter((chunk) => chunk !== null);
  },
});

export const resolveBySanitizedId = query({
  args: {
    sanitizedId: v.string(),
    refIds: v.array(v.string()),
  },
  handler: async (ctx, { sanitizedId, refIds }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();

    if (!paper?.activeIndexVersion) return [];

    const uniqueRefIds = [...new Set(refIds)];
    const matches = await Promise.all(
      uniqueRefIds.map((refId) =>
        ctx.db
          .query("paper_chunks")
          .withIndex("by_paperId_indexVersion_refId", (q) =>
            q.eq("paperId", paper._id)
              .eq("indexVersion", paper.activeIndexVersion!)
              .eq("refId", refId)
          )
          .first()
      )
    );

    return matches
      .filter((chunk) => chunk !== null)
      .map((chunk) => ({
        ...chunk,
        sanitizedId,
      }));
  },
});

export const resolveAcrossSanitizedIds = query({
  args: {
    sanitizedIds: v.array(v.string()),
    refIds: v.array(v.string()),
  },
  handler: async (ctx, { sanitizedIds, refIds }) => {
    const uniqueRefIds = [...new Set(refIds)];
    const results = [];

    for (const sanitizedId of [...new Set(sanitizedIds)]) {
      const paper = await ctx.db
        .query("papers")
        .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
        .first();

      if (!paper?.activeIndexVersion) continue;

      const matches = await Promise.all(
        uniqueRefIds.map((refId) =>
          ctx.db
            .query("paper_chunks")
            .withIndex("by_paperId_indexVersion_refId", (q) =>
              q.eq("paperId", paper._id)
                .eq("indexVersion", paper.activeIndexVersion!)
                .eq("refId", refId)
            )
            .first()
        )
      );

      for (const chunk of matches) {
        if (!chunk) continue;
        results.push({
          ...chunk,
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
  handler: async (ctx, { paperId, query: queryText, page, section, limit = 20 }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper?.activeIndexVersion) return [];

    let chunks = await ctx.db
      .query("paper_chunks")
      .withIndex("by_paperId_indexVersion", (q) =>
        q.eq("paperId", paperId).eq("indexVersion", paper.activeIndexVersion!)
      )
      .collect();

    if (page !== undefined) {
      chunks = chunks.filter((c) => c.page === page);
    }
    if (section) {
      const sectionLower = section.toLowerCase();
      chunks = chunks.filter(
        (c) => c.section && c.section.toLowerCase().includes(sectionLower)
      );
    }
    if (queryText) {
      const queryLower = queryText.toLowerCase();
      chunks = chunks.filter((c) => c.normText.includes(queryLower));
    }

    chunks.sort((a, b) => a.page - b.page || a.order - b.order);

    return chunks.slice(0, limit).map((c) => ({
      refId: c.refId,
      page: c.page,
      order: c.order,
      section: c.section,
      text: c.text,
    }));
  },
});

export const replaceForIndex = mutation({
  args: {
    paperId: v.id("papers"),
    indexVersion: v.number(),
    chunks: v.array(chunkInput),
  },
  handler: async (ctx, { paperId, indexVersion, chunks }) => {
    await clearIndexChunks(ctx, paperId, indexVersion);

    for (const chunk of chunks) {
      await ctx.db.insert("paper_chunks", {
        paperId,
        indexVersion,
        ...chunk,
      });
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
  handler: async (ctx, { paperId, indexVersion, chunks }) => {
    for (const chunk of chunks) {
      await ctx.db.insert("paper_chunks", {
        paperId,
        indexVersion,
        ...chunk,
      });
    }
    return chunks.length;
  },
});
