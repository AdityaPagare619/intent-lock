/**
 * Hand-authored inline SVG icon set (audit-1 §4 / audit-3 §C1): one
 * restrained vector language — 24px grid, 1.5px stroke, rounded caps,
 * currentColor. Emoji are banned as UI iconography; these replace them
 * on every surface the stage lane owns.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconPlay({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.02 1.02 0 0 0 0-1.76L9.56 4.26A1.02 1.02 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function IconMic({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

export function IconMicOff({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 9.2V7a3 3 0 0 1 5.7-1.3M9 3.6A3 3 0 0 1 15 6.4V12a3 3 0 0 1-.5 1.7" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.9 4.8M18.5 11a6.5 6.5 0 0 1-.9 3.3" />
      <path d="M12 17.5V21" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function IconZap({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
    </svg>
  );
}

export function IconUsers({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <path d="M15.5 5.9a3.2 3.2 0 0 1 0 5.7M17.8 15.4c1.6.7 2.5 2 2.8 4.1" />
    </svg>
  );
}

export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3Z" />
      <path d="m9.2 11.6 2 2 3.6-3.8" />
    </svg>
  );
}

export function IconMusic({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 18.2V6l10-2v11.7" />
      <circle cx="6.5" cy="18.2" r="2.5" />
      <circle cx="16.5" cy="15.7" r="2.5" />
    </svg>
  );
}

export function IconRooms({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="5" width="7" height="14" rx="1.6" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.6" />
      <circle cx="7" cy="15.5" r="1.6" />
      <circle cx="17" cy="15.5" r="1.6" />
      <path d="M7 8.8v.4M17 8.8v.4" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconAlert({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.6 2.8 19.5h18.4L12 3.6Z" />
      <path d="M12 9.5v4.6" />
      <path d="M12 16.9v.3" />
    </svg>
  );
}

export function IconLink({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M10.5 13.5a4.2 4.2 0 0 0 6 0l3-3a4.24 4.24 0 1 0-6-6l-1.5 1.5" />
      <path d="M13.5 10.5a4.2 4.2 0 0 0-6 0l-3 3a4.24 4.24 0 1 0 6 6l1.5-1.5" />
    </svg>
  );
}

export function IconWifiOff({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 10a10.5 10.5 0 0 1 3.6-2.2M12 6.5c2.9 0 5.6 1 7.7 2.7" />
      <path d="M8.5 13.5a6 6 0 0 1 5-1.3M15.5 13.5a6 6 0 0 0-1.2-.8" />
      <path d="M12 17.2v.3" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

export function IconReceipt({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 3.5h12V21l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21V3.5Z" />
      <path d="M9 8h6M9 11.5h6" />
    </svg>
  );
}

export function IconRadio({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M8.7 15.3a4.7 4.7 0 0 1 0-6.6M15.3 8.7a4.7 4.7 0 0 1 0 6.6M6.2 17.8a8.3 8.3 0 0 1 0-11.6M17.8 6.2a8.3 8.3 0 0 1 0 11.6" />
    </svg>
  );
}

export function IconChevronD({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5.5 9.5 6.5 6 6.5-6" />
    </svg>
  );
}
