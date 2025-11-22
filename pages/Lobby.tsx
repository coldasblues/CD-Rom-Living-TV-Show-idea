import React, { useState, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleGenAI } from '@google/genai';
import CRTContainer from '../components/CRTContainer';
import { readTapeData } from '../utils/tapeUtils';
import { TapeFileSchema, StoredTape, AppSettings, OpenRouterModel } from '../types';
import { getLibrary, saveTapeToLibrary, deleteTapeFromLibrary, getSettings, saveSettings, DEFAULT_SETTINGS } from '../services/storageService';
import { ANIMATION_STYLES, VIDEO_MODELS, GET_KEY_URL, FAL_MODELS } from '../constants';
import { fetchOpenRouterModels } from '../services/openRouterService';

// --- Helpers ---

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const generatePlaceholderImage = (text: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 640; // 3:4 Aspect
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 480, 640);

    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#1a1a1a' : '#0a0a0a';
      ctx.fillRect(Math.random() * 480, Math.random() * 640, 3, 3);
    }

    ctx.fillStyle = 'rgba(0, 255, 0, 0.05)';
    for (let y = 0; y < 640; y += 4) {
      ctx.fillRect(0, y, 480, 1);
    }

    ctx.save();
    ctx.translate(240, 320);
    ctx.rotate(-0.1);
    ctx.textAlign = 'center';
    
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 10;
    
    ctx.font = 'bold 40px monospace';
    ctx.fillStyle = '#33ff33';
    ctx.fillText(text.substring(0, 12).toUpperCase(), 0, -20);
    
    ctx.font = '20px monospace';
    ctx.fillStyle = '#008800';
    ctx.fillText("DATA IMPORT", 0, 30);
    
    ctx.restore();
    
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, 480, 640);
  }
  return canvas.toDataURL('image/png').split(',')[1];
};

