/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Microsoft Clarity API (https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api) */
  clarity?: (...args: unknown[]) => void;
  /** Google Analytics 4 / gtag.js data layer */
  dataLayer?: unknown[];
  /** Google Analytics gtag command queue */
  gtag?: (...args: unknown[]) => void;
}
