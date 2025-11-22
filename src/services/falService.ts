import { fal } from "@fal-ai/client";
import { FAL_IMAGE_MODELS } from "../constants";

// Helper: Optimize image for upload (Resize + JPEG compression)
// Fal.ai has a 10MB limit, and PNGs can easily exceed this or be unnecessarily large.
const optimizeImageForUpload = async (base64: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      // Target 720p width to save space, most video models generate 720p anyway
      const MAX_WIDTH = 1280; 
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
          reject(new Error("Canvas context failed"));
          return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG with 85% quality to drastically reduce size compared to PNG
      canvas.toBlob((blob) => {
          if (blob) {
              console.log(`[Fal.ai] Image optimized: ${width}x${height}, ${Math.round(blob.size / 1024)}KB`);
              resolve(blob);
          } else {
              reject(new Error("Blob creation failed"));
          }
      }, 'image/jpeg', 0.85);
    };
    img.onerror = (e) => reject(new Error("Failed to load image for optimization"));
    
    // Handle cases where prefix might already exist or not
    const src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    img.src = src;
  });
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
 * Generates a static image (Cover Art) using Fal.ai
 */
export const generateFalImage = async (prompt: string, falKey: string): Promise<string> => {
  console.log("[Fal.ai] Generating Cover Art...");
  
  try {
    fal.config({ credentials: falKey });

    const result: any = await fal.subscribe(FAL_IMAGE_MODELS['Flux Pro 1.1'], {
      input: {
        prompt: prompt,
        image_size: "portrait_4_3", // Matches Cartridge shape
        safety_tolerance: "2"
      },
      logs: true
    });

    // Extract Image URL (Flux usually returns 'images': [{url: ...}])
    if (result.images && result.images[0] && result.images[0].url) {
        return result.images[0].url;
    }
    
    throw new Error("No image returned from Fal.");

  } catch (error: any) {
    console.error("Fal Image Gen Error:", error);
    throw new Error(error.message || "Failed to generate image");
  }
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
        console.log("[Fal.ai] Optimizing reference frame...");
        // Use optimization helper to resize/compress before upload
        const blob = await optimizeImageForUpload(lastFrameBase64);
        
        console.log("[Fal.ai] Uploading reference frame...");
        const url = await fal.storage.upload(blob);
        uploadedImageUrl = url;
        console.log("[Fal.ai] Image uploaded:", uploadedImageUrl);
      } catch (e) {
        console.error("[Fal.ai] Image upload failed:", e);
        // Continue without image if upload fails? 
        // No, usually for tape loop continuity this is critical, but we fall back to text-to-video
        // if the image fails, rather than crashing the whole flow.
        console.warn("[Fal.ai] Continuing with Text-to-Video fallback due to upload failure.");
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

      // Check for specific Fal validation messages
      if (error.body && error.body.detail && Array.isArray(error.body.detail)) {
         const details = error.body.detail.map((d: any) => d.msg).join('; ');
         if (details) {
            throw new Error(`Fal.ai Validation Error: ${details}`);
         }
      }
      
      const message = error.message || "Unknown Fal.ai error";
      throw new Error(`Fal.ai Error: ${message}`);
  }
};