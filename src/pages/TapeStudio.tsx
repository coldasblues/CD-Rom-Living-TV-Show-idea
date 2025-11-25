import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CRTContainer from '../components/CRTContainer';
import { createTapeBlob, optimizeImageForCard } from '../utils/tapeUtils';
import { TapeFileSchema, Choice } from '../types';
import { ANIMATION_STYLES, DEFAULT_NARRATIVE_INSTRUCTION, DEFAULT_VIDEO_TEMPLATE, COVER_ART_TAGS } from '../constants';
import { generateFalImage } from '../services/falService'; 
import { getSettings } from '../services/storageService'; 

const VISUAL_TAGS = [
  "Cinematic Lighting", "Depth of Field", "Slow Zoom", 
  "Handheld Camera", "VHS Glitch", "Hyper-Realistic", 
  "Studio Ghibli Style", "Noir Shadows", "Wide Angle Lens",
  "Volumetric Fog", "Stop-Motion Jitter", "8k Resolution"
];

const TapeStudio: React.FC = () => {
  const navigate = useNavigate();
  
  // Basic Info
  const [title, setTitle] = useState("UNTITLED PROJECT");
  const [author, setAuthor] = useState("ANONYMOUS");
  const [visualStyle, setVisualStyle] = useState("claymation");
  const [renderMode, setRenderMode] = useState<'video' | 'slideshow'>('video');
  
  // Content
  const [introNarrative, setIntroNarrative] = useState("The screen flickers to life. You are standing in a dark room.");
  const [visualPrompt, setVisualPrompt] = useState("A dark room with a single flickering lightbulb, cinematic lighting");
  const [choices, setChoices] = useState<Choice[]>([
    { id: '1', text: 'Look around' },
    { id: '2', text: 'Check inventory' }
  ]);

  // Advanced Logic
  const [customRules, setCustomRules] = useState("");
  const [systemInstruction, setSystemInstruction] = useState(DEFAULT_NARRATIVE_INSTRUCTION);
  const [videoTemplate, setVideoTemplate] = useState(DEFAULT_VIDEO_TEMPLATE);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Cover Art
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  
  // Status States
  const [genStatus, setGenStatus] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addVisualTag = (tag: string) => {
    setVisualPrompt(prev => prev.trim().endsWith(',') ? `${prev.trim()} ${tag}` : `${prev.trim()}, ${tag}`);
  };

  const addCoverTag = (tag: string) => {
    setCoverPrompt(prev => prev.trim().endsWith(',') ? `${prev.trim()} ${tag}` : `${prev.trim()}, ${tag}`);
  };

  const addChoice = () => setChoices([...choices, { id: Date.now().toString(), text: '' }]);
  const updateChoice = (index: number, val: string) => {
    const newChoices = [...choices];
    newChoices[index].text = val;
    setChoices(newChoices);
  };
  const removeChoice = (index: number) => setChoices(choices.filter((_, i) => i !== index));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
          setCoverImage(reader.result as string);
          setGenStatus("Image Uploaded Manually");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateCover = async () => {
      // 1. Immediate UI Feedback
      setIsGeneratingCover(true);
      setGenStatus("Checking Credentials...");
      
      try {
          const settings = await getSettings();
          
          if (!settings.falKey) {
              setGenStatus("ERROR: No Fal.ai Key.");
              alert("MISSING KEY: Please go to the SYSTEM tab and enter a Fal.ai Key to use the generator.");
              setIsGeneratingCover(false);
              return;
          }
          
          // Default prompt if empty
          const finalPrompt = coverPrompt || `A retro VHS cover art for a show called "${title}". ${visualStyle} style, masterpiece, best quality.`;
          
          setGenStatus("Generating (Flux Pro 1.1)...");
          
          // 2. Generate URL
          const imgUrl = await generateFalImage(finalPrompt, settings.falKey);
          setGenStatus("Downloading Preview...");

          // 3. Convert to Base64 (Data URL) for preview and storage
          const res = await fetch(imgUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
              setCoverImage(reader.result as string);
              setGenStatus("Cover Art Generated Successfully.");
              setIsGeneratingCover(false);
          };
          reader.readAsDataURL(blob);
          
      } catch (e: any) {
          console.error("Cover Gen Error:", e);
          setGenStatus(`FAILED: ${e.message}`);
          alert(`GENERATION FAILED: ${e.message}`);
          setIsGeneratingCover(false);
      }
  };

  const handleExport = async () => {
    if (!coverImage) {
      setGenStatus("ERROR: Missing Cover Image");
      alert("PLEASE ADD COVER ART: Generate one with AI or click the box to upload your own.");
      return;
    }

    setIsExporting(true);
    try {
      // 1. Convert current base64 cover image to Blob
      const res = await fetch(coverImage);
      const rawBlob = await res.blob();

      // 2. Optimize image (Resize to 800px width, ensure PNG format for Chunk Injection)
      const optimizedBlob = await optimizeImageForCard(rawBlob, 800);

      const tapeData: TapeFileSchema = {
        meta: {
          version: "2.1",
          characterName: title,
          createdAt: new Date().toISOString(),
          visualStyle: visualStyle, 
          author: author,
          gameRules: customRules || "Standard adventure rules apply.",
          systemInstruction: systemInstruction,
          videoPromptTemplate: videoTemplate,
          renderMode: renderMode 
        },
        engineState: {
          history: [
            `SERIES CONTEXT:\nTitle: ${title}\nAuthor: ${author}\n\nGAME RULES:\n${customRules}`,
            introNarrative
          ],
          currentBeat: {
            narrative: introNarrative,
            visualPrompt: `${visualPrompt}, ${ANIMATION_STYLES[visualStyle] || ''}`,
            choices: choices
          },
          loadingStage: "NEW CARTRIDGE"
        }
      };

      const finalTape = await createTapeBlob(optimizedBlob, tapeData);
      const url = URL.createObjectURL(finalTape);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}_MASTER.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Export failed:", e);
      alert("Failed to export tape: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-full w-full font-mono text-green-400">
      
      {/* Header */}
      <div className="flex justify-between items-end border-b-2 border-green-800 pb-2 mb-4 sticky top-0 bg-[#0a0a0a] z-20 pt-2">
        <div>
          <h1 className="text-3xl text-green-400 font-bold tracking-widest text-glow">TAPE STUDIO</h1>
          <p className="text-green-800 text-xs uppercase">Cartridge Authoring Tool v1.3</p>
        </div>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-green-500 uppercase tracking-wider border border-transparent hover:border-green-900 px-2 py-1 transition-all">
            [ EXIT TO LOBBY ]
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: SETTINGS */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* 1. Info */}
          <div className="bg-black/40 p-3 border border-green-900/50 rounded-sm">
            <h2 className="text-green-500 mb-2 uppercase text-xs font-bold border-b border-green-900/30 pb-1 flex justify-between">
                <span>1. Cartridge Metadata</span>
            </h2>
            <div className="space-y-2">
              <div>
                  <label className="text-[9px] text-green-800 uppercase block">Project Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm focus:outline-none focus:border-green-500 placeholder-green-900" placeholder="ENTER TITLE" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <div>
                      <label className="text-[9px] text-green-800 uppercase block">Author</label>
                      <input value={author} onChange={e => setAuthor(e.target.value)} className="w-full bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm focus:outline-none focus:border-green-500" placeholder="NAME" />
                  </div>
                  <div>
                      <label className="text-[9px] text-green-800 uppercase block">Visual Style</label>
                      <select value={visualStyle} onChange={e => setVisualStyle(e.target.value)} className="w-full bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm uppercase focus:outline-none focus:border-green-500 cursor-pointer">
                           {Object.keys(ANIMATION_STYLES).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                  </div>
              </div>
              <div>
                <label className="text-[9px] text-green-800 uppercase block">Default Render Mode</label>
                <select 
                    value={renderMode} 
                    onChange={e => setRenderMode(e.target.value as 'video' | 'slideshow')} 
                    className="w-full bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm uppercase focus:outline-none focus:border-green-500 cursor-pointer"
                >
                     <option value="video">Video (Cinematic Motion)</option>
                     <option value="slideshow">Slideshow (Static Images)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Core Logic */}
          <div className="bg-black/40 p-3 border border-green-900/50 rounded-sm">
            <h2 className="text-green-500 text-xs uppercase mb-2 font-bold border-b border-green-900/30 pb-1">2. Game Mechanics</h2>
            <textarea value={customRules} onChange={e => setCustomRules(e.target.value)} placeholder="// e.g. 'This is a horror game. The user has 3 health points.'" className="w-full h-24 bg-[#050505] border border-green-900 text-green-400 px-2 py-1 font-mono text-sm resize-none focus:outline-none focus:border-green-500 placeholder-green-900" />
          </div>

          {/* 3. Advanced (Collapsible) */}
          <div className="bg-black/40 border border-green-900/50 rounded-sm">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full p-2 flex justify-between items-center text-green-600 hover:text-green-400 hover:bg-green-900/10 transition-colors">
                <span className="text-xs uppercase font-bold">3. Advanced Prompt Engineering</span>
                <span className="text-xs">{showAdvanced ? '[-]' : '[+]'}</span>
            </button>
            
            {showAdvanced && (
                <div className="p-3 pt-0 border-t border-green-900/30 space-y-2">
                    <div>
                        <label className="text-[9px] text-green-800 uppercase block">System Instruction (Persona)</label>
                        <textarea 
                            value={systemInstruction} 
                            onChange={e => setSystemInstruction(e.target.value)} 
                            className="w-full h-20 bg-[#050505] border border-green-900/50 text-green-600 px-2 py-1 font-mono text-[10px] resize-none focus:outline-none focus:border-green-500"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] text-green-800 uppercase block">Video Prompt Template</label>
                        <textarea 
                            value={videoTemplate} 
                            onChange={e => setVideoTemplate(e.target.value)} 
                            className="w-full h-16 bg-[#050505] border border-green-900/50 text-green-600 px-2 py-1 font-mono text-[10px] resize-none focus:outline-none focus:border-green-500"
                        />
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CONTENT */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* 4. The Hook */}
          <div className="bg-black/40 p-3 border border-green-900/50 rounded-sm">
            <h2 className="text-green-500 mb-2 uppercase text-xs font-bold border-b border-green-900/30 pb-1">4. Opening Scene</h2>
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] text-green-800 uppercase block">Intro Narrative</label>
                    <textarea value={introNarrative} onChange={e => setIntroNarrative(e.target.value)} className="w-full h-16 bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm resize-none focus:outline-none focus:border-green-500 placeholder-green-900" />
                </div>
                <div>
                    <label className="text-[9px] text-green-800 uppercase block">Visual Description</label>
                    <textarea value={visualPrompt} onChange={e => setVisualPrompt(e.target.value)} className="w-full h-16 bg-[#050505] border border-green-900 text-green-400 px-2 py-1 mb-1 text-sm resize-none focus:outline-none focus:border-green-500 placeholder-green-900" />
                    <div className="flex flex-wrap gap-1">{VISUAL_TAGS.map(tag => <button key={tag} onClick={() => addVisualTag(tag)} className="text-[9px] border border-green-900/40 text-gray-500 px-2 py-0.5 bg-black hover:text-green-400 hover:border-green-400 transition-colors rounded-sm uppercase">+ {tag}</button>)}</div>
                </div>
            </div>
          </div>

          {/* 5. Choices */}
          <div className="bg-black/40 p-3 border border-green-900/50 rounded-sm">
            <div className="flex justify-between mb-2 border-b border-green-900/30 pb-1">
              <h2 className="text-green-500 text-xs uppercase font-bold">5. Initial Choices</h2>
              <button onClick={addChoice} className="text-[9px] bg-green-900 text-black px-2 py-0.5 font-bold hover:bg-green-500 uppercase rounded-sm">+ Add Option</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {choices.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-green-800 text-xs font-bold">{i + 1}.</span>
                  <input value={c.text} onChange={e => updateChoice(i, e.target.value)} className="bg-transparent border-b border-green-900 text-green-400 w-full text-sm focus:outline-none focus:border-green-500" />
                  <button onClick={() => removeChoice(i)} className="text-red-900 hover:text-red-500 text-xs px-2 font-bold">X</button>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Cover Art Studio */}
          <div className="bg-black/40 p-3 border border-green-900/50 rounded-sm">
            <h2 className="text-green-500 mb-2 uppercase text-xs font-bold border-b border-green-900/30 pb-1">6. Cover Art</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Controls */}
                <div className="flex flex-col gap-2">
                     <textarea 
                        value={coverPrompt} 
                        onChange={e => setCoverPrompt(e.target.value)} 
                        placeholder="Describe cover art..."
                        className="flex-grow h-20 bg-[#050505] border border-green-900 text-green-400 px-2 py-1 text-sm resize-none focus:outline-none focus:border-green-500 placeholder-green-900" 
                    />
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                        {COVER_ART_TAGS.map(tag => (
                            <button 
                                key={tag} 
                                onClick={() => addCoverTag(tag)}
                                className="text-[9px] border border-green-900/30 text-gray-500 px-2 py-0.5 bg-black hover:text-green-400 hover:border-green-400 transition-colors uppercase"
                            >
                                + {tag}
                            </button>
                        ))}
                    </div>
                    <button 
                        onClick={handleGenerateCover}
                        disabled={isGeneratingCover}
                        className={`
                            w-full py-2 border text-xs uppercase tracking-widest transition-all font-bold
                            ${isGeneratingCover ? 'bg-green-900/20 text-green-700 border-green-900' : 'bg-green-900/20 border-green-500/30 text-green-400 hover:bg-green-900/40 hover:border-green-400'}
                        `}
                    >
                        {isGeneratingCover ? "Generating..." : "GENERATE AI COVER"}
                    </button>
                    {/* Status Log */}
                    <div className="h-4 flex items-center">
                        <span className={`text-[9px] font-mono ${genStatus.includes('ERROR') || genStatus.includes('FAILED') ? 'text-red-500' : 'text-green-600'}`}>
                            {genStatus ? `> ${genStatus}` : ''}
                        </span>
                    </div>
                </div>

                {/* Preview Box */}
                <div className="w-full aspect-square bg-[#050505] border-2 border-dashed border-green-900/50 hover:border-green-500 flex items-center justify-center relative group overflow-hidden transition-colors rounded-sm">
                    <div 
                       onClick={() => fileInputRef.current?.click()}
                       className="absolute inset-0 z-10 cursor-pointer"
                       title="Click to Upload Cover Art"
                    ></div>
                    
                    {coverImage ? (
                        <>
                            <img src={coverImage} className="w-full h-full object-cover" alt="Cover Preview" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                <span className="text-green-400 font-bold uppercase tracking-widest text-xs border border-green-400 px-3 py-1 bg-black">Replace Image</span>
                            </div>
                        </>
                    ) : (
                         <div className="text-center p-4 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
                             <div className="text-3xl mb-2 text-green-800">⬆️</div>
                             <p className="text-green-600 font-bold text-[10px] uppercase tracking-widest">Click to Upload</p>
                             <p className="text-[9px] text-green-800 mt-1 uppercase">or use Generator</p>
                         </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/png,image/jpeg" />
                </div>
            </div>
          </div>

        </div> 
      </div>
      
      {/* 7. FINAL FOOTER SUBMIT */}
      <div className="mt-6 border-t border-green-900/50 pt-4">
          <button 
            disabled={!coverImage || isExporting}
            onClick={handleExport}
            className={`
              w-full py-4 text-xl font-black tracking-[0.3em] uppercase transition-all duration-300 rounded-sm
              ${!coverImage 
                ? 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed' 
                : 'bg-green-600 text-black hover:bg-green-500 shadow-[0_0_30px_rgba(0,255,0,0.3)] hover:shadow-[0_0_50px_rgba(0,255,0,0.5)] transform hover:-translate-y-1'
              }
            `}
          >
            {isExporting ? (
                <span className="animate-pulse">BURNING CARTRIDGE...</span>
            ) : !coverImage ? (
                "AWAITING COVER ART"
            ) : (
                "BURN CARTRIDGE (DOWNLOAD)"
            )}
          </button>
      </div>

    </div>
  );
};

export default TapeStudio;