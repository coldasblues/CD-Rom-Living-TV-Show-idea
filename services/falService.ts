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
      // Fallback: Try generating without image if upload fails
    }
  }

  // 3. Subscribe to Model
  // This handles polling internally.
  const result: any = await fal.subscribe(modelId, {
    input: {
      prompt: prompt,
      image_url: uploadedImageUrl,
      loop: false
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        // Log progress if available
        if (update.logs) {
            update.logs.map((log: any) => console.log(`[Fal.ai Remote] ${log.message}`));
        }
      }
    },
  });

  // 4. Parse Result
  if (result.video && result.video.url) {
    console.log("[Fal.ai] Success:", result.video.url);
    return result.video.url;
  }

  throw new Error("Fal.ai generation finished but returned no video URL.");
};
