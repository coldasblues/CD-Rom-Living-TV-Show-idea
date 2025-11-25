// The Narrative Persona (User Editable)
export const DEFAULT_NARRATIVE_INSTRUCTION = `
You are the Showrunner and Scriptwriter for "The Tape Loop", an infinite, surreal TV show engine.
Your goal is to generate a coherent, slightly uncanny, or humorous narrative beat based on the user's choice.
`;

// The JSON Enforcement (Hidden/Appended automatically)
export const JSON_SCHEMA_INSTRUCTION = `
CRITICAL: You must return a valid JSON object with this schema:
{
  "narrative": "A 1-2 sentence description of what is happening right now.",
  "visualPrompt": "A highly detailed visual description of the scene for a video generator. CRITICAL: You MUST include the physical description of the Main Character in every single prompt. Do not just say their name. Example: 'A claymation figure of a woman with red hair...'. Describe dynamic MOTION and ACTION.",
  "choices": [
    { "id": "1", "text": "Short action 1" },
    { "id": "2", "text": "Short action 2" },
    { "id": "3", "text": "Short action 3" },
    { "id": "4", "text": "Short action 4" }
  ]
}
`;

// Combined for backward compatibility
export const SYSTEM_INSTRUCTION = `${DEFAULT_NARRATIVE_INSTRUCTION}\n\n${JSON_SCHEMA_INSTRUCTION}`;

// The Default Video Template
// {{style}} = The long description from ANIMATION_STYLES
// {{visual}} = The specific scene description from the Story Beat
export const DEFAULT_VIDEO_TEMPLATE = `{{style}}. {{visual}}, dynamic motion, action shot, 8k, highly detailed`;

export const PLACEHOLDER_VIDEO = "https://media.istockphoto.com/id/1334253648/video/tv-static-noise-signal-glitch-effect-loop-background.mp4?s=mp4-640x640-is&k=20&c=1-YyX4J-fXfV29rG8sP_rT5HjQvWlqZq0Q0Q0Q0Q0=";

export const GET_KEY_URL = "https://aistudio.google.com/app/apikey";

export const ANIMATION_STYLES: Record<string, string> = {
  claymation: "in the style of stop-motion claymation, Aardman animation style, miniature scale, depth of field, cinematic lighting",
  vintage_anime: "in the style of 1990s anime, cel shaded, hand drawn, high contrast, retro aesthetic, grain, dynamic camera angles",
  pixel_art: "pixel art style, 16-bit graphics, SNES aesthetic, vibrant colors, dithered shading, active animation",
  vhs_horror: "found footage style, vhs glitch effect, photorealistic, dark atmosphere, grainy texture, low fidelity, analog horror, shaky cam",
  cinematic_3d: "unreal engine 5 render, hyper-realistic, ray tracing, 8k, cinematic lighting, highly detailed textures, motion blur",
  noir: "black and white film noir style, high contrast, dramatic shadows, film grain, 1940s cinema look, atmospheric motion"
};

export const VIDEO_MODELS = {
  fast: 'veo-3.1-fast-generate-preview',
  quality: 'veo-3.1-generate-preview' // Note: Slower
};

export const CONTENT_THEMES = [
  "Surrealist Mystery", "Cyberpunk", "1980s Sitcom", "Eldritch Horror", 
  "High Fantasy", "Space Opera", "Noir Detective", "Soap Opera", 
  "Zombie Survival", "Abstract Art", "Mockumentary", "Western", 
  "Saturday Morning Cartoon", "Psychedelic"
];

export const FAL_MODELS: Record<string, string> = {
  'Minimax (Balanced)': 'fal-ai/minimax/video-01',
  'Luma Dream Machine (Cinematic)': 'fal-ai/luma-dream-machine',
  'Kling 1.6 (High Quality)': 'fal-ai/kling-video/v1.6/standard/image-to-video',
  'Fast SVD (Glitchy/Cheap)': 'fal-ai/fast-svd/text-to-video'
};

// NEW: Image Generation Models
export const FAL_IMAGE_MODELS = {
  'Flux Pro 1.1': 'fal-ai/flux-pro/v1.1',
  'Flux Dev': 'fal-ai/flux/dev',
  'Fast SDXL': 'fal-ai/fast-sdxl'
};

// NEW: NovelAI-style Tags
export const COVER_ART_TAGS = [
  "Masterpiece", "Best Quality", "Retro 90s Anime", "VHS Cover Art",
  "Surrealist", "Cyberpunk", "Claymation", "Ken Sugimori Style",
  "Oil Painting", "Glitch Art", "Playstation 1 Graphics", "Dark Fantasy",
  "Synthwave", "Gothic", "Studio Ghibli", "Film Noir", "Polaroid"
];