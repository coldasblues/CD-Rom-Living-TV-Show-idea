import React from 'react';

interface Props {
  text: string | undefined;
  stage: string;
}

const NarrativeLog: React.FC<Props> = ({ text, stage }) => {
  return (
    <div className="w-full bg-black p-4 border-b border-gray-800 min-h-[100px]">
      <div className="flex justify-between items-end mb-2 border-b border-gray-800 pb-1">
        <h3 className="text-gray-500 text-xs uppercase tracking-widest">Narrative Log</h3>
        <span className="text-green-800 text-xs animate-pulse">{stage}</span>
      </div>
      <p className="text-green-400 text-xl leading-relaxed text-glow font-medium h-full">
        {text || "Initialize the tape loop to begin transmission..."}
      </p>
    </div>
  );
};

export default NarrativeLog;