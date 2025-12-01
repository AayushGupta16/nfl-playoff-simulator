import React from 'react';
import { BookOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

interface Props {
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">NFL Playoff Machine</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">Open-source NFL playoff simulator</p>
            </div>
          </Link>
          
          <div className="flex items-center gap-4 text-sm">
            
            <Link 
                to="/methodology" 
                className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                    location.pathname === '/methodology' 
                        ? "text-blue-600 bg-blue-50" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
            >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Methodology</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
};
