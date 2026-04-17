import React from 'react';
import './NeonLoader.css';

interface NeonLoaderProps {
  className?: string;
}

export const NeonLoader: React.FC<NeonLoaderProps> = ({ className = '' }) => {
  return (
    <div className={`crypto-loader ${className}`}>
        <div className="candle bullish"></div>
        <div className="candle bearish"></div>
        <div className="candle bullish"></div>
        <div className="candle bearish"></div>
        <div className="candle bullish"></div>
    </div>
  );
};
