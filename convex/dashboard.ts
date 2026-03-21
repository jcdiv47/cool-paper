import { query } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Query 1: Dashboard stats — aggregate counts across all tables
// ---------------------------------------------------------------------------
export const stats = query({
  args: {},
  returns: v.object({
    paperCount: v.number(),
    threadCount: v.number(),
    messageCount: v.number(),
    annotationCount: v.number(),
    citationCount: v.number(),
    categoryCount: v.number(),
  }),
  handler: async (ctx) => {
    const papers = await ctx.db.query("papers").collect();
    const threads = await ctx.db.query("threads").collect();
    const messageCount = threads.reduce(
      (sum, t) => sum + (t.messageCount ?? 0),
      0
    );
    const annotations = await ctx.db.query("annotations").collect();
    const citations = await ctx.db.query("message_citations").collect();
    const categories = new Set(papers.flatMap((p) => p.categories));

    return {
      paperCount: papers.length,
      threadCount: threads.filter((t) => (t.messageCount ?? 0) > 0).length,
      messageCount,
      annotationCount: annotations.length,
      citationCount: citations.length,
      categoryCount: categories.size,
    };
  },
});

// ---------------------------------------------------------------------------
// Query 2: Spotlight papers — top papers ranked by engagement score
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

export const spotlightPapers = query({
  args: {},
  returns: v.array(spotlightPaperValidator),
  handler: async (ctx) => {
    const papers = await ctx.db.query("papers").collect();

    const enriched = await Promise.all(
      papers.map(async (paper) => {
        // Threads referencing this paper
        const threads = await ctx.db
          .query("threads")
          .withIndex("by_solePaperId", (q) =>
            q.eq("solePaperId", paper.sanitizedId)
          )
          .collect();
        const messageCount = threads.reduce(
          (s, t) => s + (t.messageCount ?? 0),
          0
        );

        // Annotations on this paper
        const annotations = await ctx.db
          .query("annotations")
          .withIndex("by_paperId", (q) => q.eq("paperId", paper._id))
          .collect();

        // Citations referencing this paper
        const citations = await ctx.db
          .query("message_citations")
          .withIndex("by_paperId_refId", (q) => q.eq("paperId", paper._id))
          .collect();

        const score =
          threads.length * 3 +
          messageCount +
          annotations.length * 2 +
          citations.length;

        return {
          sanitizedId: paper.sanitizedId,
          title: paper.title,
          authors: paper.authors,
          summary: paper.summary,
          categories: paper.categories,
          published: paper.published,
          threadCount: threads.length,
          messageCount,
          annotationCount: annotations.length,
          citationCount: citations.length,
          _score: score,
        };
      })
    );

    enriched.sort((a, b) => b._score - a._score);

    return enriched
      .filter((p) => p._score > 0)
      .slice(0, 6)
      .map(({ _score: _, ...rest }) => rest);
  },
});

// ---------------------------------------------------------------------------
// Query 3: Category distribution — paper counts per arXiv category
// ---------------------------------------------------------------------------
export const categoryDistribution = query({
  args: {},
  returns: v.array(
    v.object({
      category: v.string(),
      count: v.number(),
    })
  ),
  handler: async (ctx) => {
    const papers = await ctx.db.query("papers").collect();
    const counts: Record<string, number> = {};
    for (const p of papers) {
      for (const cat of p.categories) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  },
});

// ---------------------------------------------------------------------------
// Query 4: Activity timeline — weekly paper/thread counts for last 6 months
// ---------------------------------------------------------------------------
export const activityTimeline = query({
  args: {},
  returns: v.array(
    v.object({
      week: v.string(),
      papersAdded: v.number(),
      threadsCreated: v.number(),
    })
  ),
  handler: async (ctx) => {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString();

    const papers = await ctx.db.query("papers").collect();
    const threads = await ctx.db.query("threads").collect();

    // Get Monday of a given date as ISO date string
    function getWeekStart(dateStr: string): string {
      const d = new Date(dateStr);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().slice(0, 10);
    }

    const weekMap: Record<string, { papersAdded: number; threadsCreated: number }> = {};

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

    for (const t of threads) {
      if (t.createdAt >= cutoff && (t.messageCount ?? 0) > 0) {
        const week = getWeekStart(t.createdAt);
        if (weekMap[week]) weekMap[week].threadsCreated++;
      }
    }

    return Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({ week, ...data }));
  },
});

// ---------------------------------------------------------------------------
// Query 5: Recent activity — unified feed of latest events
// ---------------------------------------------------------------------------
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

export const recentActivity = query({
  args: {},
  returns: v.array(activityItemValidator),
  handler: async (ctx) => {
    const papers = await ctx.db
      .query("papers")
      .withIndex("by_addedAt")
      .order("desc")
      .take(20);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(20);

    const annotations = await ctx.db.query("annotations").collect();

    type ActivityItem = {
      type: "paper_added" | "thread_created" | "annotation_created";
      timestamp: string;
      title: string;
      subtitle?: string;
      href: string;
    };

    const events: ActivityItem[] = [];

    // Paper additions
    for (const p of papers) {
      events.push({
        type: "paper_added",
        timestamp: p.addedAt,
        title: p.title,
        subtitle: p.categories[0],
        href: `/paper/${p.sanitizedId}`,
      });
    }

    // Thread creation (only non-empty threads)
    for (const t of threads) {
      if ((t.messageCount ?? 0) === 0) continue;

      // Resolve first paper title
      let paperTitle: string | undefined;
      const firstPaperId = t.paperIds[0];
      if (firstPaperId) {
        const paper = await ctx.db
          .query("papers")
          .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", firstPaperId))
          .first();
        paperTitle = paper?.title;
      }

      events.push({
        type: "thread_created",
        timestamp: t.createdAt,
        title: t.title,
        subtitle: paperTitle,
        href: `/chat/${t._id}`,
      });
    }

    // Annotations — sort by createdAt desc, take most recent
    const sortedAnnotations = annotations
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);

    for (const a of sortedAnnotations) {
      const paper = await ctx.db.get(a.paperId);
      if (!paper) continue;

      const label =
        a.kind === "highlight"
          ? `Highlighted in "${paper.title}"`
          : `Note on "${paper.title}"`;

      events.push({
        type: "annotation_created",
        timestamp: a.createdAt,
        title: label,
        subtitle: a.exact.length > 80 ? a.exact.slice(0, 80) + "..." : a.exact,
        href: `/paper/${paper.sanitizedId}`,
      });
    }

    // Sort all events by timestamp desc and return top 8
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return events.slice(0, 8);
  },
});

// ---------------------------------------------------------------------------
// Query 6: Enriched heatmap — combines papers + threads + annotations by date
// ---------------------------------------------------------------------------
export const enrichedHeatmap = query({
  args: {},
  returns: v.array(
    v.object({
      date: v.number(),
      value: v.number(),
    })
  ),
  handler: async (ctx) => {
    const papers = await ctx.db.query("papers").collect();
    const threads = await ctx.db.query("threads").collect();
    const annotations = await ctx.db.query("annotations").collect();

    const counts: Record<string, number> = {};

    function addDate(isoString: string) {
      const d = new Date(isoString);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    for (const p of papers) {
      if (p.addedAt) addDate(p.addedAt);
    }

    for (const t of threads) {
      if (t.createdAt && (t.messageCount ?? 0) > 0) addDate(t.createdAt);
    }

    for (const a of annotations) {
      if (a.createdAt) addDate(a.createdAt);
    }

    return Object.entries(counts).map(([dateStr, value]) => ({
      date: Math.floor(new Date(dateStr).getTime() / 1000),
      value,
    }));
  },
});
