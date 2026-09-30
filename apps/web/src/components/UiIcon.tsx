export type IconName =
  | "today"
  | "inbox"
  | "calendar"
  | "projects"
  | "areas"
  | "memory"
  | "settings"
  | "more"
  | "voice"
  | "patients";
const paths: Record<IconName, React.ReactNode> = {
  patients: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 7v6m-3-3h6M8 17h8" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 4h16v16H4zM4 14h5l2 3h2l2-3h5" />
      <path d="M8 8h8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 3h3" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7V4h7l3 3h8v13H3zM7 12h10m-10 4h6" />
    </>
  ),
  areas: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  memory: (
    <>
      <path d="M8 3H5v18h14V3h-3M8 3v4h8V3zM8 12h8m-8 4h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  voice: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" />
    </>
  ),
};
export function UiIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 shrink-0 ${className}`}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
