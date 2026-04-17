import React from 'react';
import { Signal } from '../../types';

interface SignalBadgeProps {
  signal: Signal;
  variant?: 'default' | 'compact' | 'numeric';
}

export const SignalBadge: React.FC<SignalBadgeProps> = ({ signal, variant = 'default' }) => {
  const confidence = signal.metadata?.confidence || 'MED';
  
  // Numeric variant for Signal Details page
  if (variant === 'numeric') {
    const confidenceValue = confidence === 'HIGH' ? 85 : confidence === 'MED' ? 65 : 45;
    return (
      <span className="text-3xl font-bold font-mono dark:text-white light:text-text-dark">
        {confidenceValue}%
      </span>
    );
  }
  
  if (confidence === 'HIGH') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase ${variant === 'compact' ? 'text-[9px] px-1.5 py-0.5' : ''}`}>
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
        Premium
      </span>
    );
  }
  
  if (confidence === 'MED') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 uppercase ${variant === 'compact' ? 'text-[9px] px-1.5 py-0.5' : ''}`}>
        Standard
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 dark:text-gray-500 light:text-slate-500 border border-gray-500/20 uppercase ${variant === 'compact' ? 'text-[9px] px-1.5 py-0.5' : ''}`}>
      Basic
    </span>
  );
};
