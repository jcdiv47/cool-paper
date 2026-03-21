import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Validators (kept identical to the shapes the frontend already expects)
// ---------------------------------------------------------------------------
const spotlightPaperValidator = v.object({
  sanitizedId: v.string(),
  title: v.string(),
  authors: v.array(v.string()),
  summary: v.optional(v.string()),
  categories: v.array(v.string()),
  published: v.string(),
  threadCount: v.number(),
  messageCount: v.number(),
  annotationCount: v.number(),
  citationCount: v.number(),
});

const activityItemValidator = v.object({
  type: v.union(
    v.literal("paper_added"),
    v.literal("thread_created"),
    v.literal("annotation_created")
  ),
  timestamp: v.string(),
  title: v.string(),
  subtitle: v.optional(v.string()),
  href: v.string(),
});

// ---------------------------------------------------------------------------
// Unified dashboard query — reads each table exactly once
// ---------------------------------------------------------------------------
export const unified = query({
  args: {},
  returns: v.object({
    stats: v.object({
      paperCount: v.number(),
      threadCount: v.number(),
      messageCount: v.number(),
      annotationCount: v.number(),
      citationCount: v.number(),
      categoryCount: v.number(),
    }),
    spotlightPapers: v.array(spotlightPaperValidator),
    categoryDistribution: v.array(
      v.object({
        category: v.string(),
        count: v.number(),
      })
    ),
    activityTimeline: v.array(
      v.object({
        week: v.string(),
        papersAdded: v.number(),
        threadsCreated: v.number(),
      })
    ),
    recentActivity: v.array(activityItemValidator),
    heatmap: v.array(
      v.object({
        date: v.number(),
        value: v.number(),
      })
    ),
  }),
  handler: async (ctx) => {
    // =================================================================
    // Single table scans (each table read exactly once)
    // =================================================================
    const papers = await ctx.db.query("papers").collect();
    const threads = await ctx.db.query("threads").collect();
    const annotations = await ctx.db.query("annotations").collect();
    const citations = await ctx.db.query("message_citations").collect();

    // =================================================================
    // Lookup maps (avoid N+1 queries throughout)
    // =================================================================
    const paperById = new Map<string, Doc<"papers">>();
    const paperBySanitizedId = new Map<string, Doc<"papers">>();
    for (const p of papers) {
      paperById.set(p._id as string, p);
      paperBySanitizedId.set(p.sanitizedId, p);
    }

    // =================================================================
    // 1. Stats
    // =================================================================
    const activeThreads = threads.filter((t) => (t.messageCount ?? 0) > 0);
    const messageCount = threads.reduce(
      (sum, t) => sum + (t.messageCount ?? 0),
      0
    );
    const categories = new Set(papers.flatMap((p) => p.categories));

    const stats = {
      paperCount: papers.length,
      threadCount: activeThreads.length,
      messageCount,
      annotationCount: annotations.length,
      citationCount: citations.length,
      categoryCount: categories.size,
    };

    // =================================================================
    // 2. Spotlight papers (replaces N+3 sub-queries with in-memory maps)
    // =================================================================
    // Group threads by solePaperId
    const threadsByPaper = new Map<string, { count: number; messages: number }>();
    for (const t of threads) {
      if (!t.solePaperId) continue;
      const entry = threadsByPaper.get(t.solePaperId) ?? {
        count: 0,
        messages: 0,
      };
      entry.count++;
      entry.messages += t.messageCount ?? 0;
      threadsByPaper.set(t.solePaperId, entry);
    }

    // Group annotations by paperId
    const annotationCountByPaper = new Map<string, number>();
    for (const a of annotations) {
      const key = a.paperId as string;
      annotationCountByPaper.set(key, (annotationCountByPaper.get(key) ?? 0) + 1);
    }

    // Group citations by paperId
    const citationCountByPaper = new Map<string, number>();
    for (const c of citations) {
      const key = c.paperId as string;
      citationCountByPaper.set(key, (citationCountByPaper.get(key) ?? 0) + 1);
    }

    const enriched = papers.map((paper) => {
      const threadInfo = threadsByPaper.get(paper.sanitizedId) ?? {
        count: 0,
        messages: 0,
      };
      const annCount = annotationCountByPaper.get(paper._id as string) ?? 0;
      const citCount = citationCountByPaper.get(paper._id as string) ?? 0;

      const score =
        threadInfo.count * 3 +
        threadInfo.messages +
        annCount * 2 +
        citCount;

      return {
        sanitizedId: paper.sanitizedId,
        title: paper.title,
        authors: paper.authors,
        summary: paper.summary,
        categories: paper.categories,
        published: paper.published,
        threadCount: threadInfo.count,
        messageCount: threadInfo.messages,
        annotationCount: annCount,
        citationCount: citCount,
        _score: score,
      };
    });

    enriched.sort((a, b) => b._score - a._score);

    const spotlightPapers = enriched
      .filter((p) => p._score > 0)
      .slice(0, 6)
      .map(({ _score: _, ...rest }) => rest);

    // =================================================================
    // 3. Category distribution
    // =================================================================
    const catCounts: Record<string, number> = {};
    for (const p of papers) {
      for (const cat of p.categories) {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
    }
    const categoryDistribution = Object.entries(catCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // =================================================================
    // 4. Activity timeline (last 6 months, weekly buckets)
    // =================================================================
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString();

    function getWeekStart(dateStr: string): string {
      const d = new Date(dateStr);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().slice(0, 10);
    }

    const weekMap: Record<
      string,
      { papersAdded: number; threadsCreated: number }
    > = {};

    // Generate all weeks in range so chart has no gaps
    const cursor = new Date(getWeekStart(cutoff));
    const endWeek = getWeekStart(now.toISOString());
    while (cursor.toISOString().slice(0, 10) <= endWeek) {
      const key = cursor.toISOString().slice(0, 10);
      weekMap[key] = { papersAdded: 0, threadsCreated: 0 };
      cursor.setDate(cursor.getDate() + 7);
    }

    for (const p of papers) {
      if (p.addedAt >= cutoff) {
        const week = getWeekStart(p.addedAt);
        if (weekMap[week]) weekMap[week].papersAdded++;
      }
    }

    for (const t of activeThreads) {
      if (t.createdAt >= cutoff) {
        const week = getWeekStart(t.createdAt);
        if (weekMap[week]) weekMap[week].threadsCreated++;
      }
    }

    const activityTimeline = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({ week, ...data }));

    // =================================================================
    // 5. Recent activity (replaces N+1 paper lookups with in-memory map)
    // =================================================================
    type ActivityItem = {
      type: "paper_added" | "thread_created" | "annotation_created";
      timestamp: string;
      title: string;
      subtitle?: string;
      href: string;
    };

    const events: ActivityItem[] = [];

    // Recent papers (take 20 most recent by addedAt)
    const recentPapers = [...papers]
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .slice(0, 20);

    for (const p of recentPapers) {
      events.push({
        type: "paper_added",
        timestamp: p.addedAt,
        title: p.title,
        subtitle: p.categories[0],
        href: `/paper/${p.sanitizedId}`,
      });
    }

    // Recent threads (take 20 most recent by updatedAt)
    const recentThreads = [...activeThreads]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20);

    for (const t of recentThreads) {
      const firstPaperId = t.paperIds[0];
      const paper = firstPaperId
        ? paperBySanitizedId.get(firstPaperId)
        : undefined;

      events.push({
        type: "thread_created",
        timestamp: t.createdAt,
        title: t.title,
        subtitle: paper?.title,
        href: `/chat/${t._id}`,
      });
    }

    // Recent annotations (take 20 most recent by createdAt)
    const recentAnnotations = [...annotations]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);

    for (const a of recentAnnotations) {
      const paper = paperById.get(a.paperId as string);
      if (!paper) continue;

      const label =
        a.kind === "highlight"
          ? `Highlighted in "${paper.title}"`
          : `Note on "${paper.title}"`;

      events.push({
        type: "annotation_created",
        timestamp: a.createdAt,
        title: label,
        subtitle:
          a.exact.length > 80 ? a.exact.slice(0, 80) + "..." : a.exact,
        href: `/paper/${paper.sanitizedId}`,
      });
    }

    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const recentActivity = events.slice(0, 8);

    // =================================================================
    // 6. Enriched heatmap
    // =================================================================
    const heatCounts: Record<string, number> = {};

    function addDate(isoString: string) {
      const d = new Date(isoString);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      heatCounts[key] = (heatCounts[key] || 0) + 1;
    }

    for (const p of papers) {
      if (p.addedAt) addDate(p.addedAt);
    }
    for (const t of activeThreads) {
      if (t.createdAt) addDate(t.createdAt);
    }
    for (const a of annotations) {
      if (a.createdAt) addDate(a.createdAt);
    }

    const heatmap = Object.entries(heatCounts).map(([dateStr, value]) => ({
      date: Math.floor(new Date(dateStr).getTime() / 1000),
      value,
    }));

    // =================================================================
    return {
      stats,
      spotlightPapers,
      categoryDistribution,
      activityTimeline,
      recentActivity,
      heatmap,
    };
  },
});
