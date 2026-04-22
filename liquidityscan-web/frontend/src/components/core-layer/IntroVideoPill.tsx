import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  INTRO_VIDEO_LS_KEY_BY_PAGE,
  INTRO_VIDEO_PILL_LABEL,
  INTRO_VIDEO_WISTIA_IDS,
  WISTIA_IFRAME_BASE,
} from '../../core-layer/constants';
import type { IntroVideoPageKey } from '../../core-layer/types';

export interface IntroVideoPillProps {
  pageKey: IntroVideoPageKey;
}

/**
 * "Watch intro" pill + Wistia modal player.
 *
 * - Renders NOTHING if the page's media ID env var is empty (no coming-soon
 *   state — keep the UI clean until a real video is uploaded).
 * - Two visual states, keyed off localStorage:
 *     - UNSEEN → ring + pulse, brighter border, attracts attention.
 *     - SEEN   → dim, no ring, stays available but fades into the header.
 *   The flag is set on first modal close. Once set, it never reverts. User
 *   can clear localStorage to reset.
 * - Modal is focus-trapped, `aria-modal="true"`, closed by Esc / X / backdrop.
 * - Wistia iframe autoplays muted (browser autoplay policy compliance); the
 *   user can unmute inside the player.
 * - Mobile (< 768px): icon-only via `hidden md:inline` on the label span.
 */
export const IntroVideoPill: React.FC<IntroVideoPillProps> = ({ pageKey }) => {
  const mediaId = INTRO_VIDEO_WISTIA_IDS[pageKey];
  const lsKey = INTRO_VIDEO_LS_KEY_BY_PAGE[pageKey];
  const label = INTRO_VIDEO_PILL_LABEL[pageKey];

  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(lsKey) === '1';
    } catch {
      return false;
    }
  });

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => {
    setOpen(false);
    if (!seen) {
      try {
        window.localStorage.setItem(lsKey, '1');
      } catch {
        /* localStorage unavailable — keep the unseen animation next load */
      }
      setSeen(true);
    }
  }, [lsKey, seen]);

  if (!mediaId) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Play Core-Layer ${pageKey} intro video`}
        className={[
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
          'text-[11px] font-bold tracking-wide border transition-all',
          seen
            ? 'dark:border-white/10 light:border-slate-200 dark:text-gray-400 light:text-slate-500 dark:bg-white/5 light:bg-slate-50 opacity-80 hover:opacity-100'
            : 'border-primary/40 text-primary bg-primary/10 ring-2 ring-primary/20 animate-pulse hover:animate-none hover:ring-primary/40',
        ].join(' ')}
      >
        <span className="material-symbols-outlined text-[14px] leading-none">
          play_circle
        </span>
        <span className="hidden md:inline">{label}</span>
      </button>

      <IntroVideoModal
        open={open}
        onClose={handleClose}
        mediaId={mediaId}
        pageKey={pageKey}
      />
    </>
  );
};

interface IntroVideoModalProps {
  open: boolean;
  onClose: () => void;
  mediaId: string;
  pageKey: IntroVideoPageKey;
}

const IntroVideoModal: React.FC<IntroVideoModalProps> = ({
  open,
  onClose,
  mediaId,
  pageKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const root = containerRef.current;
    const closeBtn = root?.querySelector<HTMLElement>('button[data-intro-close]');
    closeBtn?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && root) {
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"]), iframe',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  const iframeSrc = `${WISTIA_IFRAME_BASE}/${mediaId}?autoPlay=true&muted=true&playerColor=13ec37`;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Core-Layer ${pageKey} intro video`}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 dark:bg-black/80 light:bg-black/50 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-4xl dark:bg-[#0a140d]/95 light:bg-white/95 rounded-2xl border dark:border-primary/30 light:border-primary/40 shadow-[0_0_60px_rgba(19,236,55,0.18)] overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b dark:border-white/5 light:border-slate-200">
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-primary">
                Core-Layer · intro
              </span>
              <button
                type="button"
                data-intro-close
                onClick={onClose}
                className="p-1 rounded-md dark:text-gray-400 light:text-slate-500 dark:hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
                aria-label="Close intro video"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                src={iframeSrc}
                title="Core-Layer intro video"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
