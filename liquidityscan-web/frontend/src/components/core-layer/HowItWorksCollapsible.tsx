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
      className={`rounded-2xl border dark:border-white/5 light:border-green-200/50 dark:bg-black/20 light:bg-white/70 backdrop-blur-sm overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors dark:hover:bg-white/5 light:hover:bg-green-50/60"
      >
        <span className="flex items-center gap-2 text-sm font-bold dark:text-white light:text-slate-900 tracking-wide">
          <span className="material-symbols-outlined text-primary text-[18px]">info</span>
          {heading}
        </span>
        <span
          className={`material-symbols-outlined text-lg dark:text-gray-400 light:text-slate-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="px-4 pb-4 text-sm leading-relaxed dark:text-gray-300 light:text-slate-600"
        >
          {body}
        </div>
      )}
    </section>
  );
};
