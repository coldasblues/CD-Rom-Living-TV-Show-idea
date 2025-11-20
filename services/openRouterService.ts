import { OpenRouterModel } from "../types";

export const fetchOpenRouterModels = async (): Promise<OpenRouterModel[]> => {
  try {
    console.log("[System] Connecting to OpenRouter Model Registry...");
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "HTTP-Referer": window.location.origin,
        "X-Title": "Living TV Show"
      }
    });
    
    if (!response.ok) {
      throw new Error(`Registry Error: ${response.status}`);
    }

    const data = await response.json();
    const models = data.data as OpenRouterModel[];

    // Sort: Google models first, then alphabetical
    return models.sort((a, b) => {
      const aIsGoogle = a.id.startsWith('google/');
      const bIsGoogle = b.id.startsWith('google/');
      if (aIsGoogle && !bIsGoogle) return -1;
      if (!aIsGoogle && bIsGoogle) return 1;
      return a.name.localeCompare(b.name);
    });

  } catch (error) {
    console.error("OpenRouter Fetch Error:", error);
    return [];
  }
};