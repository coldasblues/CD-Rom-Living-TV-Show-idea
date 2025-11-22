import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
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
    modelId: string,
    styleKey: string
): Promise<StoryBeat> {
    const prompt = userChoice
    ? `The viewer chose: "${userChoice}". Continue the story.`
    : `Start the first scene of a mysterious adventure involving a character finding a strange object.`;

    // Internal helper to perform the fetch so we can retry cleanly
    const makeRequest = async (includeImage: boolean) => {
        const messages: any[] = [
            { role: "system", content: SYSTEM_INSTRUCTION }
        ];
        
        // Style Context for OpenRouter
        const stylePrompt = ANIMATION_STYLES[styleKey] || ANIMATION_STYLES['claymation'];
        const styleInstruction = `VISUAL STYLE REQUIREMENT: The show's visual style is "${styleKey}" (${stylePrompt}). Ensure the 'visualPrompt' explicitly describes the scene using this art style (e.g. "A claymation figure of...", "A pixel art scene of...").`;

        // Smart Context: Persist the first history item if it's marked as Context
        let historyText = "";
        
        // Include Context and Rules
        const contextEntry = previousContext.find(c => c.startsWith('SERIES CONTEXT:'));
        if (contextEntry) {
            historyText += `${contextEntry}\n\n`;
        }
        
        const rulesMatch = previousContext.find(line => line.includes('GAME RULES'));
        if (rulesMatch) {
            historyText += `\nCRITICAL ENGINE RULES:\n${rulesMatch}\nYou must adhere to these rules strictly.\n\n`;
        }

        historyText += `RECENT LOGS:\n${previousContext.slice(-5).join('\n')}`;

        // Build User content array (Text + optional Image)
        const userContent: any[] = [
            { type: "text", text: `${styleInstruction}\n\nHistory: ${historyText}\n\nTask: ${prompt}` }
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

        const responseText = await response.text();

        if (!response.ok) {
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
        data = await makeRequest(!!lastFrameBase64);
    } catch (e: any) {
        if (e.message === "IMAGE_NOT_SUPPORTED" && lastFrameBase64) {
            console.warn("[OpenRouter] Selected model does not support vision. Falling back to Text-Only mode.");
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
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        text = markdownMatch[1];
    } else {
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
  lastFrameBase64: string | null,
  styleKey: string = 'claymation'
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
          settings.openRouterModel || 'google/gemini-2.0-flash-001',
          styleKey
      ));
  }

  // Fallback to standard Google GenAI SDK
  const ai = new GoogleGenAI({ apiKey });

  let fullPrompt = "";
  let characterReinforcement = "";
  
  // Style Guidance
  const stylePrompt = ANIMATION_STYLES[styleKey] || ANIMATION_STYLES['claymation'];
  fullPrompt += `ART STYLE GUIDANCE: The visual style of the show is "${styleKey}" (${stylePrompt}). Ensure the 'visualPrompt' field describes the scene specifically matching this style. For example, if claymation, mention 'clay material', 'stop motion', 'miniature'. If anime, mention 'cel shaded', '2d'.\n\n`;

  // Parse context to find character details for reinforcement
  // We look for the "SERIES CONTEXT" block injected by Lobby.tsx
  const seriesContext = previousContext.find(line => line.startsWith('SERIES CONTEXT:'));
  
  // NEW: Game Logic Injection
  const rulesMatch = previousContext.find(line => line.includes('GAME RULES'));
  if (rulesMatch) {
      fullPrompt += `\nCRITICAL ENGINE RULES:\n${rulesMatch}\nYou must adhere to these rules strictly. If the rules define a health system, inventory, or mechanics, you must track it in the narrative.\n\n`;
  }
  
  if (seriesContext) {
      fullPrompt += `${seriesContext}\n\n`;
      
      // Extract details to force the AI to use them in visual prompts
      const nameMatch = seriesContext.match(/Character: (.*)/);
      const descMatch = seriesContext.match(/Personality\/Description: (.*)/);
      
      if (nameMatch) {
          const name = nameMatch[1].trim();
          // Limit description length to avoid token bloat, but keep enough for visuals
          const desc = descMatch ? descMatch[1].substring(0, 300).trim() : "distinctive appearance";
          
          // CRITICAL: This instruction forces the LLM to unpack "Fran" into "A woman with..." in the visual prompt.
          characterReinforcement = `VISUAL REQUIREMENT: In the 'visualPrompt' field, you MUST explicitly describe ${name}'s physical appearance (${desc}). Do not just use the name "${name}" because the video generator does not know them.`;
      }
  }
  
  // Recent History
  const recentHistory = previousContext.slice(-5);
  fullPrompt += `RECENT LOGS:\n${recentHistory.join('\n')}\n\n`;
  
  if (characterReinforcement) {
      fullPrompt += `${characterReinforcement}\n\n`;
  }

  // Task
  if (userChoice) {
      fullPrompt += `TASK: The viewer chose: "${userChoice}". Continue the story.`;
  } else if (previousContext.length > 0) {
      fullPrompt += `TASK: Continue the story naturally from the last moment.`;
  } else {
      fullPrompt += `TASK: Start the first scene of a mysterious adventure involving a character finding a strange object.`;
  }

  const parts: any[] = [{ text: fullPrompt }];

  // If we have a previous frame, show it to the text model
  if (lastFrameBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "image/png",
        data: lastFrameBase64,
      },
    });
  }

  const response = (await withRetry(() => ai.models.generateContent({
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
  }))) as GenerateContentResponse;

  if (!response.text) {
    throw new Error("Failed to generate story beat.");
  }

  return JSON.parse(response.text) as StoryBeat;
};

