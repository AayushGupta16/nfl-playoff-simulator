import React, { useState } from 'react';
import { clsx } from 'clsx';

interface Props {
    teamName: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const TeamLogo: React.FC<Props> = ({ teamName, className, size = 'md' }) => {
    const initials = teamName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const sizePx = {
        sm: 24,
        md: 32,
        lg: 48,
        xl: 64
    }[size];

    // Use ESPN ID directly if possible, but ESPN usually uses Abbr in URL. 
    // Since we don't have Abbr passed in prop easily without looking it up,
    // we'll try to use the logo prop passed from parent if available, 
    // OR assume the parent passes the logo URL directly?
    // WAIT: The component is generic. Let's assume `teamId` MIGHT be the abbreviation if we refactor?
    // No, let's stick to passing the `logoUrl` if possible. 
    // Redefine props to accept `logoUrl`.

    return (
        <div className={clsx("relative bg-white rounded-full flex items-center justify-center overflow-hidden shrink-0", className)} style={{ width: sizePx, height: sizePx }}>
            <span className="text-[10px] font-bold text-slate-400">{initials}</span>
        </div>
    );
};

// Re-export with URL support
export const TeamIcon: React.FC<{ url?: string, name: string, className?: string, size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ url, name, className, size = 'md' }) => {
    const [error, setError] = useState(false);
    
    const sizeClasses = {
        sm: "w-6 h-6",
        md: "w-8 h-8",
        lg: "w-12 h-12",
        xl: "w-16 h-16"
    }[size];

    if (!url || error) {
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return (
             <div className={clsx("bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xs border border-slate-200", sizeClasses, className)}>
                {initials}
            </div>
        );
    }

    return (
        <img 
            src={url} 
            alt={name} 
            className={clsx("object-contain", sizeClasses, className)}
            onError={() => setError(true)} 
            loading="lazy"
        />
    );
};

