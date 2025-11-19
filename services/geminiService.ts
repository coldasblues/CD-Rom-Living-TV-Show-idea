
import { GoogleGenAI, Type } from "@google/genai";
import { StoryBeat } from "../types";
import { SYSTEM_INSTRUCTION, ANIMATION_STYLES, VIDEO_MODELS } from "../constants";

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

// Helper to ensure we have a key before making requests
async function getAuthenticatedClient(): Promise<GoogleGenAI> {
  const apiKey = await getApiKey();
  return new GoogleGenAI({ apiKey });
}

/**
 * Step 1: Generate the Story Beat (Text)
 */
export const generateStoryBeat = async (
  previousContext: string[],
  userChoice: string | null,
  lastFrameBase64: string | null
): Promise<StoryBeat> => {
  const ai = await getAuthenticatedClient();

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

  const response = await ai.models.generateContent({
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
  });

  if (!response.text) {
    throw new Error("Failed to generate story beat.");
  }

  return JSON.parse(response.text) as StoryBeat;
};

/**
 * Step 2: Generate the Video (Veo)
 */
export const generateVideoClip = async (
  visualDescription: string,
  lastFrameBase64: string | null,
  styleKey: string = 'claymation',
  modelKey: string = 'fast'
): Promise<string> => {
  const ai = await getAuthenticatedClient();
  
  const stylePrompt = ANIMATION_STYLES[styleKey] || ANIMATION_STYLES['claymation'];
  const modelName = VIDEO_MODELS[modelKey as keyof typeof VIDEO_MODELS] || VIDEO_MODELS['fast'];
  
  const fullPrompt = `${visualDescription}, ${stylePrompt}`;

  console.log(`[Veo] Generating (${modelName}) with prompt:`, fullPrompt);

  let operation;

  if (lastFrameBase64) {
    // Continuation mode: Use image-to-video (or text+image-to-video)
    operation = await ai.models.generateVideos({
      model: modelName,
      prompt: fullPrompt,
      image: {
        imageBytes: lastFrameBase64,
        mimeType: "image/png",
      },
      config: {
        numberOfVideos: 1,
        resolution: "720p", // Fast model supports 720p
        aspectRatio: "16:9",
      },
    });
  } else {
    // Cold start: Text-to-video only
    operation = await ai.models.generateVideos({
      model: modelName,
      prompt: fullPrompt,
      config: {
        numberOfVideos: 1,
        resolution: "720p",
        aspectRatio: "16:9",
      },
    });
  }

  // Poll for completion
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Poll every 3s
    operation = await ai.operations.getVideosOperation({ operation: operation });
    console.log("Veo status:", operation.metadata);
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;

  if (!videoUri) {
    throw new Error("Video generation failed or returned no URI.");
  }

  // Fetch the actual video bytes to create a blob URL for the <video> tag
  const apiKey = await getApiKey();

  const videoRes = await fetch(`${videoUri}&key=${apiKey}`);
  const videoBlob = await videoRes.blob();
  return URL.createObjectURL(videoBlob);
};
