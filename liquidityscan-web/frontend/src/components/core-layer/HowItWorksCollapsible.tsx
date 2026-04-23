import React, { useState } from 'react';

interface HowItWorksCollapsibleProps {
  /** Short explanation that fits the current page context. */
  body: React.ReactNode;
  /** Optional custom heading. Default: "How it works". */
  heading?: string;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Educational collapsible block — explains the Core-Layer concept in plain
 * prose for first-time visitors. One component shared across the overview,
 * variant, and pair-detail pages; the `body` prop carries page-specific copy.
 */
export const HowItWorksCollapsible: React.FC<HowItWorksCollapsibleProps> = ({
  body,
  heading = 'How it works',
  defaultOpen = false,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = React.useId();
  return (
    <section
      className={`rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/60 light:bg-white/70 backdrop-blur-sm overflow-hidden transition-colors ${
        open ? 'dark:border-primary/20' : ''
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors dark:hover:bg-white/[0.03] light:hover:bg-slate-50/80"
      >
        <span className="flex items-center gap-2.5 text-sm font-black dark:text-white light:text-slate-900 tracking-wide uppercase">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 border border-primary/30 text-primary">
            <span className="material-symbols-outlined text-[16px]">school</span>
          </span>
          {heading}
        </span>
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400">
          {open ? 'Hide' : 'Learn'}
          <span
            className={`material-symbols-outlined text-lg transition-transform duration-300 ${
              open ? 'rotate-180 text-primary' : 'dark:text-gray-400 light:text-slate-500'
            }`}
          >
            expand_more
          </span>
        </span>
      </button>
      <div
        id={panelId}
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <div className="px-4 pt-1 pb-4 text-sm leading-relaxed dark:text-gray-300 light:text-slate-600 border-t dark:border-white/5 light:border-slate-100">
            {body}
          </div>
        </div>
      </div>
    </section>
  );
};
