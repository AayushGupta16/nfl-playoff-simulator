import React, { useEffect, useState } from 'react';

const NFL_TEAMS = [
    { id: 'BUF', color: '#00338D' }, { id: 'MIA', color: '#008E97' }, { id: 'NE', color: '#002244' }, { id: 'NYJ', color: '#125740' },
    { id: 'BAL', color: '#241773' }, { id: 'CIN', color: '#FB4F14' }, { id: 'CLE', color: '#311D00' }, { id: 'PIT', color: '#FFB612' },
    { id: 'HOU', color: '#03202F' }, { id: 'IND', color: '#002C5F' }, { id: 'JAX', color: '#006778' }, { id: 'TEN', color: '#4B92DB' },
    { id: 'DEN', color: '#FB4F14' }, { id: 'KC', color: '#E31837' }, { id: 'LV', color: '#000000' }, { id: 'LAC', color: '#0080C6' },
    { id: 'DAL', color: '#003594' }, { id: 'NYG', color: '#0B2265' }, { id: 'PHI', color: '#004C54' }, { id: 'WSH', color: '#5A1414' },
    { id: 'CHI', color: '#0B162A' }, { id: 'DET', color: '#0076B6' }, { id: 'GB', color: '#203731' }, { id: 'MIN', color: '#4F2683' },
    { id: 'ATL', color: '#A71930' }, { id: 'CAR', color: '#0085CA' }, { id: 'NO', color: '#D3BC8D' }, { id: 'TB', color: '#D50A0A' },
    { id: 'ARI', color: '#97233F' }, { id: 'LAR', color: '#003594' }, { id: 'SF', color: '#AA0000' }, { id: 'SEA', color: '#002244' }
];

export const LoadingThrobber: React.FC = () => {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % NFL_TEAMS.length);
        }, 150); // Switch every 150ms for a quick shuffle effect
        return () => clearInterval(interval);
    }, []);

    const currentTeam = NFL_TEAMS[activeIndex];

    return (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative w-24 h-24 flex items-center justify-center">
                {/* Animated ring with current team color */}
                <div 
                    className="absolute inset-0 rounded-full opacity-20 animate-ping"
                    style={{ backgroundColor: currentTeam.color }}
                />
                <div 
                    className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
                    style={{ borderColor: `${currentTeam.color} transparent ${currentTeam.color} ${currentTeam.color}` }}
                />
                
                {/* Centered Logo (using ESPN CDN) */}
                <div className="relative z-10 bg-white rounded-full p-2 shadow-sm">
                    <img 
                        src={`https://a.espncdn.com/i/teamlogos/nfl/500/${currentTeam.id}.png`} 
                        alt="Loading..." 
                        className="w-12 h-12 object-contain transition-all duration-300 transform scale-100"
                    />
                </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
                <p className="text-lg font-bold text-slate-700 animate-pulse">
                    Simulating Season...
                </p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    Crunching 5,000+ Possibilities
                </p>
            </div>
        </div>
    );
};

