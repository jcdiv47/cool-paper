import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

interface TextBlock {
  type: "text";
  text: string;
}

function isTextBlock(block: { type: string }): block is TextBlock {
  return block.type === "text";
}

export function extractTextFromMessage(message: SDKMessage): string | null {
  if (message.type === "assistant" && message.message?.content) {
    const textBlocks: TextBlock[] = message.message.content.filter(isTextBlock);
    if (textBlocks.length > 0) {
      return textBlocks.map((b) => b.text).join("");
    }
  }
  return null;
}

/** Extract incremental text delta from a stream_event message */
export function extractTextDelta(message: SDKMessage): string | null {
  if (message.type !== "stream_event") return null;
  const event = (message as { event: { type: string; delta?: { type: string; text?: string } } }).event;
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "text_delta" &&
    event.delta.text
  ) {
    return event.delta.text;
  }
  return null;
}

/** Extract incremental thinking delta from a stream_event message */
export function extractThinkingDelta(message: SDKMessage): string | null {
  if (message.type !== "stream_event") return null;
  const event = (message as { event: { type: string; delta?: { type: string; thinking?: string } } }).event;
  if (
    event.type === "content_block_delta" &&
    event.delta?.type === "thinking_delta" &&
    event.delta.thinking
  ) {
    return event.delta.thinking;
  }
  return null;
}
