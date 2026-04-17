import React, { useState } from 'react';
import { TIMEZONE_OPTIONS, TimezoneOption } from '../../utils/timezone';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { userApi } from '../../services/userApi';

interface TimezoneSelectorProps {
  onSuccess?: () => void;
  standalone?: boolean;
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({ onSuccess, standalone = false }) => {
  const { user, setUser } = useAuthStore();
  const [selectedDz, setSelectedDz] = useState(user?.timezone || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedDz) {
      toast.error('Please select a timezone');
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await userApi.updateProfile({ timezone: selectedDz });
      
      setUser(updatedUser);
      toast.success('Timezone updated successfully');
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error saving timezone:', error);
      toast.error('Failed to save timezone. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`flex ${standalone ? 'flex-col gap-4' : 'flex-col sm:flex-row items-start sm:items-center gap-4'}`}>
      <select
        value={selectedDz}
        onChange={(e) => setSelectedDz(e.target.value)}
        className="flex-1 w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none border
          dark:bg-background-dark/50 dark:border-white/10 dark:text-white
          light:bg-white light:border-slate-200 light:text-slate-900"
      >
        <option value="" disabled>Select your timezone</option>
        {TIMEZONE_OPTIONS.map((tz: TimezoneOption) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
      
      <button
        onClick={handleSave}
        disabled={isSaving || selectedDz === user?.timezone}
        className="px-6 py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {isSaving ? 'Saving...' : 'Save Timezone'}
      </button>
    </div>
  );
};
