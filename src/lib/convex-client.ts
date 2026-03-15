import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }
  return client;
}
