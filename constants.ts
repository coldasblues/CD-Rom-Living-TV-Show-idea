

export const SYSTEM_INSTRUCTION = `
You are the Showrunner and Scriptwriter for "The Tape Loop", an infinite, surreal TV show engine.
Your goal is to generate a coherent, slightly uncanny, or humorous narrative beat based on the user's choice.

You must return a valid JSON object with this schema:
{
  "narrative": "A 1-2 sentence description of what is happening right now.",
  "visualPrompt": "A highly detailed visual description of the scene for a video generator. Focus on the action, characters, and setting. Do not include specific art style keywords (like 'claymation' or 'pixel art') unless they are intrinsic to the object itself, as the rendering style is applied globally.",
  "choices": [
    { "id": "1", "text": "Short action 1" },
    { "id": "2", "text": "Short action 2" },
    { "id": "3", "text": "Short action 3" },
    { "id": "4", "text": "Short action 4" }
  ]
}
`;

export const PLACEHOLDER_VIDEO = "https://media.istockphoto.com/id/1334253648/video/tv-static-noise-signal-glitch-effect-loop-background.mp4?s=mp4-640x640-is&k=20&c=1-YyX4J-fXfV29rG8sP_rT5HjQvWlqZq0Q0Q0Q0Q0=";

export const GET_KEY_URL = "https://aistudio.google.com/app/apikey";

export const ANIMATION_STYLES: Record<string, string> = {
  claymation: "in the style of stop-motion claymation, Aardman animation style, miniature scale, depth of field, cinematic lighting, 8k resolution",
  vintage_anime: "in the style of 1990s anime, cel shaded, hand drawn, high contrast, retro aesthetic, grain",
  pixel_art: "pixel art style, 16-bit graphics, SNES aesthetic, vibrant colors, dithered shading",
  vhs_horror: "found footage style, vhs glitch effect, photorealistic, dark atmosphere, grainy texture, low fidelity, analog horror",
  cinematic_3d: "unreal engine 5 render, hyper-realistic, ray tracing, 8k, cinematic lighting, highly detailed textures",
  noir: "black and white film noir style, high contrast, dramatic shadows, film grain, 1940s cinema look"
};

export const VIDEO_MODELS = {
  fast: 'veo-3.1-fast-generate-preview',
  quality: 'veo-3.1-generate-preview' // Note: Slower
};

export const FAL_MODELS: Record<string, string> = {
  'Minimax (Balanced)': 'fal-ai/minimax/video-01',
  'Luma Dream Machine (Cinematic)': 'fal-ai/luma-dream-machine',
  'Kling 1.6 (High Quality)': 'fal-ai/kling-video/v1.6/standard/image-to-video',
  'Fast SVD (Glitchy/Cheap)': 'fal-ai/fast-svd/text-to-video'
};
