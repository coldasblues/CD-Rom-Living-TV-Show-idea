import React, { useState } from 'react';
import { CONTENT_THEMES } from '../constants';

interface GenesisWizardProps {
  onSubmit: (params: { name: string; desc: string; setting: string; themes: string[] }) => void;
  isProcessing: boolean;
}

const GenesisWizard: React.FC<GenesisWizardProps> = ({ onSubmit, isProcessing }) => {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [setting, setSetting] = useState("");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  const toggleTheme = (theme: string) => {
    if (selectedThemes.includes(theme)) setSelectedThemes(prev => prev.filter(t => t !== theme));
    else if (selectedThemes.length < 3) setSelectedThemes(prev => [...prev, theme]);
  };

  if (isProcessing) {
    return (
      <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-8 text-center font-mono">
        <div className="w-16 h-16 border-4 border-t-green-500 border-green-900 rounded-full animate-spin mb-6"></div>
        <h2 className="text-green-500 text-2xl tracking-widest animate-pulse">GENERATING PILOT EPISODE...</h2>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black/90 z-40 flex items-center justify-center overflow-y-auto p-4 font-mono">
      <div className="w-full max-w-2xl border border-green-900 bg-black p-6 shadow-[0_0_30px_rgba(0,50,0,0.3)]">
        <h1 className="text-2xl text-green-500 mb-6 uppercase tracking-widest border-b border-green-900 pb-2 text-glow">New Tape Initialization</h1>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-green-800 text-xs uppercase mb-1">Protagonist Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0a0a0a] border border-green-900/50 text-green-400 px-3 py-2 focus:border-green-500 focus:outline-none" placeholder="e.g. Detective Miller" /></div>
            <div><label className="block text-green-800 text-xs uppercase mb-1">Starting Location</label><input value={setting} onChange={(e) => setSetting(e.target.value)} className="w-full bg-[#0a0a0a] border border-green-900/50 text-green-400 px-3 py-2 focus:border-green-500 focus:outline-none" placeholder="e.g. A rainy alleyway" /></div>
          </div>
          <div><label className="block text-green-800 text-xs uppercase mb-1">Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full h-20 bg-[#0a0a0a] border border-green-900/50 text-green-400 px-3 py-2 resize-none focus:border-green-500 focus:outline-none" placeholder="Appearance, clothing..." /></div>
          <div>
            <label className="block text-green-800 text-xs uppercase mb-2">Select Themes (Max 3)</label>
            <div className="flex flex-wrap gap-2">{CONTENT_THEMES.map(theme => (
                <button key={theme} onClick={() => toggleTheme(theme)} className={`px-3 py-1 text-xs uppercase border transition-colors ${selectedThemes.includes(theme) ? 'bg-green-900 text-white border-green-500' : 'bg-black text-green-800 border-green-900/50 hover:border-green-500'}`}>{theme}</button>
            ))}</div>
          </div>
          <div className="pt-4 border-t border-green-900/50 flex justify-end">
            <button disabled={!name || !desc || !setting} onClick={() => onSubmit({ name, desc, setting, themes: selectedThemes })} className="px-8 py-3 bg-green-800 hover:bg-green-600 text-black font-bold uppercase tracking-widest disabled:opacity-50 transition-colors">Initialize System</button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default GenesisWizard;