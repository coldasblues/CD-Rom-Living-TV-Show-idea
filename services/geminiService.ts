import { GoogleGenAI, Type } from "@google/genai";
import { StoryBeat } from "../types";
import { SYSTEM_INSTRUCTION, ANIMATION_STYLES, VIDEO_MODELS } from "../constants";
import { getSettings } from "./storageService";
import { generateFalClip } from "./falService";

// Helper to retrieve the API key string
async function getApiKey(): Promise<string> {
  // 1. Check URL Parameters (Magic Link)
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('key');
  if (urlKey) {
    return urlKey;
  }

  // 2. Check Local Storage (User Input in Lobby)
  const localKey = localStorage.getItem("GEMINI_API_KEY");
  if (localKey) {
    return localKey;
  }

  // 3. Check Standard Environment Variable
  if (process.env.API_KEY) {
    return process.env.API_KEY;
  }

  // 4. Check Vite Environment Variable
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }

  // 5. Check AI Studio Context (Project IDX / Cloud)
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await win.aistudio.openSelectKey();
    }
    // Note: The key is injected into process.env.API_KEY by the environment after selection.
    return process.env.API_KEY || '';
  }

  throw new Error("No API Key found. Please enter one in the SYSTEM tab.");
}

// --- RETRY LOGIC ---
async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseDelay = 12000): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    // Inspect error object structure (Google GenAI can return nested error objects)
    const errBody = e.error || e;
    const message = e.message || errBody?.message || JSON.stringify(e);
    const status = e.status || errBody?.status || e.code || errBody?.code;

    // Check for Quota/Rate Limit errors
    const isRateLimit = 
      message.includes('429') || 
      message.toLowerCase().includes('quota') || 
      message.toLowerCase().includes('resource_exhausted') ||
      status === 429 ||
      status === 'RESOURCE_EXHAUSTED';

    if (isRateLimit && retries > 0) {
      console.warn(`[System] Rate limit hit (429). Cooling down for ${baseDelay/1000}s... (${retries} retries left)`);
      
      // Wait for the delay
      await new Promise(resolve => setTimeout(resolve, baseDelay));
      
      // Increase delay for next attempt (Backoff)
      // If it's a rate limit, we want to back off aggressively to clear the window (e.g. 12s -> 18s -> 27s -> 40s)
      return withRetry(fn, retries - 1, baseDelay * 1.5);
    }

    // For other transient errors (503, 500), we can retry with shorter backoff
    if ((status === 503 || status === 500) && retries > 0) {
       console.warn(`[System] Transient error (${status}). Retrying...`);
       await new Promise(resolve => setTimeout(resolve, 2000));
       return withRetry(fn, retries - 1, baseDelay); 
    }

    throw e;
  }
}

// --- OPENROUTER IMPLEMENTATION ---

