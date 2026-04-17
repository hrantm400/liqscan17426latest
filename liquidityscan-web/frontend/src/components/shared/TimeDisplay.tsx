import React from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  formatTimeDisplayParts,
  formatInUserTimezone,
  getTimezoneLabelForDisplay,
} from '../../utils/userTimeFormat';

interface TimeDisplayProps {
  date: string | Date;
  /** full = weekday + month day + time (no year); default = weekday + time; time | date = partial */
  format?: 'full' | 'time' | 'date';
  timeframe?: string; // e.g. '15m', '1h', '4h', '1d' — shifts to candle close instant when set
  className?: string;
  showUtcLabel?: boolean;
}

/**
 * Candle close time (open + 1 bar) for display.
 */
const getTimeframeMs = (tf?: string): number => {
  if (!tf) return 0;
  const match = tf.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) return 0;

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm':
      return val * 60 * 1000;
    case 'h':
      return val * 60 * 60 * 1000;
    case 'd':
      return val * 24 * 60 * 60 * 1000;
    case 'w':
      return val * 7 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
};

export const TimeDisplay: React.FC<TimeDisplayProps> = ({
  date,
  format,
  timeframe,
  className = '',
  showUtcLabel = true,
}) => {
  const { user } = useAuthStore();
  const timezoneOffset = user?.timezone;

  if (!date) return <span className={className}>-</span>;

  try {
    let d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>Invalid Date</span>;

    if (timeframe) {
      d = new Date(d.getTime() + getTimeframeMs(timeframe));
    }

    const utcTimeStr =
      formatInUserTimezone(d, null, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }) + ' UTC';

    const primaryDisplay = formatTimeDisplayParts(d, timezoneOffset, format ?? 'default');
    const displayTz = timezoneOffset ? getTimezoneLabelForDisplay(timezoneOffset) : 'local';

    if (showUtcLabel) {
      return (
        <div className={`inline-flex flex-col sm:flex-row sm:items-baseline gap-1 ${className}`}>
          <span>{primaryDisplay}</span>
          <span
            className="text-[10px] text-gray-500 font-bold whitespace-nowrap"
            title={`UTC: ${utcTimeStr}`}
          >
            ({displayTz})
          </span>
        </div>
      );
    }

    return <span className={className}>{primaryDisplay}</span>;
  } catch (e) {
    return <span className={className}>Error</span>;
  }
};
