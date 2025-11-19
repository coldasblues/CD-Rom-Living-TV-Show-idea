import React, { useState, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import CRTContainer from '../components/CRTContainer';
import { readTapeData } from '../utils/tapeUtils';
import { TapeFileSchema } from '../types';
import { getLibrary, saveTapeToLibrary, deleteTapeFromLibrary, StoredTape } from '../services/storageService';

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [library, setLibrary] = useState<StoredTape[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load API Key
    const storedKey = localStorage.getItem('GEMINI_API_KEY');
    if (storedKey) setApiKey(storedKey);

    // Load Library from IDB
    const loadLib = async () => {
      try {
        const tapes = await getLibrary();
        setLibrary(tapes);
      } catch (e) {
        console.error("Failed to load library", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadLib();
  }, []);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('GEMINI_API_KEY', val);
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
    setError(null);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'image/png');
    
    if (files.length === 0) {
        setError("Only PNG tapes accepted.");
        return;
    }

    for (const file of files) {
      try {
        const { state: rawData, imgUrl } = await readTapeData(file);
        
        let normalizedData: TapeFileSchema;
        if ('engineState' in rawData) {
          normalizedData = rawData as TapeFileSchema;
        } else {
          normalizedData = {
            meta: { version: "0.0", characterName: "Unknown" },
            engineState: rawData
          };
        }
        
        // Convert blob URL back to base64 for storage (since blob urls expire)
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            
            const newTape: StoredTape = {
                id: `tape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                characterName: normalizedData.meta.characterName || "Unknown",
                timestamp: Date.now(),
                imgBase64: base64,
                data: normalizedData
            };

            await saveTapeToLibrary(newTape);
            setLibrary(prev => [newTape, ...prev]);
        };

      } catch (err) {
        console.error("Failed to read tape", file.name, err);
        setError("Corrupt or invalid tape data.");
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

  return (
    <div className="min-h-screen w-full bg-[#050505]" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <CRTContainer>
        <div className="flex flex-col h-full w-full p-6 relative">
          
          {/* Header */}
          <div className="border-b-2 border-green-900 pb-4 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-4xl text-green-500 font-bold tracking-widest text-glow">VIDEO RENTAL</h1>
              <p className="text-green-800 text-sm uppercase">Est. 1985 • Open 24 Hours</p>
            </div>
            <div className="text-right flex flex-col items-end">
               <div className="flex items-center gap-2 mb-1">
                 <div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-green-500 shadow-[0_0_5px_lime]' : 'bg-red-500 animate-pulse'}`}></div>
                 <span className="text-green-900 text-xs uppercase">{apiKey ? 'MEMBERSHIP ACTIVE' : 'NO CARD INSERTED'}</span>
               </div>
              <input 
                type="password" 
                value={apiKey}
                onChange={handleKeyChange}
                placeholder="ENTER GEMINI API KEY"
                className="bg-black border border-green-900 text-green-500 px-2 py-1 text-xs w-48 focus:outline-none focus:border-green-500 text-right placeholder-green-900"
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-grow overflow-hidden flex flex-col">
            
            {/* Drop Zone / Shelf */}
            {isLoading ? (
                <div className="flex-grow flex items-center justify-center text-green-800 animate-pulse">LOADING INVENTORY...</div>
            ) : library.length === 0 ? (
              <div className={`flex-grow border-4 border-dashed ${isDragging ? 'border-green-400 bg-green-900/20' : 'border-green-900/30'} rounded-lg flex flex-col items-center justify-center transition-colors duration-300 group cursor-pointer`} onClick={playNew}>
                <div className="text-6xl mb-4 opacity-50 group-hover:scale-110 transition-transform">📼</div>
                <p className="text-green-600 text-xl tracking-widest">DROP TAPE CARDS HERE</p>
                <p className="text-green-900 text-sm mt-2">or click to start fresh recording</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 overflow-y-auto p-2 h-full pb-20 pr-2">
                {/* New Tape Button */}
                <button onClick={playNew} className="aspect-[3/4] border-2 border-green-900 border-dashed hover:border-green-500 flex flex-col items-center justify-center group transition-all bg-black/20">
                  <span className="text-4xl mb-2 group-hover:scale-110 transition-transform text-green-700">+</span>
                  <span className="text-green-700 text-sm uppercase tracking-widest group-hover:text-green-400">New Recording</span>
                </button>

                {/* Loaded Tapes */}
                {library.map((tape) => (
                  <div key={tape.id} onClick={() => playTape(tape)} className="relative aspect-[3/4] bg-black border border-gray-800 hover:border-green-400 cursor-pointer group transition-all shadow-lg overflow-hidden rounded-sm">
                    <div className="absolute inset-0 bg-gray-900">
                      <img src={`data:image/png;base64,${tape.imgBase64}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity mix-blend-overlay grayscale group-hover:grayscale-0" alt="Tape" />
                    </div>
                    
                    {/* Tape Label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/90 p-3 border-t border-gray-800">
                      <p className="text-green-500 text-lg font-bold truncate font-mono">{tape.characterName}</p>
                      <div className="flex justify-between items-center mt-1">
                         <p className="text-gray-500 text-[10px] uppercase tracking-wider truncate">
                            {new Date(tape.timestamp).toLocaleDateString()}
                         </p>
                         <button 
                            onClick={(e) => deleteTape(e, tape.id)}
                            className="text-gray-700 hover:text-red-500 text-[10px] uppercase hover:underline"
                         >
                            Erase
                         </button>
                      </div>
                    </div>
                    
                    {/* Sticker Effect */}
                    <div className="absolute top-3 right-3 bg-yellow-600 text-black text-[10px] font-bold px-2 py-0.5 -rotate-2 shadow-md border border-yellow-500 opacity-80">
                       BE KIND REWIND
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* Status Footer */}
          <div className="mt-4 pt-2 border-t border-gray-900 text-gray-600 text-xs flex justify-between font-mono">
            <span>INVENTORY: {library.length} ITEMS</span>
            {error && <span className="text-red-500 blink font-bold">{error}</span>}
            <span className="animate-pulse">SYSTEM READY</span>
          </div>
          
          {isDragging && library.length > 0 && (
             <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center border-4 border-green-500 border-dashed m-4">
                <p className="text-green-500 text-2xl tracking-widest animate-pulse">ADD TO SHELF</p>
             </div>
          )}

        </div>
      </CRTContainer>
    </div>
  );
};

export default Lobby;