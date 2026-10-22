import React from 'react';

/**
 * The Pitt line icons (design-system/assets/Icons): 24px grid, 1.75 stroke, round caps, drawn in currentColor so the
 * rail, cards and active states colour them. The "financial-impact" asset is a euro sign; the product shows USD, so
 * Financial Impact uses the bar-chart icon and Spend Projection a trend line in the same style.
 */
const PATHS = {
  room: <><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /><path d="M3 3l18 18" /></>,
  investigations: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  impact: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  projection: <><path d="M3 18l6-6 4 4 8-8" /><path d="M15 8h6v6" /></>,
  optimization: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  paste: <><rect x="6" y="4" width="12" height="17" rx="1" /><path d="M9 4V3h6v1M9 10h6M9 14h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  reporting: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
} as const;

export type IconName = keyof typeof PATHS;

export const Icon: React.FC<{ name: IconName; className?: string; title?: string }> = ({ name, className = 'h-4 w-4', title }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title && <title>{title}</title>}
    {PATHS[name]}
  </svg>
);
