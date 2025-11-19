import React, { useState, useRef, useEffect } from 'react';
import CRTContainer from './components/CRTContainer';
import TapeDeck, { TapeDeckHandle } from './components/TapeDeck';
import ControlPanel from './components/ControlPanel';
import NarrativeLog from './components/NarrativeLog';
import { GameState, StoryBeat } from './types';
import { generateStoryBeat, generateVideoClip } from './services/geminiService';

const INITIAL_STATE: GameState = {
  videoUrl: null,
  currentBeat: null,
  lastFrameBase64: null,
  isLoading: false,
  loadingStage: 'IDLE',
  history: [],
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const tapeDeckRef = useRef<TapeDeckHandle>(null);
  const [isStarted, setIsStarted] = useState(false);

  // Handle the core loop
  const runLoop = async (choiceText: string | null) => {
    if (gameState.isLoading) return;

    try {
      // 1. Capture Frame (if this isn't the first run)
      let capturedFrame = gameState.lastFrameBase64;
      if (choiceText && tapeDeckRef.current) {
         const frame = tapeDeckRef.current.captureFrame();
         if (frame) {
             capturedFrame = frame;
             console.log("Frame captured for continuity.");
         }
      }

      setGameState(prev => ({ 
        ...prev, 
        isLoading: true, 
        lastFrameBase64: capturedFrame,
        loadingStage: 'WRITING SCRIPT...' 
      }));

      // 2. Generate Story (Text)
      const beat: StoryBeat = await generateStoryBeat(
        gameState.history,
        choiceText,
        capturedFrame
      );

      setGameState(prev => ({ 
        ...prev, 
        currentBeat: beat,
        loadingStage: 'FILMING SCENE (VEO)...',
        history: [...prev.history, beat.narrative]
      }));

      // 3. Generate Video
      const videoUrl = await generateVideoClip(beat.visualPrompt, capturedFrame);

      setGameState(prev => ({
        ...prev,
        videoUrl,
        isLoading: false,
        loadingStage: 'PLAYBACK'
      }));

    } catch (error) {
      console.error("Loop Error:", error);
      setGameState(prev => ({ 
        ...prev, 
        isLoading: false, 
        loadingStage: 'ERROR - RETRY' 
      }));
      alert("Transmission interrupted. Please check your API Key or try again.");
    }
  };

  const handleStart = () => {
    setIsStarted(true);
    runLoop(null); // Start with null choice (cold start)
  };

  const handleChoice = (choiceId: string) => {
    const choice = gameState.currentBeat?.choices.find(c => c.id === choiceId);
    if (choice) {
      runLoop(choice.text);
    }
  };

  // Render
  return (
    <CRTContainer>
      {/* Header / Status Bar */}
      <div className="w-full bg-gray-900 p-2 flex justify-between items-center text-xs text-gray-500 border-b border-gray-800 z-50">
        <span>CH: 03</span>
        <span>{gameState.isLoading ? `STATUS: ${gameState.loadingStage}` : 'STATUS: AWAITING INPUT'}</span>
        <span>REC: {new Date().toLocaleTimeString()}</span>
      </div>

      {/* Video Area */}
      <TapeDeck 
        ref={tapeDeckRef}
        videoSrc={gameState.videoUrl}
        isProcessing={gameState.isLoading}
        onEnded={() => { /* Optional: Auto-show controls if hidden */ }}
      />

      {/* Narrative Text */}
      <NarrativeLog 
        text={gameState.currentBeat?.narrative} 
        stage={gameState.loadingStage}
      />

      {/* Controls */}
      <div className="flex-grow bg-[#111] flex flex-col justify-end relative">
        {!isStarted ? (
           <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <button 
                onClick={handleStart}
                className="bg-green-700 hover:bg-green-600 text-black font-bold py-4 px-8 rounded text-2xl tracking-widest shadow-[0_0_20px_rgba(0,255,0,0.5)] animate-pulse"
              >
                INSERT TAPE
              </button>
           </div>
        ) : null}
        
        <ControlPanel 
          choices={gameState.currentBeat?.choices || []}
          onChoose={handleChoice}
          disabled={gameState.isLoading || !isStarted}
        />
      </div>
    </CRTContainer>
  );
};

export default App;