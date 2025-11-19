
export interface Choice {
  id: string;
  text: string;
}

export interface StoryBeat {
  narrative: string;
  visualPrompt: string; // Used for the next video generation
  choices: Choice[];
}

export interface GameState {
  videoUrl: string | null;
  currentBeat: StoryBeat | null;
  lastFrameBase64: string | null; // The "Tape" logic
  isLoading: boolean;
  loadingStage: string; // 'Writing Script' | 'Filming Scene' | 'Ready'
  history: string[]; // Keep track of narrative for context
}

// The Schema compatible with CLI Factory tools
export interface TapeFileSchema {
  meta: {
    version: string;
    characterName: string;
    createdAt?: string;
  };
  engineState: {
    history: string[];
    currentBeat: StoryBeat | null;
    loadingStage?: string;
  };
}

export interface StoredTape {
  id: string;
  characterName: string;
  timestamp: number;
  imgBase64: string;
  data: TapeFileSchema;
}

export interface AppSettings {
  apiKey: string;
  visualStyle: string; // Key from ANIMATION_STYLES
  videoModel: string;  // Key from VIDEO_MODELS
}
