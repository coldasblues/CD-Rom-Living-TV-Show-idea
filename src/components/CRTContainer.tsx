import React from 'react';

interface Props {
  children: React.ReactNode;
}

const CRTContainer: React.FC<Props> = ({ children }) => {
  return (
    <div className="relative h-screen w-full bg-gray-900 text-green-500 overflow-hidden flex items-center justify-center p-2 md:p-4">
      {/* TV Frame Border - Constrained to max-h-screen to ensure fit */}
      <div className="relative w-full max-w-5xl h-full max-h-[95vh] bg-black rounded-[20px] p-4 md:p-8 shadow-[0_0_0_10px_#1a1a1a,0_0_50px_rgba(0,0,0,0.8)] border-4 border-gray-800 flex flex-col">
        
        {/* Screen Content - Flex Grow to fill available space */}
        <div className="relative bg-[#0a0a0a] rounded-[10px] overflow-hidden border border-gray-700 shadow-[inset_0_0_80px_rgba(0,0,0,0.9)] flex-grow flex flex-col">
          {/* Scrollable Area Wrapper */}
          <div className="absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-black p-6 pb-24">
             {children}
          </div>
          
          {/* CRT Overlays (Pointer events none to allow clicking through) */}
          <div className="scanlines absolute inset-0 z-30 opacity-20 pointer-events-none h-full w-full"></div>
          <div className="absolute inset-0 z-40 pointer-events-none bg-gradient-to-br from-white/5 to-transparent opacity-10 rounded-[10px]"></div>
          <div className="absolute inset-0 z-40 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.7)] rounded-[10px]"></div>
        </div>

        {/* TV Brand / Hardware details */}
        <div className="mt-2 text-center text-gray-600 text-[10px] tracking-[0.3em] font-sans opacity-50 uppercase">
          Gemini-Veo Sys • Model 1999
        </div>
      </div>
    </div>
  );
};

export default CRTContainer;