



import { get, set } from 'idb-keyval';
import { StoredTape, AppSettings } from '../types';
import { ANIMATION_STYLES, VIDEO_MODELS } from '../constants';

const LIBRARY_KEY = 'living-tv-library';
const SETTINGS_KEY = 'living-tv-settings';

export const saveTapeToLibrary = async (tape: StoredTape): Promise<void> => {
  const library = (await get<StoredTape[]>(LIBRARY_KEY)) || [];
  
  // Check if tape already exists by ID (update it)
  const index = library.findIndex((t) => t.id === tape.id);
  if (index >= 0) {
    library[index] = tape;
  } else {
    // Add to the beginning
    library.unshift(tape);
  }
  
  await set(LIBRARY_KEY, library);
};

export const getLibrary = async (): Promise<StoredTape[]> => {
  return (await get<StoredTape[]>(LIBRARY_KEY)) || [];
};

export const deleteTapeFromLibrary = async (id: string): Promise<void> => {
  const library = (await get<StoredTape[]>(LIBRARY_KEY)) || [];
  const newLibrary = library.filter((t) => t.id !== id);
  await set(LIBRARY_KEY, newLibrary);
};

export const clearLibrary = async (): Promise<void> => {
  await set(LIBRARY_KEY, []);
};

// --- Settings Management ---

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  falKey: '',
  falModel: 'fal-ai/minimax/video-01',
  visualStyle: 'claymation',
  videoModel: 'fast',
  openRouterModel: 'google/gemini-2.0-flash-001' // Default Fallback
};

export const getSettings = async (): Promise<AppSettings> => {
  const stored = await get<AppSettings>(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...stored };
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  await set(SETTINGS_KEY, settings);
  // Also sync API key to localStorage for legacy/geminiService compatibility if needed,
  // though ideally we switch to using this settings object everywhere.
  if (settings.apiKey) {
    localStorage.setItem("GEMINI_API_KEY", settings.apiKey);
  }
};
