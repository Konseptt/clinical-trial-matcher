const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.1-8b-instruct";
const NVIDIA_TIMEOUT_MS = 30_000;

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

  const model = process.env.NVIDIA_MODEL?.trim() || DEFAULT_MODEL;

  // Without a timeout a stalled upstream hangs the whole request (patient and
  // simplify modes await this). Abort after NVIDIA_TIMEOUT_MS.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NVIDIA_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        top_p: 0.7,
        max_tokens: options.maxTokens ?? 1024,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("NVIDIA API request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`NVIDIA API request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("NVIDIA API returned an empty response");
  }

  return content;
}
