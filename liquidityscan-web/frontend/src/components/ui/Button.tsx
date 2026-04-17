import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', onClick }) => {
  const baseStyle = "relative px-8 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group";
  
  const variants = {
    primary: "bg-primary text-black hover:bg-[#34fa55] shadow-[0_0_20px_rgba(19,236,55,0.3)] hover:shadow-[0_0_30px_rgba(19,236,55,0.5)]",
    secondary: "bg-white/10 text-white hover:bg-white/20 border border-white/10 backdrop-blur-md",
    outline: "bg-transparent border border-primary/50 text-primary hover:bg-primary/10",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      onClick={onClick}
    >
      <span className="relative z-10">{children}</span>
      {variant === 'primary' && (
        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent z-0" />
      )}
    </motion.button>
  );
};
