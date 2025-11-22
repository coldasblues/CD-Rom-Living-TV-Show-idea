import React, { useState, useRef, useEffect, DragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CRTContainer from '../components/CRTContainer';
import TapeDeck, { TapeDeckHandle } from '../components/TapeDeck';
import ControlPanel from '../components/ControlPanel';
import NarrativeLog from '../components/NarrativeLog';
import GenesisWizard from '../components/GenesisWizard';
import { GameState, StoryBeat, TapeFileSchema, AppSettings } from '../types';
import { generateStoryBeat, generateVideoClip, generateGenesisBeat } from '../services/geminiService';
import { createTapeBlob, readTapeData } from '../utils/tapeUtils';
import { getSettings, DEFAULT_SETTINGS } from '../services/storageService';
import { ANIMATION_STYLES, PLACEHOLDER_VIDEO } from '../constants';

const INITIAL_STATE: GameState = {
  videoUrl: null,
  currentBeat: null,
  lastFrameBase64: null,
  isLoading: false,
  loadingStage: 'IDLE',
  history: [],
};

const base64ToBlob = (base64: string, type = 'image/png') => {
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type });
};

const TVRoom: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tapeDeckRef = useRef<TapeDeckHandle>(null);
  
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showDebug, setShowDebug] = useState(false);

  // Initialize State
  const [gameState, setGameState] = useState<GameState>(() => {
    if (location.state && location.state.tapeData) {
        const data = location.state.tapeData as TapeFileSchema;
        const preloadedBase64 = location.state.tapeImgBase64 || null;
        
        // Preserve import stage if present (e.g. 'CARD IMPORT') so we know if it's a fresh card
        const incomingStage = data.engineState.loadingStage || 'TAPE LOADED';

        return {
            ...INITIAL_STATE,
            currentBeat: data.engineState.currentBeat,
            history: data.engineState.history,
            lastFrameBase64: preloadedBase64,
            loadingStage: incomingStage,
        };
    }
    return INITIAL_STATE;
  });

  // Auto-start if tape data is present (Skip "Resume" click)
  const [isStarted, setIsStarted] = useState(() => {
      return !!(location.state && location.state.tapeData);
  });
  
  // New States for Genesis
  const [showWizard, setShowWizard] = useState(false);
  const [isGeneratingGenesis, setIsGeneratingGenesis] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Determine if we need to show wizard
  useEffect(() => {
    if (!gameState.currentBeat && !gameState.isLoading && !location.state?.tapeData) {
        setShowWizard(true);
    }
  }, []);

  // Load Settings & Start check
  useEffect(() => {
      const init = async () => {
          // 1. Load Global Settings
          const globalSettings = await getSettings();
          
          // 2. Check if Tape has specific style override
          let activeSettings = { ...globalSettings };
          
          if (location.state && location.state.tapeData) {
             const meta = (location.state.tapeData as TapeFileSchema).meta;
             if (meta.visualStyle && ANIMATION_STYLES[meta.visualStyle]) {
                 console.log(`[System] Tape overrides style to: ${meta.visualStyle}`);
                 activeSettings.visualStyle = meta.visualStyle;
             }
          }

          setSettings(activeSettings);
      };
      
      init();
  }, []);

  const backToLobby = () => {
      navigate('/');
  };

  const handleGenesisSubmit = async (params: { name: string; desc: string; setting: string; themes: string[] }) => {
    setIsGeneratingGenesis(true);
    try {
      const genesisBeat = await generateGenesisBeat(params);
      const genesisContext = [
        `SERIES CONTEXT:\nCharacter: ${params.name}\nPersonality/Description: ${params.desc}\nSetting: ${params.setting}\nThemes: ${params.themes.join(', ')}`,
        genesisBeat.narrative
      ];

      setGameState(prev => ({
        ...prev,
        loadingStage: `FILMING PILOT (${settings.visualStyle.toUpperCase()})...`,
        history: genesisContext,
        isLoading: true
      }));

      // Generate the first video clip
      // Note: We don't have a previous frame for the very first clip of a new show.
      const videoUrl = await generateVideoClip(
          genesisBeat.visualPrompt, 
          null, 
          settings.visualStyle, 
          settings.videoModel
      );

      setGameState(prev => ({
        ...prev,
        currentBeat: genesisBeat,
        videoUrl: videoUrl,
        isLoading: false,
        loadingStage: 'PLAYBACK',
      }));
      
      setIsStarted(true);
      setShowWizard(false);
    } catch (error: any) {
      console.error("Genesis Error:", error);
      alert("Failed to initialize tape: " + error.message);
      setGameState(prev => ({ ...prev, loadingStage: 'INIT_FAILED', isLoading: false }));
    } finally {
      setIsGeneratingGenesis(false);
    }
  };

  // HELPER: Get Metadata from current state
  // The tape metadata is in location.state OR if we reloaded, we might need to persist it.
  // For simplicity, assume location.state.tapeData is available or we check loadedState
  const getTapeMeta = (): TapeFileSchema['meta'] | undefined => {
      const locData = location.state?.tapeData as TapeFileSchema | undefined;
      return locData?.meta;
  };

  const runLoop = async (choiceText: string | null) => {
    if (gameState.isLoading) return;

    // Detect if this is the very first run from a JSON import (placeholder image)
    const isPlaceholderImport = gameState.loadingStage === 'CARD IMPORT';
    
    // EXTRACT CUSTOM PROMPTS
    const meta = getTapeMeta();
    const customSystem = meta?.systemInstruction;
    const customTemplate = meta?.videoPromptTemplate;

    try {
      let capturedFrame = gameState.lastFrameBase64;
      
      // Capture the frame BEFORE we switch to static
      if (choiceText && tapeDeckRef.current) {
         const frame = tapeDeckRef.current.captureFrame();
         if (frame) {
             capturedFrame = frame;
         }
      }

      // Start Loading: Show Static, Hide old beat
      // Setting videoUrl to null triggers effectiveVideoSrc to use PLACEHOLDER_VIDEO
      setGameState(prev => ({ 
        ...prev, 
        isLoading: true, 
        videoUrl: null, 
        lastFrameBase64: capturedFrame,
        loadingStage: 'WRITING SCRIPT...' 
      }));

      // 1. Generate Text
      // We pass the style so the text model knows to describe things as "A claymation figure..."
      const nextBeat: StoryBeat = await generateStoryBeat(
        gameState.history,
        choiceText,
        capturedFrame,
        settings.visualStyle,
        customSystem // Pass custom system instruction
      );

      setGameState(prev => ({ 
        ...prev, 
        // NOTE: We do NOT update currentBeat yet to prevent spoilers
        loadingStage: `FILMING SCENE (${settings.visualStyle.toUpperCase()})...`,
      }));

      let newVideoUrl: string | null = null;
      let status = 'PLAYBACK';

      // 2. Generate Video
      try {
          // If it's a placeholder import (text image), we pass NULL as the image
          // This forces Veo to generate the video from scratch using the (now styled) prompt,
          // effectively creating the claymation style instead of trying to animate the text image.
          const imageToUse = isPlaceholderImport ? null : capturedFrame;

          newVideoUrl = await generateVideoClip(
              nextBeat.visualPrompt, 
              imageToUse,
              settings.visualStyle, 
              settings.videoModel,
              customTemplate // Pass custom video template
          );
      } catch (vidError: any) {
          // Handle OpenRouter limitation gracefully
          if (vidError.message === "VIDEO_GEN_UNSUPPORTED_PROVIDER") {
              console.warn("Video generation skipped due to OpenRouter provider");
              status = 'TEXT-ONLY MODE (OPENROUTER)';
          } else {
              throw vidError; // Re-throw real errors
          }
      }

      // 3. Reveal Everything (Text + Video) at once
      setGameState(prev => ({
        ...prev,
        currentBeat: nextBeat, // Now safe to show narrative
        videoUrl: newVideoUrl,
        isLoading: false,
        loadingStage: status,
        history: [...prev.history, nextBeat.narrative]
      }));

    } catch (error: any) {
      console.error("Loop Error:", error);
      
      let statusMsg = 'SIGNAL LOST';
      
      // Extract meaningful message from potentially nested error object
      const errBody = error.error || error;
      const errMsg = error.message || errBody?.message || JSON.stringify(error);

      // Handle Quota Errors Gracefully
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
          statusMsg = 'ERR: QUOTA EXCEEDED (WAITING)';
      } else if (errMsg.includes('405')) {
          statusMsg = 'ERR: MODEL INCOMPATIBLE (405)';
      } else {
          statusMsg = `ERR: ${errMsg.substring(0, 20).toUpperCase()}...`;
      }

      setGameState(prev => ({ 
        ...prev, 
        isLoading: false, 
        loadingStage: statusMsg 
      }));
    }
  };

  const handleStart = () => {
    setIsStarted(true);
    // If we already have a loaded tape, just resume playback/interaction state
  };

  const handleChoice = (choiceId: string) => {
    const choice = gameState.currentBeat?.choices.find(c => c.id === choiceId);
    if (choice) {
      runLoop(choice.text);
    }
  };

  const handleEject = async () => {
    let currentFrameBase64 = tapeDeckRef.current?.captureFrame();
    // If capturing from static or loading, fallback to last known good frame
    if (gameState.isLoading || !currentFrameBase64) {
      currentFrameBase64 = gameState.lastFrameBase64;
    }

    if (!currentFrameBase64) {
      alert("No footage to save.");
      return;
    }

    try {
      const meta = getTapeMeta();
      const imageBlob = base64ToBlob(currentFrameBase64);
      const saveState: TapeFileSchema = {
        meta: {
          version: "2.1",
          characterName: meta?.characterName || "Viewer Agent",
          createdAt: new Date().toISOString(),
          visualStyle: settings.visualStyle,
          systemInstruction: meta?.systemInstruction, // Persist custom prompts
          videoPromptTemplate: meta?.videoPromptTemplate
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
      a.download = `${saveState.meta.characterName.replace(/\s+/g, '_')}_${Date.now()}.png`;
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
        const { state: rawData, imgUrl } = await readTapeData(file);
        
        let loadedState;
        let tapeMeta;

        if ('engineState' in rawData) {
          const schema = rawData as TapeFileSchema;
          loadedState = schema.engineState;
          tapeMeta = schema.meta;
        } else {
          loadedState = rawData;
        }

        // Apply Tape Style if present
        if (tapeMeta && tapeMeta.visualStyle && ANIMATION_STYLES[tapeMeta.visualStyle]) {
            console.log(`[System] Dropped tape overrides style to: ${tapeMeta.visualStyle}`);
            setSettings(prev => ({ ...prev, visualStyle: tapeMeta.visualStyle! }));
        }

        // IMPORTANT: We must update location.state so that next loop (getTapeMeta) sees the new tape's metadata (custom prompts)
        // Since we are not navigating, we can use window.history.replaceState to update the current history entry state
        // or just rely on passing it explicitly? React Router navigation with 'replace' is cleaner.
        // However, we are already on /tv. Let's do a replace navigate with new state.
        
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          
          // Re-initialize state completely with new tape
          const newState = {
              tapeData: { meta: tapeMeta, engineState: loadedState },
              tapeImgBase64: base64
          };
          
          navigate('/tv', { state: newState, replace: true });

          // Note: The useEffect on mount won't fire again, but we manually set gameState here 
          // to ensure immediate UI update without waiting for nav prop check? 
          // Actually, navigate will trigger re-render but not re-mount. 
          // We should manually update gameState AND navigate.
          
          setGameState({
            videoUrl: null, 
            currentBeat: loadedState.currentBeat,
            lastFrameBase64: base64,
            history: loadedState.history || [],
            isLoading: false,
            loadingStage: 'TAPE LOADED - READY'
          });
          setIsStarted(true);
          setShowWizard(false); 
        };

      } catch (err) {
        console.error(err);
        alert("Invalid Tape Card.");
        setGameState(prev => ({ ...prev, isLoading: false, loadingStage: 'READ ERROR' }));
      }
    }
  };

  const getStatusColor = () => {
      if (gameState.loadingStage.startsWith('ERR')) return 'text-red-500 animate-pulse';
      if (gameState.loadingStage.includes('MODE')) return 'text-green-400';
      if (gameState.loadingStage === 'TAPE LOADED - READY') return 'text-green-500';
      if (gameState.isLoading) return 'text-yellow-500';
      return 'text-gray-500';
  };

  const getStatusText = () => {
      if (gameState.isLoading) return `STATUS: ${gameState.loadingStage}`;
      if (gameState.loadingStage.startsWith('ERR')) return gameState.loadingStage;
      if (gameState.loadingStage.includes('MODE')) return `STATUS: ${gameState.loadingStage}`;
      if (gameState.loadingStage !== 'IDLE' && gameState.loadingStage !== 'PLAYBACK') {
          return `STATUS: ${gameState.loadingStage}`;
      }
      return 'STATUS: AWAITING INPUT';
  };

  // Determine effective video source (Content vs Static)
  const effectiveVideoSrc = gameState.isLoading ? PLACEHOLDER_VIDEO : gameState.videoUrl;
  
  const displayedNarrative = gameState.isLoading 
      ? "TRANSMISSION INTERRUPTED... TUNING TO NEW FREQUENCY..." 
      : gameState.currentBeat?.narrative;

  return (
    <div 
      onDragOver={onDragOver} 
      onDragLeave={onDragLeave} 
      onDrop={onDrop}
      className="min-h-screen w-full bg-[#050505]"
    >
      <CRTContainer>
        {/* WIZARD OVERLAY */}
        {showWizard && !gameState.currentBeat && (
          <GenesisWizard onSubmit={handleGenesisSubmit} isProcessing={isGeneratingGenesis} />
        )}

        {/* Header / Status Bar */}
        <div className="w-full bg-gray-900 p-2 flex justify-between items-center text-xs text-gray-500 border-b border-gray-800 z-50 font-mono">
          <div className="flex gap-4 items-center">
              <div className={`w-2 h-2 rounded-full ${gameState.loadingStage.startsWith('ERR') ? 'bg-red-600 animate-ping' : 'bg-red-600 animate-pulse'}`}></div>
              <button onClick={() => setShowDebug(!showDebug)} className="hover:text-green-400 hover:underline cursor-pointer">CH: 03</button>
              <span className="text-green-900">STYLE: {settings.visualStyle.replace('_', ' ').toUpperCase()}</span>
          </div>
          <span className={getStatusColor()}>
              {getStatusText()}
          </span>
          <span>REC: {new Date().toLocaleTimeString()}</span>
        </div>

        {/* Video Area */}
        <TapeDeck 
          ref={tapeDeckRef}
          videoSrc={effectiveVideoSrc}
          staticImageSrc={gameState.lastFrameBase64 ? `data:image/png;base64,${gameState.lastFrameBase64}` : null}
          isProcessing={gameState.isLoading}
          onEnded={() => {}}
          loop={true}
        />

        {/* Narrative Text */}
        <NarrativeLog 
          text={displayedNarrative} 
          stage={gameState.loadingStage}
        />

        {/* Debug Panel Overlay */}
        {showDebug && (
           <div className="absolute top-10 left-4 right-4 bg-black/90 border border-green-500 p-4 font-mono text-xs text-green-500 z-50 max-h-[80vh] overflow-auto shadow-[0_0_50px_rgba(0,255,0,0.2)]">
              <div className="flex justify-between border-b border-green-900 pb-2 mb-2">
                 <strong>DEBUG CONSOLE</strong>
                 <button onClick={() => setShowDebug(false)} className="text-red-500 hover:text-red-400">[CLOSE]</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <h4 className="text-gray-500 mb-1">CURRENT BEAT (JSON)</h4>
                    <pre className="whitespace-pre-wrap break-words bg-[#0a0a0a] p-2 border border-gray-800">{JSON.stringify(gameState.currentBeat, null, 2)}</pre>
                    <h4 className="text-gray-500 mb-1 mt-2">META</h4>
                    <pre className="whitespace-pre-wrap break-words bg-[#0a0a0a] p-2 border border-gray-800">{JSON.stringify(getTapeMeta() || {}, null, 2)}</pre>
                 </div>
                 <div>
                    <h4 className="text-gray-500 mb-1">ENGINE STATE</h4>
                    <div className="bg-[#0a0a0a] p-2 border border-gray-800 space-y-1">
                      <p>Loading: <span className={gameState.isLoading ? "text-yellow-500" : "text-gray-500"}>{String(gameState.isLoading)}</span></p>
                      <p>Stage: {gameState.loadingStage}</p>
                      <p>Video URL: <span className="break-all">{gameState.videoUrl || 'NULL'}</span></p>
                      <p>History Length: {gameState.history.length}</p>
                    </div>
                    <h4 className="text-gray-500 mt-4 mb-1">LAST CAPTURED FRAME</h4>
                    {gameState.lastFrameBase64 && (
                       <img src={`data:image/png;base64,${gameState.lastFrameBase64}`} className="w-32 border border-gray-700"/>
                    )}
                 </div>
              </div>
           </div>
        )}

        {/* Controls */}
        <div className="flex-grow bg-[#111] flex flex-col justify-end relative">
          {!isStarted && !gameState.isLoading && !showWizard ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 pointer-events-none">
                <button 
                  onClick={handleStart}
                  className="bg-green-700 hover:bg-green-600 text-black font-bold py-4 px-8 rounded text-2xl tracking-widest shadow-[0_0_20px_rgba(0,255,0,0.5)] animate-pulse pointer-events-auto border-2 border-green-500"
                >
                  {gameState.lastFrameBase64 ? 'PLAY TAPE' : 'START PROGRAM'}
                </button>
                <p className="mt-4 text-green-500/60 text-sm uppercase tracking-widest font-mono">or drop tape card</p>
             </div>
          ) : null}

          {isDragging && (
             <div className="absolute inset-0 flex items-center justify-center bg-green-900/90 z-30 border-4 border-green-500 border-dashed m-4">
                <h2 className="text-black text-3xl font-bold tracking-widest font-mono">DROP TAPE TO LOAD</h2>
             </div>
          )}
          
          <ControlPanel 
            choices={gameState.isLoading ? [] : (gameState.currentBeat?.choices || [])}
            onChoose={handleChoice}
            onEject={handleEject}
            onHome={backToLobby}
            disabled={gameState.isLoading || !isStarted || showWizard}
            isLoading={gameState.isLoading}
          />
        </div>
      </CRTContainer>
    </div>
  );
};

export default TVRoom;