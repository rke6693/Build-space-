import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });
const mk = (d: React.ReactNode) => ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    {d}
  </svg>
);

export const IconPlay = mk(<path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />);
export const IconPause = mk(<><rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>);
export const IconRestart = mk(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></>);
export const IconBack = mk(<><path d="M11 18l-6-6 6-6" /><path d="M19 18l-6-6 6-6" /></>);
export const IconFwd = mk(<><path d="M13 6l6 6-6 6" /><path d="M5 6l6 6-6 6" /></>);
export const IconLive = mk(<><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>);
export const IconBookmark = mk(<path d="M6 4h12v17l-6-4-6 4z" />);
export const IconQuake = mk(<path d="M2 12h3l2-5 3 10 3-14 3 12 2-3h4" />);
export const IconFlood = mk(<><path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15" /><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19" /><path d="M12 3s-4 4.5-4 7a4 4 0 0 0 8 0c0-2.5-4-7-4-7z" /></>);
export const IconFire = mk(<path d="M12 22c4 0 7-2.7 7-6.8 0-4.2-3.2-6.3-4.2-10.2-1.8 2-2 4-2 5.3-1.5-.6-2.6-2.3-2.8-4.3C7.2 8.3 5 11.2 5 15.2 5 19.3 8 22 12 22z" />);
export const IconStorm = mk(<><path d="M7 16a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 9 4 4 0 0 1 18 16.6" /><path d="M13 12l-3 5h4l-3 5" /></>);
export const IconGrid = mk(<><path d="M12 2v6M8 8h8M9 8l-3 14M15 8l3 14M7 14h10M6.5 18h11" /></>);
export const IconEvac = mk(<><circle cx="13" cy="4" r="2" /><path d="M7 21l3-6 3 2v4M10 15l1.5-6 3.5 3 3 1M11.5 9L8 10l-1 3" /></>);
export const IconLayers = mk(<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>);
export const IconSliders = mk(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>);
export const IconFolder = mk(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconChart = mk(<><path d="M4 20V4M4 20h16" /><path d="M7 15l4-4 3 3 5-6" /></>);
export const IconList = mk(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>);
export const IconGraph = mk(<><circle cx="5" cy="12" r="2.2" /><circle cx="18" cy="5" r="2.2" /><circle cx="18" cy="19" r="2.2" /><path d="M7 11l9-5M7 13l9 5" /></>);
export const IconCompare = mk(<><path d="M8 3v18M16 3v18" /><path d="M3 8h5M16 8h5M3 16h5M16 16h5" /></>);
export const IconInspect = mk(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.5-4.5" /></>);
export const IconInfo = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>);
export const IconHelp = mk(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01" /></>);
export const IconActivity = mk(<path d="M3 12h4l3 8 4-16 3 8h4" />);
export const IconChevronLeft = mk(<path d="M15 6l-6 6 6 6" />);
export const IconChevronRight = mk(<path d="M9 6l6 6-6 6" />);
export const IconClose = mk(<path d="M6 6l12 12M18 6L6 18" />);
export const IconTarget = mk(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IconDownload = mk(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconUpload = mk(<><path d="M12 20V9M7 14l5-5 5 5" /><path d="M5 4h14" /></>);
export const IconFilm = mk(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></>);
export const IconCamera = mk(<><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /></>);
export const IconDrop = mk(<path d="M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z" />);
export const IconWind = mk(<path d="M3 8h11a3 3 0 1 0-3-3M3 16h15a3 3 0 1 1-3 3M3 12h8" />);
export const IconThermo = mk(<><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" /></>);
export const IconWave = mk(<path d="M2 14c3 0 3-4 6-4s3 4 6 4 3-4 6-4" />);
export const IconEye = mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IconTrash = mk(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
export const IconEdit = mk(<path d="M4 20h4L19 9l-4-4L4 16v4z" />);
export const IconBuilding = mk(<><path d="M4 21V5l8-3v19M12 21V8l8 3v10M2 21h20" /><path d="M7 8v.01M7 12v.01M7 16v.01M16 13v.01M16 17v.01" /></>);
export const IconBridge = mk(<><path d="M2 16h20M4 16V9M20 16V9M4 9c3 4 13 4 16 0" /><path d="M8 16v-4M12 16v-3M16 16v-4" /></>);
export const IconShield = mk(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />);
export const IconCell = mk(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></>);
export const IconPower = mk(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />);
