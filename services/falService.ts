import { fal } from "@fal-ai/client";

// Helper: Convert Base64 string to Blob
const base64ToBlob = (base64: string, type = 'image/png'): Blob => {
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type });
};

// Helper: Recursive search for video URL
const findVideoUrl = (obj: any): string | undefined => {
  if (!obj) return undefined;
  
  if (typeof obj === 'string') {
     if (!/^https?:\/\//.test(obj)) return undefined;
     // If string ends in video extension, return it.
     // We allow query parameters (e.g. .mp4?token=...) by checking for ? or end of string.
     return /\.(mp4|webm|mov|mkv)(\?|$)/i.test(obj) ? obj : undefined;
  }

  if (Array.isArray(obj)) {
      for (const item of obj) {
          const found = findVideoUrl(item);
          if (found) return found;
      }
      return undefined;
  }

  if (typeof obj === 'object') {
    // Priority check for explicit video keys to avoid grabbing random image URLs
    if (obj.video && obj.video.url && typeof obj.video.url === 'string') return obj.video.url;
    if (obj.video_url && typeof obj.video_url === 'string') return obj.video_url;
    if (obj.file && obj.file.url && typeof obj.file.url === 'string') return obj.file.url; // Minimax sometimes use file.url
    
    // Deep traverse
    for (const key in obj) {
       if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const found = findVideoUrl(obj[key]);
          if (found) return found;
       }
    }
  }
  
  return undefined;
};

/**
 * Generates a video clip using Fal.ai.
 * 
 * @param prompt The text prompt for the video.
 * @param lastFrameBase64 The previous frame to use as a starting point (optional).
 * @param falKey The user's Fal.ai API Key.
 * @param modelId The Fal.ai model ID to use.
 */
export const generateFalClip = async (
  prompt: string,
  lastFrameBase64: string | null,
  falKey: string,
  modelId: string
): Promise<string> => {
  console.log(`[Fal.ai] Initializing generation with ${modelId}...`);

  try {
    // 1. Configure Client
    fal.config({
      credentials: falKey,
    });

    let uploadedImageUrl: string | undefined = undefined;

    // 2. Upload Image if present
    if (lastFrameBase64) {
      try {
        console.log("[Fal.ai] Uploading reference frame...");
        const blob = base64ToBlob(lastFrameBase64);
        const url = await fal.storage.upload(blob);
        uploadedImageUrl = url;
        console.log("[Fal.ai] Image uploaded:", uploadedImageUrl);
      } catch (e) {
        console.error("[Fal.ai] Image upload failed:", e);
        // Continue without image if upload fails
      }
    }

    // 3. Construct Input Payload dynamically
    const input: any = {
      prompt: prompt
    };

    // --- MODEL SPECIFIC RULES ---

    // Rule A: SVD Text-to-Video cannot accept image_url
    const isSvdText = modelId.includes('fast-svd/text-to-video');
    
    // Rule B: Kling has distinct endpoints. If we have no image (start of tape), ensure we use text-to-video.
    if (modelId.includes('kling-video') && modelId.includes('image-to-video') && !uploadedImageUrl) {
        console.warn("[Fal.ai] Kling Image-to-Video selected but no image available. Switching to Text-to-Video endpoint.");
        modelId = 'fal-ai/kling-video/v1.6/standard/text-to-video';
    }

    // Rule C: Attach image if available and model supports it
    if (uploadedImageUrl && !isSvdText) {
      input.image_url = uploadedImageUrl;
    }

    // 4. Subscribe to Model
    console.log(`[Fal.ai] Sending payload to ${modelId}:`, JSON.stringify(input));
    
    const result: any = await fal.subscribe(modelId, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          if (update.logs) {
              update.logs.map((log: any) => console.log(`[Fal.ai Remote] ${log.message}`));
          }
        }
      },
    });

    // 5. Parse Result with Robust Fallbacks
    
    // Safe Logging of the result
    try {
      console.log("[Fal.ai] Raw Result:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.log("[Fal.ai] Raw Result (Object):", result);
    }

    // Method A: Deep Recursive Search (Most Reliable)
    const foundUrl = findVideoUrl(result);
    if (foundUrl) return foundUrl;

    // Method B: Regex Scan on stringified JSON (Last resort for deeply nested or oddly named keys)
    try {
        const jsonString = JSON.stringify(result);
        const urlMatch = jsonString.match(/https?:\/\/[^"'\s]+\.(mp4|webm|mov)(\?[^"'\s]*)?/);
        if (urlMatch) {
            console.warn("[Fal.ai] Found video URL via regex fallback:", urlMatch[0]);
            return urlMatch[0];
        }
    } catch(e) { /* ignore */ }
    
    console.error("[Fal.ai] Response structure missing video URL. Available keys:", Object.keys(result || {}));
    throw new Error("Fal.ai generation finished but returned no video URL.");

  } catch (error: any) {
      // Enhanced Error Logging
      console.error("[Fal.ai] Subscription Error:", error);
      if (error.body) {
          try {
             console.error("[Fal.ai] Error Body:", JSON.stringify(error.body, null, 2));
          } catch (e) {
             console.error("[Fal.ai] Error Body (Raw):", error.body);
          }
      }
      
      const message = error.message || "Unknown Fal.ai error";
      throw new Error(`Fal.ai Error: ${message}`);
  }
};