// Helper to normalize generic card JSON into our Schema
const normalizeCardData = (json: any): TapeFileSchema => {
    // Supports Standard Tavern/V2 Card JSON structure
    const charName = json.data?.name || json.character?.name || json.name || "Unknown";
    
    // Extract rich context
    const scenario = json.data?.scenario || json.scenario || json.character?.scenario || "A mysterious sequence of events.";
    const personality = json.data?.description || json.personality || json.description || json.character?.description || "Unknown entity.";
    const firstMes = json.data?.first_mes || json.first_mes || json.initial_prompt || `The story of ${charName} begins.`;

    // Construct a 'Context Zero' entry.
    // This specific format allows us to detect it later and prepend it to prompts.
    const contextEntry = `SERIES CONTEXT:\nCharacter: ${charName}\nPersonality/Description: ${personality}\nScenario/Theme: ${scenario}`;
    
    return {
        meta: { version: "1.0", characterName: charName, createdAt: new Date().toISOString() },
        engineState: {
            // Pushing context first, then the actual start message
            history: [contextEntry, firstMes], 
            currentBeat: {
                narrative: firstMes,
                visualPrompt: `A cinematic shot of ${charName} in this setting: ${scenario}. ${personality}`,
                choices: [
                    { id: "1", text: "Look around" },
                    { id: "2", text: "Move forward" },
                    { id: "3", text: "Check inventory" },
                    { id: "4", text: "Wait" }
                ]
            },
            loadingStage: "CARD IMPORT"
        }
    };
};

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'RENTAL' | 'SYSTEM'>('RENTAL');

  // Data
  const [library, setLibrary] = useState<StoredTape[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  
  // UI State
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Load Data on Mount
  useEffect(() => {
    const init = async () => {
      try {
        const [libs, prefs] = await Promise.all([getLibrary(), getSettings()]);
        
        // CHECK FOR MAGIC LINK (URL Key)
        const urlParams = new URLSearchParams(window.location.search);
        const magicKey = urlParams.get('key');
        
        let activeSettings = prefs;

        if (magicKey) {
           // Import key from URL
           activeSettings = { ...prefs, apiKey: magicKey };
           await savePreferences(activeSettings);
           
           // Clean URL
           const cleanUrl = window.location.pathname + window.location.hash;
           window.history.replaceState(null, '', cleanUrl);
           
           setError("ACCESS KEY IMPORTED SUCCESSFULLY");
           setTimeout(() => setError(null), 3000);
        }

        setLibrary(libs);
        setSettings(activeSettings);
        
        // Check API key status if exists
        if (activeSettings.apiKey) {
            setApiStatus('idle'); 
            // If OpenRouter, pre-fetch models
            if (activeSettings.apiKey.startsWith('sk-or-')) {
               loadOpenRouterModels();
            }
        } else {
            // BYOK Flow: No key found? Send to System tab immediately.
            setActiveTab('SYSTEM');
            setError("⚠️ SETUP REQUIRED: PLEASE ENTER API KEY");
        }
      } catch (e) {
        console.error("Init failed", e);
        setError("System Memory Corrupted.");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // --- Settings Logic ---

  const loadOpenRouterModels = async () => {
    if (availableModels.length > 0) return; // Already loaded
    setIsFetchingModels(true);
    try {
      const models = await fetchOpenRouterModels();
      setAvailableModels(models);
    } catch (e) {
      console.error("Failed to load models", e);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const savePreferences = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      await saveSettings(newSettings);
      
      if (newSettings.apiKey.startsWith('sk-or-') && availableModels.length === 0) {
        loadOpenRouterModels();
      }
  };

  const testApiConnection = async () => {
    if (!settings.apiKey || settings.apiKey.trim() === '') return;

    setApiStatus('testing');
    try {
      // Simple heuristic check for OpenRouter
      if (settings.apiKey.startsWith('sk-or-')) {
        const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${settings.apiKey}` }
        });
        if (res.ok) {
            setApiStatus('success');
            setError(null);
            savePreferences(settings);
            loadOpenRouterModels();
        } else {
            throw new Error("OpenRouter Key Invalid");
        }
      } else {
        // Google Check
        const ai = new GoogleGenAI({ apiKey: settings.apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Ping',
        });

        if (response.text) {
            setApiStatus('success');
            setError(null);
            savePreferences(settings); 
        }
      }
    } catch (err: any) {
      console.error('API Test Failed:', err);
      setApiStatus('error');
      setError(err.message || 'Connection Refused');
    }
  };

  const copyMagicLink = () => {
    if (!settings.apiKey) return;
    const link = `${window.location.origin}${window.location.pathname}?key=${settings.apiKey}`;
    navigator.clipboard.writeText(link);
    setCopyStatus("LINK COPIED TO CLIPBOARD");
    setTimeout(() => setCopyStatus(null), 3000);
  };

  // --- Rental/Tape Logic ---

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
    setError(null);
    
    // If dropped while in settings, switch to rental to show result
    if (activeTab !== 'RENTAL') setActiveTab('RENTAL');

    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => 
      f.type === 'image/png' || 
      f.type === 'application/json' || 
      f.name.toLowerCase().endsWith('.json')
    );
    
    if (files.length === 0) {
        setError("Invalid media format. PNG or JSON only.");
        return;
    }

    for (const file of files) {
      try {
        let normalizedData: TapeFileSchema;
        let base64Image: string;

        if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
            const text = await file.text();
            const json = JSON.parse(text);
            normalizedData = normalizeCardData(json);
            base64Image = generatePlaceholderImage(normalizedData.meta.characterName);
        } else {
            // Handle PNG
            try {
              const { state: rawData } = await readTapeData(file);
              
              if ('engineState' in rawData) {
                  // It's a native Living TV Tape
                  normalizedData = rawData as TapeFileSchema;
              } else {
                  // It's a generic Character Card (Tavern/V2)
                  normalizedData = normalizeCardData(rawData);
              }
              
              base64Image = await blobToBase64(file);
            } catch (err: any) {
              if (err.message === "No Tape Data found on this image.") {
                // It's just a raw PNG. Use filename as name, empty history.
                const charName = file.name.replace(/\.[^/.]+$/, "").replace(/-TapeCard$/i, "");
                base64Image = await blobToBase64(file);
                
                // Even for raw images, we want to start with some context so prompts don't hallucinate.
                const rawContext = `SERIES CONTEXT:\nCharacter: ${charName}\nNote: Imported from raw image file.`;
                
                normalizedData = {
                  meta: { version: "1.0", characterName: charName, createdAt: new Date().toISOString() },
                  engineState: {
                    history: [rawContext],
                    currentBeat: {
                      narrative: `The tape labeled "${charName}" is loaded.`,
                      visualPrompt: `A cinematic shot of ${charName}, highly detailed stop-motion animation.`,
                      choices: [{ id: "1", text: "Play Tape" }]
                    },
                    loadingStage: "RAW IMPORT"
                  }
                };
              } else {
                throw err;
              }
            }
        }
        
        const newTape: StoredTape = {
            id: `tape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            characterName: normalizedData.meta.characterName || "Unknown",
            timestamp: Date.now(),
            imgBase64: base64Image,
            data: normalizedData
        };

        await saveTapeToLibrary(newTape);
        setLibrary(prev => [newTape, ...prev]);

      } catch (err) {
        console.error("Import failed", err);
        setError("Data corrupted.");
      }
    }
  };

  const playTape = (tape: StoredTape) => {
    navigate('/tv', { state: { tapeData: tape.data, tapeImgBase64: tape.imgBase64 } });
  };

  const deleteTape = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if(confirm("Erase this tape?")) {
          await deleteTapeFromLibrary(id);
          setLibrary(prev => prev.filter(t => t.id !== id));
      }
  };

  const playNew = () => {
    navigate('/tv');
  };

  // Filter Models based on Search
  const filteredModels = availableModels.filter(m => 
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) || 
      m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen w-full bg-[#050505]" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <CRTContainer>
        <div className="flex flex-col h-full w-full p-6 relative">
          
          {/* Header with Tabs */}
          <div className="flex justify-between items-end border-b-2 border-green-900 pb-2 mb-4">
            <div>
                <h1 className="text-4xl text-green-500 font-bold tracking-widest text-glow">TAPE LOOP</h1>
                <p className="text-green-800 text-sm uppercase">Interactive Cinema Engine</p>
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={() => setActiveTab('RENTAL')}
                    disabled={!settings.apiKey}
                    className={`px-4 py-2 font-mono text-xl uppercase tracking-widest transition-colors ${activeTab === 'RENTAL' ? 'bg-green-900 text-green-100' : 'bg-black text-green-800 hover:text-green-500 border border-green-900'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    Rental
                </button>
                <button 
                    onClick={() => navigate('/studio')}
                    className="px-4 py-2 font-mono text-xl uppercase tracking-widest transition-colors bg-black text-green-800 hover:text-green-500 border border-green-900"
                >
                    Studio
                </button>
                <button 
                    onClick={() => setActiveTab('SYSTEM')}
                    className={`px-4 py-2 font-mono text-xl uppercase tracking-widest transition-colors ${activeTab === 'SYSTEM' ? 'bg-green-900 text-green-100' : 'bg-black text-green-800 hover:text-green-500 border border-green-900'} ${!settings.apiKey ? 'animate-pulse text-green-300 border-green-300' : ''}`}
                >
                    System
                </button>
            </div>
          </div>

          {/* CONTENT AREA */}
          <div className="flex-grow overflow-hidden flex flex-col relative">
            
            {/* --- RENTAL TAB --- */}
            {activeTab === 'RENTAL' && (
                <>
                    {isLoading ? (
                        <div className="flex-grow flex items-center justify-center text-green-800 animate-pulse">LOADING INVENTORY...</div>
                    ) : (library && library.length === 0) ? (
                    <div className={`flex-grow border-4 border-dashed ${isDragging ? 'border-green-400 bg-green-900/20' : 'border-green-900/30'} rounded-lg flex flex-col items-center justify-center transition-colors duration-300 group cursor-pointer`} onClick={playNew}>
                        <div className="text-6xl mb-4 opacity-50 group-hover:scale-110 transition-transform">📼</div>
                        <p className="text-green-600 text-xl tracking-widest">DROP TAPE / JSON HERE</p>
                        <p className="text-green-900 text-sm mt-2">or click to start broadcast</p>
                    </div>
                    ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 overflow-y-auto p-2 h-full pb-20 pr-2">
                        <button onClick={playNew} className="aspect-[3/4] border-2 border-green-900 border-dashed hover:border-green-500 flex flex-col items-center justify-center group transition-all bg-black/20">
                           <span className="text-4xl mb-2 group-hover:scale-110 transition-transform text-green-700">+</span>
                           <span className="text-green-700 text-sm uppercase tracking-widest group-hover:text-green-400">New Tape</span>
                        </button>

                        {library.map((tape) => (
                        <div key={tape.id} onClick={() => playTape(tape)} className="relative aspect-[3/4] bg-black border border-gray-800 hover:border-green-400 cursor-pointer group transition-all shadow-lg overflow-hidden rounded-sm">
                            <div className="absolute inset-0 bg-gray-900">
                              <img src={`data:image/png;base64,${tape.imgBase64}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity mix-blend-overlay grayscale group-hover:grayscale-0" alt="Tape" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/90 p-3 border-t border-gray-800">
                              <p className="text-green-500 text-lg font-bold truncate font-mono">{tape.characterName}</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-gray-500 text-[10px] uppercase tracking-wider truncate">{new Date(tape.timestamp).toLocaleDateString()}</p>
                                <button onClick={(e) => deleteTape(e, tape.id)} className="text-gray-700 hover:text-red-500 text-[10px] uppercase hover:underline">Erase</button>
                              </div>
                            </div>
                        </div>
                        ))}
                    </div>
                    )}
                </>
            )}

            {/* --- SYSTEM TAB --- */}
            {activeTab === 'SYSTEM' && (
                <div className="p-8 max-w-2xl mx-auto w-full overflow-y-auto">
                    <div className="mb-8 border border-green-900 p-6 bg-black/50">
                        <h2 className="text-xl text-green-500 mb-4 uppercase border-b border-green-900/50 pb-2">Authorization</h2>
                        <div className="flex flex-col gap-2">
                            {/* PRIMARY API KEY */}
                            <label className="text-green-800 text-sm">API KEY (GEMINI OR OPENROUTER)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="password" 
                                    value={settings.apiKey}
                                    onChange={(e) => {
                                        setSettings({...settings, apiKey: e.target.value});
                                        setApiStatus('idle');
                                    }}
                                    placeholder="sk-..."
                                    className="flex-grow bg-black border border-green-900 text-green-500 px-4 py-2 focus:border-green-500 focus:outline-none font-mono"
                                />
                                <button 
                                    onClick={testApiConnection}
                                    disabled={apiStatus === 'testing'}
                                    className="bg-green-900 text-black px-4 py-2 hover:bg-green-500 font-bold uppercase disabled:opacity-50"
                                >
                                    {apiStatus === 'testing' ? '...' : 'Verify'}
                                </button>
                            </div>
                            
                            {/* FAL AI KEY */}
                            <label className="text-green-800 text-sm mt-4">FAL.AI KEY (OPTIONAL)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="password" 
                                    value={settings.falKey || ''}
                                    onChange={(e) => {
                                        setSettings({...settings, falKey: e.target.value});
                                    }}
                                    placeholder="Key..."
                                    className="flex-grow bg-black border border-green-900 text-green-500 px-4 py-2 focus:border-green-500 focus:outline-none font-mono"
                                />
                            </div>
                            <p className="text-xs text-gray-600">Enter Fal key to use Minimax/Luma models.</p>

                            {/* FAL MODEL SELECTOR - NEW ADDITION */}
                            {settings.falKey && (
                                <div className="mt-4 pt-4 border-t border-green-900/30">
                                    <label className="text-green-800 text-sm">VIDEO MODEL (CHANNEL)</label>
                                    <select 
                                        value={settings.falModel}
                                        onChange={(e) => savePreferences({...settings, falModel: e.target.value})}
                                        className="w-full mt-2 bg-black border border-green-900 text-green-500 px-4 py-2 focus:border-green-500 focus:outline-none font-mono uppercase"
                                    >
                                        {Object.entries(FAL_MODELS).map(([name, id]) => (
                                            <option key={id} value={id}>{name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-600 mt-1">Select the underlying video generation engine.</p>
                                </div>
                            )}

                            <div className="flex justify-between items-start mt-4">
                                <p className="text-xs text-gray-600">
                                    {apiStatus === 'success' && <span className="text-green-500">✓ Connection Established</span>}
                                    {apiStatus === 'error' && <span className="text-red-500">✗ Connection Failed</span>}
                                    {apiStatus === 'idle' && "Supports Google Gemini or OpenRouter (sk-or-...) keys."}
                                </p>
                                <a 
                                    href={GET_KEY_URL} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-green-700 text-xs hover:text-green-400 underline decoration-dotted"
                                >
                                    Get a Free API Key &rarr;
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* OPENROUTER MODEL CONFIG */}
                    {settings.apiKey.startsWith('sk-or-') && (
                        <div className="mb-8 border border-green-900 p-6 bg-black/50">
                            <div className="flex justify-between items-center mb-4 border-b border-green-900/50 pb-2">
                              <h2 className="text-xl text-green-500 uppercase">OpenRouter Model</h2>
                              <button 
                                onClick={loadOpenRouterModels} 
                                className="text-green-800 hover:text-green-500 text-xs uppercase flex items-center gap-1"
                              >
                                {isFetchingModels ? 'SYNCING...' : 'REFRESH LIST'}
                              </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="relative">
                                  <input 
                                      type="text" 
                                      value={modelSearch}
                                      onChange={(e) => setModelSearch(e.target.value)}
                                      placeholder="Search models (e.g. 'gemini 3')..."
                                      className="w-full bg-black border border-green-900 text-green-500 px-4 py-2 mb-2 focus:border-green-500 focus:outline-none font-mono text-sm"
                                  />
                                  <span className="absolute right-3 top-2 text-green-800 text-xs">
                                      {filteredModels.length} FOUND
                                  </span>
                                </div>
                                
                                <div className="h-48 overflow-y-auto border border-green-900/50 bg-black/30 p-1 scrollbar-thin">
                                    {filteredModels.map(model => (
                                        <div 
                                            key={model.id}
                                            onClick={() => savePreferences({...settings, openRouterModel: model.id})}
                                            className={`
                                                cursor-pointer p-2 flex justify-between items-center border-b border-green-900/20 hover:bg-green-900/20 transition-colors
                                                ${settings.openRouterModel === model.id ? 'bg-green-900/40 border-l-4 border-l-green-500' : ''}
                                            `}
                                        >
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-green-400 font-bold text-sm truncate">{model.name}</span>
                                                <span className="text-gray-600 text-[10px] truncate">{model.id}</span>
                                            </div>
                                            <div className="text-right flex flex-col shrink-0 ml-2">
                                                <span className="text-gray-500 text-[10px]">
                                                   {model.context_length ? Math.round(model.context_length/1000) + 'k' : '?'} CTX
                                                </span>
                                                {model.pricing && (
                                                    <span className="text-green-800 text-[10px]">
                                                        ${parseFloat(model.pricing.prompt) * 1000000}/M
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredModels.length === 0 && !isFetchingModels && (
                                        <div className="p-4 text-center text-gray-600 text-xs">NO MODELS FOUND</div>
                                    )}
                                    {isFetchingModels && (
                                        <div className="p-4 text-center text-green-800 animate-pulse text-xs">DOWNLOADING REGISTRY...</div>
                                    )}
                                </div>
                                
                                <div className="flex justify-between items-center mt-2">
                                    <p className="text-xs text-gray-600">
                                        Selected: <span className="text-green-500 font-bold">{settings.openRouterModel}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mb-8 border border-green-900 p-6 bg-black/50">
                        <h2 className="text-xl text-green-500 mb-4 uppercase border-b border-green-900/50 pb-2">Production Settings</h2>
                        
                        <div className="flex flex-col gap-6">
                            {/* Visual Style Selector Removed as requested */}

                            <div className="flex flex-col gap-2">
                                <label className="text-green-800 text-sm">GENERATION MODEL (GOOGLE)</label>
                                <select 
                                    value={settings.videoModel}
                                    onChange={(e) => savePreferences({...settings, videoModel: e.target.value})}
                                    disabled={settings.apiKey.startsWith('sk-or-')}
                                    className="bg-black border border-green-900 text-green-500 px-4 py-2 focus:border-green-500 focus:outline-none font-mono uppercase disabled:opacity-50"
                                >
                                    {Object.keys(VIDEO_MODELS).map(key => (
                                        <option key={key} value={key}>{key.toUpperCase()} {key === 'fast' ? '(Preview)' : '(Full Quality)'}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-600">
                                    Fast (Preview) generates 720p quickly. Quality takes longer.
                                    {settings.apiKey.startsWith('sk-or-') && <br/>}
                                    {settings.apiKey.startsWith('sk-or-') && <span className="text-yellow-600">Using OpenRouter? This setting is ignored in favor of the Model ID above.</span>}
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    {/* REMOTE ACCESS */}
                    <div className="mb-8 border border-green-900 p-6 bg-black/50 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 bg-green-900 text-black text-xs font-bold px-8 py-1 rotate-45">
                           SHARE
                        </div>
                        <h2 className="text-xl text-green-500 mb-4 uppercase border-b border-green-900/50 pb-2">Remote Access</h2>
                        <p className="text-green-800 text-sm mb-4">
                           Generate a "Magic Link" to share this app with your API credentials pre-loaded. 
                           Anyone with this link can use your key.
                        </p>
                        <button 
                           onClick={copyMagicLink}
                           disabled={!settings.apiKey}
                           className="w-full border border-dashed border-green-500 text-green-500 py-3 hover:bg-green-900/30 uppercase tracking-widest font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           {copyStatus || (settings.apiKey ? "Copy Magic Link" : "Enter Key First")}
                        </button>
                    </div>

                    <div className="text-center text-gray-600 text-xs">
                        SYSTEM VERSION 1.5 • TAPE LOOP ENGINE
                    </div>
                </div>
            )}

          </div>

          {/* Footer Status */}
          <div className="mt-4 pt-2 border-t border-gray-900 text-gray-600 text-xs flex justify-between font-mono">
            <span>INVENTORY: {library ? library.length : 0}</span>
            {error && <span className="text-red-500 blink font-bold">{error}</span>}
            {!settings.apiKey ? <span className="text-yellow-600 animate-pulse">⚠ INSERT KEY IN SYSTEM TAB</span> : <span className="text-green-900">SYSTEM READY</span>}
          </div>

          {isDragging && (
             <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center border-4 border-green-500 border-dashed m-4">
                <p className="text-green-500 text-2xl tracking-widest animate-pulse">DROP FILE TO IMPORT</p>
             </div>
          )}

        </div>
      </CRTContainer>
    </div>
  );
};

export default Lobby;