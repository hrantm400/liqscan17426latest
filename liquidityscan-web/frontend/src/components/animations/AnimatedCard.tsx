import React from 'react';
import { motion } from 'framer-motion';
import { cardHoverVariants } from '../../utils/animations';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({ children, className = '', onClick }) => {
  return (
    <motion.div
      variants={cardHoverVariants}
      initial="rest"
      whileHover="hover"
      whileTap="pressed"
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
};
