import React from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { Strategies } from '../components/landing/Strategies';
import { Stats } from '../components/landing/Stats';
import { HowItWorks } from '../components/landing/HowItWorks';
import { Pricing } from '../components/landing/Pricing';
import { Footer } from '../components/landing/Footer';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Responsive Premium Background
const InstitutionalBackground = () => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-slate-50 dark:bg-[#06080A] transition-colors duration-500">
    {/* Subtle static grid for structure */}
    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(20,25,35,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(20,25,35,0.4)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />

    {/* Soft primary light spots */}
    <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-primary/10 dark:bg-primary/5 rounded-full blur-[150px] mix-blend-multiply dark:mix-blend-screen pointer-events-none" />
    <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-blue-500/10 dark:bg-blue-900/10 rounded-full blur-[200px] mix-blend-multiply dark:mix-blend-screen pointer-events-none" />
    
    {/* Micro Noise for texture */}
    <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015] mix-blend-overlay bg-[url('/noise.svg')]" />
  </div>
);

const SectionReveal = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.8, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <>
      <Helmet>
        <title>LiquidityScan | Algorithmic Crypto Analytics</title>
        <meta name="description" content="Advanced algorithmic scanner detecting Super Engulfing, Bias, RSI, and CRT signals in real-time." />
      </Helmet>

      <div className="min-h-screen text-slate-900 dark:text-white selection:bg-primary/30 font-sans overflow-x-hidden relative bg-slate-50 dark:bg-[#06080A] transition-colors duration-500">
        <InstitutionalBackground />

        <div className="relative z-10 w-full">
          <Navbar />
          
          <main className="w-full">
            <Hero />
            
            <SectionReveal>
              <Stats />
            </SectionReveal>
            
            <SectionReveal className="mt-20">
              <Features />
            </SectionReveal>
            
            <SectionReveal className="mt-20">
              <Strategies />
            </SectionReveal>
            
            <SectionReveal className="mt-20">
              <HowItWorks />
            </SectionReveal>
            
            <SectionReveal className="mt-20">
              <Pricing />
            </SectionReveal>
            
            {/* Massive Final CTA */}
            <SectionReveal className="py-40 relative overflow-hidden bg-white dark:bg-[#0A0D14] border-t border-slate-200 dark:border-[#1A1F2E] mt-32 transition-colors duration-500">
              <div className="absolute inset-0 bg-gradient-radial from-primary/5 dark:from-primary/10 to-transparent opacity-40 pointer-events-none" />
              
              <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
                <motion.div 
                   initial={{ scale: 0.9, opacity: 0 }}
                   whileInView={{ scale: 1, opacity: 1 }}
                   transition={{ duration: 0.5 }}
                   className="inline-block mb-6 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-sm font-mono tracking-widest text-primary uppercase"
                >
                  SYSTEM READY
                </motion.div>
                
                <h2 className="font-display text-5xl md:text-7xl lg:text-[90px] font-black mb-8 tracking-tighter leading-[0.9] text-slate-900 dark:text-white">
                  EXECUTE WITH <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-b from-slate-600 to-slate-400 dark:from-white dark:to-gray-500">
                    PRECISION.
                  </span>
                </h2>
                
                <p className="text-xl md:text-2xl text-slate-600 dark:text-gray-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
                  Join the smarter side of the market. Start acting on real-time algorithmic data today.
                  <br className="hidden md:block" />
                  No credit card required for trial.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Link to={isAuthenticated ? "/dashboard" : "/register"}>
                    <Button className="px-14 py-6 text-xl bg-slate-900 border-none hover:-translate-y-1 text-white dark:bg-white dark:text-black dark:hover:bg-gray-200 shadow-[0_0_40px_-10px_rgba(0,0,0,0.2)] dark:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all font-bold tracking-tight rounded-xl">
                      {isAuthenticated ? "Launch Terminal" : "Start 7-Day Free Trial"}
                    </Button>
                  </Link>
                </div>
              </div>
            </SectionReveal>
          </main>

          <Footer />
        </div>
      </div>
    </>
  );
};
