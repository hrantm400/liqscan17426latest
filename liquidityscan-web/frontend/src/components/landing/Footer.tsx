import React from 'react';
import { Link } from 'react-router-dom';
import { Twitter, Github, Disc } from 'lucide-react';
import { AnimatedLogo } from '../shared/AnimatedLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#06080A] border-t border-[#1A1F2E] py-16">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
             <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#0A0D14] border border-[#1A1F2E] flex items-center justify-center p-1">
                <AnimatedLogo className="w-full h-full" />
              </div>
              <span className="font-display font-bold text-xl text-white tracking-tight">
                Liquidity<span className="text-gray-500">Scan</span>
              </span>
            </div>
            <p className="text-gray-500 max-w-sm mb-8 font-light leading-relaxed">
              Institutional-grade market intelligence. We provide the algorithmic edge previously reserved for top-tier funds.
            </p>
            <div className="flex gap-4">
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#0A0D14] border border-[#1A1F2E] flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/50 transition-all"><Twitter className="w-4 h-4" /></a>
              <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#0A0D14] border border-[#1A1F2E] flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/50 transition-all"><Disc className="w-4 h-4" /></a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#0A0D14] border border-[#1A1F2E] flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary/50 transition-all"><Github className="w-4 h-4" /></a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-white mb-6 font-display">Platform</h4>
            <ul className="space-y-4 text-gray-500 text-sm">
              <li><a href="#features" className="hover:text-primary transition-colors">Infrastructure</a></li>
              <li><a href="#pricing" className="hover:text-primary transition-colors">Pricing</a></li>
              <li><a href="#strategies" className="hover:text-primary transition-colors">Algorithms</a></li>
              <li><Link to="/dashboard" className="hover:text-primary transition-colors">Terminal</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-6 font-display">Legal</h4>
            <ul className="space-y-4 text-gray-500 text-sm">
              <li><Link to="/support" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/support" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link to="/support" className="hover:text-primary transition-colors">Disclaimer</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#1A1F2E] pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-600 font-mono text-center md:text-left">
          <p>&copy; {new Date().getFullYear()} Liquidity Scan. All rights reserved.</p>
          <p className="mt-4 md:mt-0">Trading involves significant risk. Invest responsibly.</p>
        </div>
      </div>
    </footer>
  );
};
