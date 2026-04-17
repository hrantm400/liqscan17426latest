import { Variants } from 'framer-motion';

// Page transition variants
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

// Stagger container for list items
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// List item variants
export const listItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

// Card hover variants
export const cardHoverVariants: Variants = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: '0 0 0 rgba(19, 236, 55, 0)',
  },
  hover: {
    scale: 1.02,
    y: -4,
    boxShadow: '0 10px 30px rgba(19, 236, 55, 0.15)',
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};

// Button press variants
export const buttonPressVariants: Variants = {
  rest: {
    scale: 1,
  },
  pressed: {
    scale: 0.95,
    transition: {
      duration: 0.1,
    },
  },
};

// Fade in variants
export const fadeInVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
};

// Slide in from right
export const slideInRightVariants: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
};

// Scale in variants
export const scaleInVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
};

// Pulse animation for live indicators
export const pulseVariants: Variants = {
  animate: {
    scale: [1, 1.1, 1],
    opacity: [1, 0.7, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Flash animation for updates
export const flashVariants: Variants = {
  flash: {
    backgroundColor: ['rgba(19, 236, 55, 0.1)', 'rgba(19, 236, 55, 0.3)', 'rgba(19, 236, 55, 0.1)'],
    transition: {
      duration: 0.5,
      ease: 'easeInOut',
    },
  },
};

// Subscription card entrance (spring)
export const cardEnterSpring = {
  initial: { opacity: 0, y: 50, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 120, damping: 20 },
  },
};

// Table row stagger for feature comparison
export const tableRowStagger: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};
export const tableRowItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};
