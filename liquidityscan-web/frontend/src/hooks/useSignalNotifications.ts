import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/notificationStore';
import { Signal } from '../types';

// Web Audio API context for generating a satisfying "ding" sound
let audioCtx: AudioContext | null = null;

const playPopsSound = () => {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'sine';
        
        // Gentle modern "ping"
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.log('Audio play failed', e);
    }
};

const triggerPushNotification = (signal: Signal) => {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        const title = `New ${signal.strategyType} Signal`;
        const dir = signal.signalType === 'BUY' ? '🟢 LONG' : '🔴 SHORT';
        const body = `${signal.symbol} on ${signal.timeframe} at ${signal.price ? '$'+signal.price.toFixed(4) : ''}\n${dir}`;
        
        new Notification(title, {
            body,
            icon: '/favicon.ico'
        });
    }
};

export function useSignalNotifications(signals: Signal[]) {
    const { soundEnabled, pushEnabled, addNotification } = useNotificationStore();
    
    // Keep track of signal IDs we have already seen to avoid duplicate notifications
    const seenSignalIds = useRef<Set<string>>(new Set());
    const isInitialLoad = useRef(true);
    // Track the first TWO data loads as "initial" to avoid false positives
    // (first load might be cached/placeholder data, second is fresh)
    const loadCount = useRef(0);

    useEffect(() => {
        if (!signals || signals.length === 0) {
            return;
        }

        loadCount.current += 1;

        // First 2 loads: just populate the seen set without notifying
        // This prevents the "ding" sound when navigating to a new monitor page
        if (loadCount.current <= 2) {
            signals.forEach(s => seenSignalIds.current.add(s.id));
            isInitialLoad.current = false;
            return;
        }

        // Subsequent loads: check for new signals
        let newSignalsFound = false;
        
        // We only care about up to 10 newest signals to avoid spamming 
        const recentSignals = signals.slice(0, 10);
        
        for (const signal of recentSignals) {
            if (!seenSignalIds.current.has(signal.id)) {
                newSignalsFound = true;
                seenSignalIds.current.add(signal.id);
                
                // Add to notification store
                const dir = signal.signalType === 'BUY' ? 'LONG' : 'SHORT';
                addNotification({
                    title: `${signal.strategyType} Signal`,
                    message: `${signal.symbol} ${signal.timeframe} — ${dir}`,
                    symbol: signal.symbol,
                    strategyType: signal.strategyType,
                    timeframe: signal.timeframe,
                    direction: dir,
                });

                // Only trigger push for ACTIVE signals
                if (pushEnabled && signal.status === 'ACTIVE') {
                    triggerPushNotification(signal);
                }
            }
        }

        if (newSignalsFound && soundEnabled) {
            playPopsSound();
        }

    }, [signals, soundEnabled, pushEnabled, addNotification]);

    // Cleanup very old seen IDs occasionally to prevent memory leak
    useEffect(() => {
        const interval = setInterval(() => {
            if (seenSignalIds.current.size > 5000) {
                const newSet = new Set<string>();
                const arr = Array.from(seenSignalIds.current);
                arr.slice(2500).forEach(id => newSet.add(id));
                seenSignalIds.current = newSet;
            }
        }, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);
}
