import React from 'react';

export const BackgroundEffects: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-slate-50 dark:bg-[#0a0a0a]">
      {/* Very subtle grid - light mode */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.08] bg-[length:64px_64px]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
          `,
        }}
      />
      {/* Dark mode grid */}
      <div
        className="absolute inset-0 opacity-0 dark:opacity-[0.06] bg-[length:64px_64px]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
        }}
      />

      {/* Single soft gradient - no orbs for calmer look */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] via-transparent to-transparent dark:from-emerald-500/[0.04]" />
    </div>
  );
};