async function generateStoryBeatOpenRouter(
    apiKey: string,
    previousContext: string[],
    userChoice: string | null,
    lastFrameBase64: string | null,
    modelId: string
): Promise<StoryBeat> {
    const prompt = userChoice
    ? `The viewer chose: "${userChoice}". Continue the story.`
    : `Start the first scene of a mysterious adventure involving a character finding a strange object.`;

    // Internal helper to perform the fetch so we can retry cleanly
    const makeRequest = async (includeImage: boolean) => {
        const messages: any[] = [
            { role: "system", content: SYSTEM_INSTRUCTION }
        ];

        // Build User content array (Text + optional Image)
        const userContent: any[] = [
            { type: "text", text: `History: ${previousContext.slice(-3).join(' ')}\n\nTask: ${prompt}` }
        ];

        if (includeImage && lastFrameBase64) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${lastFrameBase64}`
                }
            });
        }

        messages.push({ role: "user", content: userContent });

        console.log(`[OpenRouter] Generating Story using model: ${modelId} (Vision: ${includeImage})`);

        // NOTE: We purposely omit 'response_format' here. 
        // Some providers (like DeepInfra/Nvidia) return 405 if 'response_format' is present at all.
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": window.location.origin,
                "X-Title": "Living TV Show",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: modelId, 
                messages: messages
            })
        });

        const responseText = await response.text(); // Read once to handle both error and success text

        if (!response.ok) {
            // Check for Image Compatibility Errors (404 No endpoints, or 400 Bad Request related to multimodal)
            // OpenRouter often sends 404 with "No endpoints found that support image input"
            if ((response.status === 404 || response.status === 400) && 
                (responseText.includes("support image input") || responseText.includes("multimodal"))) {
                throw new Error("IMAGE_NOT_SUPPORTED");
            }
            throw new Error(`OpenRouter Error: ${response.status} - ${responseText}`);
        }

        return JSON.parse(responseText);
    };

    let data;
    try {
        // Attempt 1: Try WITH image if available
        data = await makeRequest(!!lastFrameBase64);
    } catch (e: any) {
        if (e.message === "IMAGE_NOT_SUPPORTED" && lastFrameBase64) {
            console.warn("[OpenRouter] Selected model does not support vision. Falling back to Text-Only mode.");
            // Attempt 2: Retry WITHOUT image
            data = await makeRequest(false);
        } else {
            throw e;
        }
    }

    if (!data || !data.choices || !data.choices[0]) {
        console.error("[OpenRouter] Invalid Response Structure:", data);
        throw new Error("Model returned an empty or invalid response (missing choices).");
    }

    let text = data.choices[0].message?.content;

    if (!text) throw new Error("OpenRouter returned empty content");

    // Robust JSON Extraction
    // 1. Try to find markdown JSON block
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        text = markdownMatch[1];
    } else {
        // 2. Fallback: Find first { and last }
        const jsonStartIndex = text.indexOf('{');
        const jsonEndIndex = text.lastIndexOf('}');
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            text = text.substring(jsonStartIndex, jsonEndIndex + 1);
        }
    }

    try {
        return JSON.parse(text) as StoryBeat;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        console.log("Raw Text:", text);
        throw new Error("Failed to parse story beat JSON from model response.");
    }
}

/**
 * Step 1: Generate the Story Beat (Text)
 */
export const generateStoryBeat = async (
  previousContext: string[],
  userChoice: string | null,
  lastFrameBase64: string | null
): Promise<StoryBeat> => {
  const apiKey = await getApiKey();
  const settings = await getSettings();

  // Check for OpenRouter Key
  if (apiKey.startsWith('sk-or-')) {
      return withRetry(() => generateStoryBeatOpenRouter(
          apiKey, 
          previousContext, 
          userChoice, 
          lastFrameBase64,
          settings.openRouterModel || 'google/gemini-2.0-flash-001'
      ));
  }

  // Fallback to standard Google GenAI SDK
  const ai = new GoogleGenAI({ apiKey });

  const prompt = userChoice
    ? `The viewer chose: "${userChoice}". Continue the story.`
    : `Start the first scene of a mysterious adventure involving a character finding a strange object.`;

  const parts: any[] = [{ text: prompt }];

  // If we have a previous frame, show it to the text model so it describes the *next* logical visual
  if (lastFrameBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "image/png",
        data: lastFrameBase64,
      },
    });
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          narrative: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["id", "text"],
            },
          },
        },
        required: ["narrative", "visualPrompt", "choices"],
      },
    },
  }));

  if (!response.text) {
    throw new Error("Failed to generate story beat.");
  }

  return JSON.parse(response.text) as StoryBeat;
};

/**
 * Step 2: Generate the Video (Veo OR Fal.ai)
 */
export const generateVideoClip = async (
  visualDescription: string,
  lastFrameBase64: string | null,
  styleKey: string = 'claymation',
  modelKey: string = 'fast'
): Promise<string> => {
  const apiKey = await getApiKey();
  const settings = await getSettings();
  const stylePrompt = ANIMATION_STYLES[styleKey] || ANIMATION_STYLES['claymation'];
  const fullPrompt = `${visualDescription}, ${stylePrompt}`;

  // --- 1. FAL.AI PRIORITY OVERRIDE ---
  if (settings.falKey && settings.falKey.trim() !== '') {
    console.log(`[Video] Delegating to Fal.ai (${settings.falModel})...`);
    return generateFalClip(
        fullPrompt, 
        lastFrameBase64, 
        settings.falKey,
        settings.falModel || 'fal-ai/minimax/video-01'
    );
  }

  // --- 2. OPENROUTER VIDEO ATTEMPT ---
  if (apiKey.startsWith('sk-or-')) {
      console.log("[System] Attempting OpenRouter Video Generation...");
      try {
        // We attempt to call OpenRouter as if it's a standard generation endpoint.
        // Note: If the user selected a model that only returns text, this will fail gracefully below.
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": window.location.origin,
                "X-Title": "Living TV Show",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: settings.openRouterModel || 'google/gemini-2.0-flash-001', 
                messages: [
                   { role: "user", content: `Generate a short video clip: ${fullPrompt}` }
                ]
                // Note: No response_format here either.
            })
        });

        if (!response.ok) throw new Error("OpenRouter Video Request Failed");
        
        const data = await response.json();
        
        // SAFEGUARD FOR UNDEFINED CHOICES
        if (!data || !data.choices || !data.choices[0]) {
             console.warn("[OpenRouter] Model returned text but no choices/content. Falling back.", data);
             throw new Error("VIDEO_GEN_UNSUPPORTED_PROVIDER");
        }
        
        const content = data.choices[0].message?.content;

        // CHECK: Did we get a URL?
        // Some models might return a URL in the content string
        const urlMatch = content?.match(/https?:\/\/[^\s"']+\.mp4/);
        if (urlMatch) {
            return urlMatch[0];
        }

        // If we just got text, we can't use it as a video source.
        console.warn("[OpenRouter] Model returned text, not a video URL. Falling back to Slideshow Mode.");
        throw new Error("VIDEO_GEN_UNSUPPORTED_PROVIDER");

      } catch (e: any) {
          if (e.message === "VIDEO_GEN_UNSUPPORTED_PROVIDER") throw e;
          console.error("OpenRouter Video Error:", e);
          throw new Error("VIDEO_GEN_UNSUPPORTED_PROVIDER");
      }
  }

  // --- 3. GOOGLE VEO IMPLEMENTATION (DEFAULT) ---
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = VIDEO_MODELS[modelKey as keyof typeof VIDEO_MODELS] || VIDEO_MODELS['fast'];

  console.log(`[Veo] Generating (${modelName}) with prompt:`, fullPrompt);

  let operation;

  // Wrap the generation call in withRetry to handle 429s (Quota limits)
  if (lastFrameBase64) {
    // Continuation mode: Use image-to-video (or text+image-to-video)
    operation = await withRetry(() => ai.models.generateVideos({
      model: modelName,
      prompt: fullPrompt, 
      image: {
        imageBytes: lastFrameBase64,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    }));
  } else {
    // Fresh start
    operation = await withRetry(() => ai.models.generateVideos({
      model: modelName,
      prompt: fullPrompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    }));
  }

  // Poll for completion
  console.log("[Veo] Job started. Polling...", operation);
  
  // Safety timeout (3 minutes)
  const startTime = Date.now();
  const MAX_WAIT = 180000; 

  while (!operation.done) {
    if (Date.now() - startTime > MAX_WAIT) {
        throw new Error("Video generation timed out.");
    }
    // Poll every 5s (wrapped in retry for stability)
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    operation = await withRetry(() => ai.operations.getVideosOperation({ operation }));
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("Video generation finished but no URI found.");
  }

  // Fetch actual bytes using the key (Veo API requirement for download link)
  return `${videoUri}&key=${apiKey}`;
};