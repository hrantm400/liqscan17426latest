import React from 'react';
import { Link } from 'react-router-dom';
import { NotificationBell } from '../shared/NotificationBell';

interface PageHeaderProps {
  breadcrumbs: Array<{ label: string; path?: string }>;
  lastUpdated?: string;
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumbs,
  lastUpdated,
  onRefresh,
  children,
}) => {
  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 shrink-0 dark:border-b-white/5 light:border-b-green-200/50 border-b">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center text-sm font-semibold tracking-wide">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {crumb.path ? (
                <Link
                  to={crumb.path}
                  className="dark:text-gray-400 light:text-slate-400 dark:hover:text-white light:hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="dark:text-white light:text-slate-900 hover:text-primary transition-colors cursor-pointer">
                  {crumb.label}
                </span>
              )}
              {index < breadcrumbs.length - 1 && (
                <span className="material-symbols-outlined dark:text-gray-600 light:text-slate-300 text-sm mx-1.5">
                  chevron_right
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
        {lastUpdated && (
          <div className="hidden md:flex items-center gap-2 text-[10px] dark:text-gray-500 light:text-slate-400 font-mono">
            <span>{lastUpdated}</span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 rounded dark:hover:bg-white/5 light:hover:bg-green-50 transition-colors"
                title="Refresh"
              >
                <span className="material-symbols-outlined text-xs">refresh</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        <div className="hidden md:block">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
};
