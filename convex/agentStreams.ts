import { query } from "./_generated/server";
import { v } from "convex/values";
import { vStreamArgs, syncStreams } from "@convex-dev/agent";
import { vStreamDelta, vStreamMessage } from "@convex-dev/agent/validators";
import { components } from "./_generated/api";

const streamMessagesReturnValueValidator = v.object({
  streams: v.optional(
    v.union(
      v.object({ kind: v.literal("list"), messages: v.array(vStreamMessage) }),
      v.object({ kind: v.literal("deltas"), deltas: v.array(vStreamDelta) }),
    ),
  ),
});

/**
 * Exposes the agent component's streaming deltas for a given agent thread.
 * Used by useStreamingUIMessages on the client to render real-time text
 * and reasoning tokens while the agent is generating a response.
 */
export const getStreams = query({
  args: {
    threadId: v.string(),
    streamArgs: v.optional(vStreamArgs),
  },
  returns: streamMessagesReturnValueValidator,
  handler: async (ctx, { threadId, streamArgs }) => {
    const streams = await syncStreams(ctx, components.agent, {
      threadId,
      streamArgs,
    });
    return { streams: streams ?? { kind: "list" as const, messages: [] } };
  },
});
