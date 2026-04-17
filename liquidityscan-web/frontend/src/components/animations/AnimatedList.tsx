import React from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, listItemVariants } from '../../utils/animations';

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={listItemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
};
