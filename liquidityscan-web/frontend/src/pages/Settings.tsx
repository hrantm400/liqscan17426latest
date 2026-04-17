import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { TelegramAlertsConfig } from '../components/settings/TelegramAlertsConfig';
import { TimezoneSelector } from '../components/settings/TimezoneSelector';
import { staggerContainer, listItemVariants } from '../utils/animations';
import { useNotificationStore } from '../store/notificationStore';

export function Settings() {
  useTheme(); // to keep hook structure if context is needed, though we only toggle
  
  const {
    soundEnabled,
    toastPopupsEnabled,
    pushEnabled,
    setSoundEnabled,
    setToastPopupsEnabled,
    setPushEnabled,
  } = useNotificationStore();

  const [emailEnabled, setEmailEnabled] = useState(true); // Mock for email until backend supports it

  const handlePushToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    if (enabled && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setPushEnabled(true);
      } else {
        alert('Browser notifications were denied.');
        setPushEnabled(false);
      }
    } else {
      setPushEnabled(enabled);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={staggerContainer}
    >
      <motion.div variants={listItemVariants} className="flex items-center justify-between">
        <h1 className="text-3xl font-bold dark:text-white light:text-text-dark">Settings</h1>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={listItemVariants} className="glass-panel rounded-xl p-6">
          <h2 className="text-xl font-bold dark:text-white light:text-text-dark mb-6">Appearance</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white light:text-text-dark font-medium">Theme</p>
                <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">Switch between dark and light mode</p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </motion.div>

        <motion.div variants={listItemVariants} className="glass-panel rounded-xl p-6">
          <h2 className="text-xl font-bold dark:text-white light:text-text-dark mb-6">Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white light:text-text-dark font-medium">Email Notifications</p>
                <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">Receive email alerts for signals</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 dark:bg-gray-700 light:bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white light:text-text-dark font-medium">In-app popups</p>
                <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">
                  Floating cards at the top when a new signal arrives (bell list still updates)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={toastPopupsEnabled}
                  onChange={(e) => setToastPopupsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 dark:bg-gray-700 light:bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white light:text-text-dark font-medium">Browser Push Notifications</p>
                <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">System / browser notifications on new signals</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={handlePushToggle}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 dark:bg-gray-700 light:bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white light:text-text-dark font-medium">Sound Alerts</p>
                <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">Play an unobtrusive sound when new signals are detected</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 dark:bg-gray-700 light:bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div variants={listItemVariants} className="glass-panel rounded-xl p-6">
        <h2 className="text-xl font-bold dark:text-white light:text-text-dark mb-6">Preferences</h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="dark:text-white light:text-text-dark font-medium">Timezone</p>
              <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">All signal times will be displayed in this timezone</p>
            </div>
            <div className="w-full sm:w-auto">
              <TimezoneSelector />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Embedded Telegram Custom Alerts */}
      <motion.div variants={listItemVariants}>
        <TelegramAlertsConfig />
      </motion.div>
    </motion.div>
  );
}
