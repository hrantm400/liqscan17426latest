import React from 'react';

/**
 * Tiny "PRO" label pill, sized for inline placement next to a 10px uppercase
 * section heading (e.g. the Core-Layer sidebar group label). Visually matches
 * the `active` variant of `SubscriptionBadge` but without the subscription
 * plumbing — use this when you need a literal "PRO" marker on a UI element,
 * not a reflection of the user's current subscription state.
 */
export const ProLabelPill: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded border bg-primary/20 text-primary border-primary/30 text-[9px] font-bold uppercase tracking-wider leading-none ${className}`}
  >
    PRO
  </span>
);
