import { v } from "convex/values";
import { action } from "./_generated/server";

const ENV = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
  string,
  string | undefined
>;

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324:free";

const extractText = (payload: any): string => {
  const message = payload?.choices?.[0]?.message;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const cleanPlannerText = (raw: string): string => {
  const withoutFence = raw
    .replace(/^```(?:text|markdown)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return withoutFence || raw.trim();
};

export const planWar = action({
  args: {
    details: v.string(),
    bg: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = ENV.AI_API_KEY || ENV.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("AI is not configured. Set AI_API_KEY or OPENROUTER_API_KEY in Convex env.");
    }

    const baseUrl = ENV.AI_BASE_URL || DEFAULT_BASE_URL;
    const model = ENV.AI_MODEL || DEFAULT_MODEL;
    const system = [
      "You are an MCOC Alliance War planner assistant.",
      "Convert the user's messy notes into a concise planner input.",
      "Return plain text only, no markdown fences.",
      "Use this exact shape:",
      "Defenders",
      "1 Defender Name",
      "2 Defender Name",
      "",
      "Rosters",
      "Player Name: Champ 1, Champ 2, Champ 3, Champ 4, Champ 5",
      "If a node number is present, keep it. If player names are present, keep them.",
      "Do not invent attackers or defenders that are not implied by the user's notes.",
    ].join("\n");

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": ENV.AI_SITE_URL || "https://mcoc-mvps.vercel.app",
        "X-Title": "MCOC War Planner",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `BG: ${args.bg}\n\n${args.details}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`AI request failed (${response.status}): ${text.slice(0, 220) || response.statusText}`);
    }

    const payload = await response.json();
    const plannerText = cleanPlannerText(extractText(payload));
    if (!plannerText) throw new Error("AI returned an empty plan.");

    return {
      plannerText,
      model,
      provider: baseUrl,
    };
  },
});
