import React from 'react';
import { Play, Loader2, Settings2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  count: number;
  setCount: (count: number) => void;
  onRun: (simCount: number) => void;
  isLoading: boolean;
}

export const SimulationConfig: React.FC<Props> = ({ count, setCount, onRun, isLoading }) => {
  
  // Handle text change manually to allow commas and prevent non-numeric/negative input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Replace anything that is NOT a digit (0-9) with empty string
      // This effectively removes commas, spaces, dashes (negatives), and letters
      const val = e.target.value.replace(/\D/g, '');
      
      if (val === '') {
          setCount(0);
          return;
      }
      
      const num = parseInt(val, 10);
      if (!isNaN(num)) {
          // Clamp to reasonable max if needed, or just ensure positive (already handled by regex)
          setCount(num);
      }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                <Settings2 className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-semibold text-slate-900">Simulation Control</h3>
                <p className="text-sm text-slate-500">Configure Monte Carlo iterations</p>
            </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="relative flex-1 sm:flex-none">
                <input
                    type="text"
                    value={count?.toLocaleString() ?? ''}
                    onChange={handleInputChange}
                    className="peer p-2.5 pl-3 pr-12 w-full sm:w-32 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-right font-mono"
                    placeholder="10,000"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium pointer-events-none">
                    SIMS
                </span>
            </div>

            <button
                onClick={() => onRun(count)}
                disabled={isLoading}
                className={clsx(
                    "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all shadow-sm active:scale-95",
                    isLoading 
                        ? "bg-slate-400 cursor-not-allowed" 
                        : "bg-blue-600 hover:bg-blue-700 hover:shadow-md hover:ring-2 ring-blue-500/20"
                )}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <Play className="w-4 h-4 fill-current" />
                        Run Sim
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};
