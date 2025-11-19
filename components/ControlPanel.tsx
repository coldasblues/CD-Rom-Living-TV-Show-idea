import React from 'react';
import { Choice } from '../types';

interface Props {
  choices: Choice[];
  onChoose: (choiceId: string) => void;
  disabled: boolean;
}

const ControlPanel: React.FC<Props> = ({ choices, onChoose, disabled }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 w-full bg-[#0f0f0f]">
      {choices.map((choice, index) => (
        <button
          key={choice.id}
          disabled={disabled}
          onClick={() => onChoose(choice.id)}
          className={`
            relative group overflow-hidden border-2 
            ${disabled 
              ? 'border-gray-800 text-gray-600 cursor-not-allowed' 
              : 'border-green-900/50 text-green-500 hover:border-green-400 hover:text-green-400 cursor-pointer'
            }
            bg-black/40 px-4 py-4 transition-all duration-200 ease-out
            text-left font-mono text-lg uppercase tracking-wider
          `}
        >
            <span className="absolute top-0 left-0 bg-green-900/20 w-6 h-full flex items-center justify-center text-xs border-r border-green-900/30">
                {index + 1}
            </span>
            <span className="pl-8 block">{choice.text}</span>
            
            {/* Retro hover glow effect */}
            {!disabled && (
                <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            )}
        </button>
      ))}
      
      {choices.length === 0 && (
        <div className="col-span-2 flex items-center justify-center h-24 border-2 border-dashed border-gray-800 text-gray-700">
          WAITING FOR TAPE...
        </div>
      )}
    </div>
  );
};

export default ControlPanel;