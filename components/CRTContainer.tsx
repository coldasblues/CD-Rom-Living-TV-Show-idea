import React from 'react';

interface Props {
  children: React.ReactNode;
}

const CRTContainer: React.FC<Props> = ({ children }) => {
  return (
    <div className="relative min-h-screen w-full bg-gray-900 text-green-500 overflow-hidden flex items-center justify-center p-4">
      {/* TV Frame Border */}
      <div className="relative w-full max-w-4xl bg-black rounded-[30px] p-8 shadow-[0_0_0_10px_#1a1a1a,0_0_50px_rgba(0,0,0,0.8)] border-4 border-gray-800">
        
        {/* Screen Content */}
        <div className="relative bg-[#0a0a0a] rounded-[10px] overflow-hidden border border-gray-700 shadow-[inset_0_0_80px_rgba(0,0,0,0.9)] min-h-[600px] flex flex-col">
          {children}
          
          {/* CRT Overlays */}
          <div className="scanlines absolute inset-0 z-30 opacity-20 pointer-events-none h-full w-full"></div>
          <div className="absolute inset-0 z-40 pointer-events-none bg-gradient-to-br from-white/5 to-transparent opacity-10 rounded-[10px]"></div>
          <div className="absolute inset-0 z-40 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.7)] rounded-[10px]"></div>
        </div>

        {/* TV Brand / Hardware details */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-gray-600 text-xs tracking-[0.3em] font-sans opacity-50">
          GEMINI-VEO SYS
        </div>
      </div>
    </div>
  );
};

export default CRTContainer;