// --- NEW FUNCTION: Genesis ---
export const generateGenesisBeat = async (
  params: { name: string; desc: string; setting: string; themes: string[] }
): Promise<StoryBeat> => {
  const apiKey = await getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const themeStr = params.themes.join(", ");
  const prompt = `
    SYSTEM: You are the Pilot Writer for an interactive TV show.
    TASK: Create the opening scene (Story Beat) based on these parameters.
    PARAMETERS: Protagonist: ${params.name}, Appearance: ${params.desc}, Setting: ${params.setting}, Themes: ${themeStr}
    REQUIREMENTS:
    1. Narrative introduces character in setting.
    2. VisualPrompt MUST include physical description of character (not just name) and setting atmosphere.
    3. Provide 4 initial choices.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: { parts: [{ text: prompt }] },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          narrative: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
          choices: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, text: { type: Type.STRING } }, required: ["id", "text"] } },
        },
        required: ["narrative", "visualPrompt", "choices"],
      },
    },
  })) as GenerateContentResponse;
  
  if (!response.text) throw new Error("Failed to generate pilot.");
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
  
  // Improved Prompt Structure: Put Style FIRST for higher adherence
  const fullPrompt = `${stylePrompt}. ${visualDescription}, dynamic motion, action shot`;

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
            })
        });

        if (!response.ok) throw new Error("OpenRouter Video Request Failed");
        
        const data = await response.json();
        
        if (!data || !data.choices || !data.choices[0]) {
             console.warn("[OpenRouter] Model returned text but no choices/content. Falling back.", data);
             throw new Error("VIDEO_GEN_UNSUPPORTED_PROVIDER");
        }
        
        const content = data.choices[0].message?.content;
        const urlMatch = content?.match(/https?:\/\/[^\s"']+\.mp4/);
        if (urlMatch) {
            return urlMatch[0];
        }

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

  if (lastFrameBase64) {
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

  console.log("[Veo] Job started. Polling...", operation);
  
  const startTime = Date.now();
  const MAX_WAIT = 180000; 

  while (!operation.done) {
    if (Date.now() - startTime > MAX_WAIT) {
        throw new Error("Video generation timed out.");
    }
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    operation = await withRetry(() => ai.operations.getVideosOperation({ operation }));
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("Video generation finished but no URI found.");
  }

  return `${videoUri}&key=${apiKey}`;
};