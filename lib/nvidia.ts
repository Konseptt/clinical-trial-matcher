import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "moonshotai/kimi-k3";

function usableReply(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed || /^!+$/.test(trimmed)) return "";
  return trimmed;
}

export function isNvidiaConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}

export async function nvidiaChatCompletion(options: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  const client = new OpenAI({
    baseURL: NVIDIA_BASE_URL,
    apiKey,
    timeout: 30_000,
  });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: options.messages,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 1024,
    stream: false,
    reasoning_effort: "low",
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

  const message = completion.choices[0]?.message as
    | { content?: string | null; reasoning_content?: string | null }
    | undefined;
  const content = usableReply(message?.content) || usableReply(message?.reasoning_content);
  if (!content) {
    throw new Error("NVIDIA API returned an empty response");
  }

  return content;
}
