import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CRTContainer from '../components/CRTContainer';
import { createTapeBlob } from '../utils/tapeUtils';
import { TapeFileSchema, Choice } from '../types';
import { ANIMATION_STYLES, DEFAULT_NARRATIVE_INSTRUCTION, DEFAULT_VIDEO_TEMPLATE, COVER_ART_TAGS } from '../constants';
import { generateFalImage } from '../services/falService'; // NEW IMPORT
import { getSettings } from '../services/storageService'; // NEW IMPORT

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
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
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
      reader.onloadend = () => setCoverImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateCover = async () => {
      const settings = await getSettings();
      if (!settings.falKey) {
          alert("Please add a Fal.ai Key in the SYSTEM tab to use the generator.");
          return;
      }
      
      // Default prompt if empty
      const finalPrompt = coverPrompt || `A retro VHS cover art for a show called "${title}". ${visualStyle} style, masterpiece, best quality.`;
      
      setIsGeneratingCover(true);
      try {
          // 1. Generate URL
          const imgUrl = await generateFalImage(finalPrompt, settings.falKey);
          
          // 2. Convert to Base64
          const res = await fetch(imgUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => setCoverImage(reader.result as string);
          reader.readAsDataURL(blob);
          
      } catch (e: any) {
          alert("Generation Failed: " + e.message);
      } finally {
          setIsGeneratingCover(false);
      }
  };

  const handleExport = async () => {
    if (!coverImage) {
      alert("Please upload or generate a cover image for your tape!");
      return;
    }

    const res = await fetch(coverImage);
    const blob = await res.blob();

    const tapeData: TapeFileSchema = {
      meta: {
        version: "2.1",
        characterName: title,
        createdAt: new Date().toISOString(),
        visualStyle: visualStyle, 
        author: author,
        gameRules: customRules || "Standard adventure rules apply.",
        systemInstruction: systemInstruction,
        videoPromptTemplate: videoTemplate
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

    const finalTape = await createTapeBlob(blob, tapeData);
    const url = URL.createObjectURL(finalTape);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_MASTER.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full bg-[#050505]">
      <CRTContainer>
        <div className="h-full w-full overflow-y-auto p-6 pb-24 font-mono">
          <div className="flex justify-between items-end border-b-2 border-green-900 pb-4 mb-6">
            <div>
              <h1 className="text-4xl text-green-500 font-bold tracking-widest text-glow">TAPE STUDIO</h1>
              <p className="text-green-800 text-sm uppercase">Cartridge Authoring Tool v1.2</p>
            </div>
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-green-500 uppercase tracking-wider">[ EXIT TO LOBBY ]</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* 1. Info */}
              <div className="bg-black/50 p-4 border border-green-900/50">
                <h2 className="text-green-400 mb-4 uppercase text-sm font-bold border-b border-green-900/30 pb-1">1. Cartridge Info</h2>
                <div className="space-y-3">
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-black border border-green-900 text-green-500 px-2 py-1 text-sm focus:outline-none focus:border-green-400" placeholder="Title" />
                  <input value={author} onChange={e => setAuthor(e.target.value)} className="w-full bg-black border border-green-900 text-green-500 px-2 py-1 text-sm focus:outline-none focus:border-green-400" placeholder="Author" />
                  <select value={visualStyle} onChange={e => setVisualStyle(e.target.value)} className="w-full bg-black border border-green-900 text-green-500 px-2 py-1 text-sm uppercase focus:outline-none focus:border-green-400">
                       {Object.keys(ANIMATION_STYLES).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              {/* 2. Core Logic */}
              <div className="bg-black/50 p-4 border border-green-900/50">
                <h2 className="text-green-400 text-sm uppercase mb-2 font-bold border-b border-green-900/30 pb-1">2. Core Game Rules</h2>
                <textarea value={customRules} onChange={e => setCustomRules(e.target.value)} placeholder="// Define game mechanics (Health, Inventory, Tone)..." className="w-full h-40 bg-[#0a0a0a] border border-green-900 text-green-400 px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:border-green-400" />
              </div>

              {/* 3. Advanced Prompt Engineering */}
              <div className="bg-black/50 border border-green-900/50">
                <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full p-4 flex justify-between items-center text-green-400 hover:bg-green-900/20 transition-colors">
                    <span className="text-sm uppercase font-bold">3. Prompt Engineer Mode</span>
                    <span>{showAdvanced ? '▼' : '▶'}</span>
                </button>
                
                {showAdvanced && (
                    <div className="p-4 pt-0 border-t border-green-900/30 space-y-4">
                        <div>
                            <label className="text-[10px] text-green-800 uppercase block mb-1">Narrative Persona (System Prompt)</label>
                            <textarea 
                                value={systemInstruction} 
                                onChange={e => setSystemInstruction(e.target.value)} 
                                className="w-full h-32 bg-[#050505] border border-green-900/50 text-green-600 px-2 py-1 font-mono text-[10px] resize-none focus:outline-none focus:border-green-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-green-800 uppercase block mb-1">Video Generation Template</label>
                            <textarea 
                                value={videoTemplate} 
                                onChange={e => setVideoTemplate(e.target.value)} 
                                className="w-full h-24 bg-[#050505] border border-green-900/50 text-green-600 px-2 py-1 font-mono text-[10px] resize-none focus:outline-none focus:border-green-400"
                            />
                        </div>
                    </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* 4. The Hook */}
              <div className="bg-black/50 p-4 border border-green-900/50">
                <h2 className="text-green-400 mb-4 uppercase text-sm font-bold border-b border-green-900/30 pb-1">4. The Hook</h2>
                <div className="space-y-4">
                    <textarea value={introNarrative} onChange={e => setIntroNarrative(e.target.value)} className="w-full h-16 bg-black border border-green-900 text-green-500 px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-400" placeholder="Intro Narrative..." />
                    <textarea value={visualPrompt} onChange={e => setVisualPrompt(e.target.value)} className="w-full h-24 bg-black border border-green-900 text-green-500 px-3 py-2 mb-2 text-sm resize-none focus:outline-none focus:border-green-400" placeholder="Visual Description..." />
                    <div className="flex flex-wrap gap-2">{VISUAL_TAGS.map(tag => <button key={tag} onClick={() => addVisualTag(tag)} className="text-[10px] border border-green-900/50 text-gray-400 px-2 py-1 bg-black hover:text-green-400 hover:border-green-400">+ {tag}</button>)}</div>
                </div>
              </div>

              {/* 5. Choices */}
              <div className="bg-black/50 p-4 border border-green-900/50">
                <div className="flex justify-between mb-2 border-b border-green-900/30 pb-1">
                  <h2 className="text-green-400 text-sm uppercase font-bold">5. Choices</h2>
                  <button onClick={addChoice} className="text-[10px] bg-green-900 text-black px-2 py-1 font-bold hover:bg-green-600">+ ADD</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {choices.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-green-800 text-xs">{i + 1}.</span>
                      <input value={c.text} onChange={e => updateChoice(i, e.target.value)} className="bg-transparent border-b border-green-900 text-green-500 w-full text-sm focus:outline-none focus:border-green-400" />
                      <button onClick={() => removeChoice(i)} className="text-red-900 hover:text-red-500 text-xs px-2">X</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. Cover Art Studio (NEW) */}
              <div className="bg-black/50 p-4 border border-green-900/50">
                <h2 className="text-green-400 mb-4 uppercase text-sm font-bold border-b border-green-900/30 pb-1">6. Cover Art Studio</h2>
                
                <div className="mb-3">
                    <textarea 
                        value={coverPrompt} 
                        onChange={e => setCoverPrompt(e.target.value)} 
                        placeholder={`Prompt for cover art... (e.g. "A mysterious door in the woods, ${visualStyle}, 8k")`}
                        className="w-full h-20 bg-[#0a0a0a] border border-green-900 text-green-500 px-3 py-2 text-xs resize-none focus:outline-none focus:border-green-400" 
                    />
                </div>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {COVER_ART_TAGS.map(tag => (
                        <button 
                            key={tag} 
                            onClick={() => addCoverTag(tag)}
                            className="text-[9px] border border-green-900/50 text-gray-500 px-2 py-1 bg-black hover:text-green-400 hover:border-green-400 transition-colors uppercase"
                        >
                            + {tag}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={handleGenerateCover}
                    disabled={isGeneratingCover}
                    className="w-full py-2 bg-green-900/30 border border-green-500/30 text-green-400 text-xs uppercase tracking-widest hover:bg-green-900/60 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isGeneratingCover ? (
                        <>
                           <span className="animate-spin w-3 h-3 border-2 border-t-transparent border-green-400 rounded-full"></span>
                           GENERATING...
                        </>
                    ) : (
                        "GENERATE AI COVER"
                    )}
                </button>
              </div>

              {/* Export Box */}
              <div className="border-2 border-dashed border-green-900/50 p-6 flex items-center gap-6 cursor-pointer hover:bg-green-900/10 transition-colors group" onClick={() => fileInputRef.current?.click()}>
                 <div className="w-24 h-32 bg-black border border-green-800 flex items-center justify-center overflow-hidden relative shadow-[0_0_15px_rgba(0,50,0,0.5)]">
                   {coverImage ? <img src={coverImage} className="w-full h-full object-cover" /> : <span className="text-2xl text-green-900 group-hover:text-green-500">+</span>}
                 </div>
                 <div>
                   <h3 className="text-green-500 text-lg tracking-widest uppercase group-hover:text-green-400">CREATE MASTER TAPE</h3>
                   <p className="text-xs text-gray-500 mt-1">Compile Logic, Metadata, and Scenes into a PNG Cartridge.</p>
                 </div>
                 <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/png,image/jpeg" />
              </div>
            </div>
          </div>
        </div>
      </CRTContainer>
    </div>
  );
};

export default TapeStudio;