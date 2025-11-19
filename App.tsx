
import React, { useState, useRef, useEffect, DragEvent } from 'react';
import CRTContainer from './components/CRTContainer';
import TapeDeck, { TapeDeckHandle } from './components/TapeDeck';
import ControlPanel from './components/ControlPanel';
import NarrativeLog from './components/NarrativeLog';
import { GameState, StoryBeat, TapeFileSchema } from './types';
import { generateStoryBeat, generateVideoClip } from './services/geminiService';
import { createTapeBlob, readTapeData } from './utils/tapeUtils';

const INITIAL_STATE: GameState = {
  videoUrl: null,
  currentBeat: null,
  lastFrameBase64: null,
  isLoading: false,
  loadingStage: 'IDLE',
  history: [],
};

// Helper to convert base64 to Blob
const base64ToBlob = (base64: string, type = 'image/png') => {
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type });
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const tapeDeckRef = useRef<TapeDeckHandle>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

  // --- Tape Management ---

  const handleEject = async () => {
    // Capture the CURRENT thing on screen (either the end of the video or the loaded static image)
    // We do not rely solely on gameState.lastFrameBase64 because that might be the *start* of the clip.
    let currentFrameBase64 = tapeDeckRef.current?.captureFrame();
    
    if (!currentFrameBase64) {
      // Fallback
      currentFrameBase64 = gameState.lastFrameBase64;
    }

    if (!currentFrameBase64) {
      alert("No footage to save.");
      return;
    }

    try {
      const imageBlob = base64ToBlob(currentFrameBase64);
      
      // Construct Protocol-compliant Schema
      const saveState: TapeFileSchema = {
        meta: {
          version: "1.0",
          characterName: "Viewer Agent", // Default name for browser saves
          createdAt: new Date().toISOString()
        },
        engineState: {
          history: gameState.history,
          currentBeat: gameState.currentBeat,
          loadingStage: "USER SAVE"
        }
      };
      
      const taggedBlob = await createTapeBlob(imageBlob, saveState);
      const url = URL.createObjectURL(taggedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `living_tv_save_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Eject failed", e);
      alert("Failed to eject tape.");
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/png") {
      try {
        setGameState(prev => ({ ...prev, isLoading: true, loadingStage: 'READING TAPE...' }));
        
        // Read the raw data (could be any structure)
        const { state: rawData, imgUrl } = await readTapeData(file);
        
        // Normalize data based on Schema
        let loadedState;
        
        if ('engineState' in rawData) {
          // New Protocol
          loadedState = (rawData as TapeFileSchema).engineState;
        } else {
          // Legacy / raw
          loadedState = rawData;
        }

        // Convert blob url back to base64 for storage
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          
          setGameState({
            videoUrl: null, 
            currentBeat: loadedState.currentBeat,
            lastFrameBase64: base64,
            history: loadedState.history || [],
            isLoading: false,
            loadingStage: 'TAPE LOADED - READY'
          });
          setIsStarted(true);
        };

      } catch (err) {
        console.error(err);
        alert("Invalid Tape Card. Could not read data.");
        setGameState(prev => ({ ...prev, isLoading: false, loadingStage: 'READ ERROR' }));
      }
    }
  };

  // Render
  return (
    <div 
      onDragOver={onDragOver} 
      onDragLeave={onDragLeave} 
      onDrop={onDrop}
      className="min-h-screen w-full"
    >
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
          // If no video is playing, we show the last frame loaded/captured
          staticImageSrc={gameState.lastFrameBase64 ? `data:image/png;base64,${gameState.lastFrameBase64}` : null}
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
          {!isStarted && !gameState.isLoading ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 pointer-events-none">
                <button 
                  onClick={handleStart}
                  className="bg-green-700 hover:bg-green-600 text-black font-bold py-4 px-8 rounded text-2xl tracking-widest shadow-[0_0_20px_rgba(0,255,0,0.5)] animate-pulse pointer-events-auto"
                >
                  INSERT TAPE
                </button>
                <p className="mt-4 text-green-500/60 text-sm uppercase tracking-widest">or drop tape card here</p>
             </div>
          ) : null}

          {isDragging && (
             <div className="absolute inset-0 flex items-center justify-center bg-green-900/90 z-30 border-4 border-green-500 border-dashed m-4">
                <h2 className="text-black text-3xl font-bold tracking-widest">DROP TAPE TO LOAD</h2>
             </div>
          )}
          
          <ControlPanel 
            choices={gameState.currentBeat?.choices || []}
            onChoose={handleChoice}
            onEject={handleEject}
            disabled={gameState.isLoading || !isStarted}
          />
        </div>
      </CRTContainer>
    </div>
  );
};

export default App;
