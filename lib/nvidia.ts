import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "moonshotai/kimi-k3";

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
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("NVIDIA API returned an empty response");
  }

  return content;
}
