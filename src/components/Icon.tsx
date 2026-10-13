// Small stroke icon set drawn for this app (no icon package, no external requests).
// Decorative by default: pair an icon with visible text or an aria-label on its button.
const PATHS = {
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  list: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6",
  plus: "M12 5v14 M5 12h14",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4",
  workflow: "M4 4h6v5H4z M14 15h6v5h-6z M7 9v3a2 2 0 0 0 2 2h5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.5-4.5",
  logout: "M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M4 4l16 16",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  close: "M6 6l12 12 M18 6L6 18",
  alert: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v5 M12 16h.01",
  checkCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6",
  xCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6 M15 9l-6 6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7 M12 17h.01",
  lock: "M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21a8 8 0 0 1 16 0",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  home: "M4 11l8-7 8 7 M6 10v10h12V10",
  idCard: "M3 6h18v12H3z M7.5 10.5h.01 M7 16c0-1.5 1-2.5 2.5-2.5S12 14.5 12 16 M14 10h4 M14 14h3",
  tag: "M3 12V4h8l10 10-8 8z M7.5 8.5h.01",
  box: "M12 3l9 4.5v9L12 21l-9-4.5v-9z M3 7.5l9 4.5 9-4.5 M12 12v9",
  calculator: "M6 3h12v18H6z M9 7h6 M9 12h.01 M12 12h.01 M15 12h.01 M9 16h.01 M12 16h.01 M15 16h.01",
  save: "M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7",
  inbox: "M3 13l3-8h12l3 8v6H3z M3 13h5l1 3h6l1-3h5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
