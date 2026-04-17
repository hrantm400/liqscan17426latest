import React from 'react';
import { Helmet } from 'react-helmet-async';
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

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <>
      <Helmet>
        <title>Liquidity Scanner | Detect Unseen Moves</title>
        <meta name="description" content="Institutional-grade liquidity scanner for crypto trading. Real-time pattern detection, 78% win rate, 300+ pairs monitored 24/7." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@500;700;900&display=swap" rel="stylesheet" />
      </Helmet>

      <div className="min-h-screen bg-background text-white selection:bg-primary/30 font-sans overflow-x-hidden">
        {/* Noise texture overlay */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%221%22/%3E%3C/svg%3E')] opacity-[0.05]"></div>
        </div>

        <Navbar />
        
        <main className="relative z-10">
          <Hero />
          <Stats />
          <Features />
          <Strategies />
          <HowItWorks />
          <Pricing />
          
          {/* Final CTA */}
          <section className="py-32 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial from-primary/10 to-transparent opacity-50 pointer-events-none" />
            <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
              <h2 className="font-display text-5xl md:text-7xl font-bold mb-8 tracking-tight">
                Stop Guessing. <br />
                <span className="text-primary text-glow">Start Printing.</span>
              </h2>
              <p className="text-xl dark:text-gray-400 light:text-slate-500 mb-10 max-w-2xl mx-auto">
                Join 10,000+ traders who have upgraded their edge. No credit card required for the 7-day trial.
              </p>
              <div className="flex justify-center">
                <Link to={isAuthenticated ? "/dashboard" : "/register"}>
                  <Button className="px-12 py-5 text-xl font-display font-bold">
                    {isAuthenticated ? "Launch Terminal" : "Get Started Now"}
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-sm dark:text-gray-500 light:text-slate-500 font-mono">
                Limited spots available for current beta cohort.
              </p>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};
