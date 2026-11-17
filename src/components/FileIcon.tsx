import { memo, useState } from 'react';
import type { Category } from '../lib/categories';
import { familyColor } from '../lib/categories';

/** Pastas especiais recebem um símbolo sobre a pasta, como no Explorer. */
export type SpecialFolder = 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos' | 'home' | 'trash';

interface FileIconProps {
  category: Category;
  ext?: string;
  size?: number;
  special?: SpecialFolder | null;
  /** URL de miniatura (imagens). Se falhar, cai para o ícone. */
  thumb?: string | null;
  link?: boolean;
  className?: string;
}

const PAGE = 'M9 3.5h10.2l7.3 7.3v15.7a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 9 3.5Z';
const FOLD = 'M19.2 3.5v5.8a1.5 1.5 0 0 0 1.5 1.5h5.8';

function Glyph({ category, color }: { category: Category; color: string }) {
  const s = { stroke: color, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'image':
      return (
        <>
          <circle cx="13.2" cy="15" r="1.9" fill={color} />
          <path d="M10.3 24.3 14.6 19l3 3.4 2.2-2.6 3.9 4.5Z" fill={color} />
        </>
      );
    case 'video':
      return <path d="M13.6 14.2v8.6l7.3-4.3Z" fill={color} stroke={color} strokeWidth="1.2" strokeLinejoin="round" />;
    case 'audio':
      return (
        <>
          <path d="M18.6 13.4v7.4" {...s} />
          <path d="M18.6 13.4 22 14.6" {...s} />
          <circle cx="16.4" cy="21.2" r="2.4" fill={color} />
        </>
      );
    case 'spreadsheet':
      return (
        <>
          <rect x="10.8" y="13.2" width="11.4" height="10" rx="1.4" {...s} strokeWidth={1.6} />
          <path d="M10.8 16.6h11.4M10.8 19.9h11.4M14.8 13.2v10" {...s} strokeWidth={1.4} />
        </>
      );
    case 'presentation':
      return <path d="M12.5 23v-3.5M16.5 23v-7.5M20.5 23v-5" {...s} strokeWidth={2.2} />;
    case 'pdf':
      return (
        <>
          <path d="M11.5 14.5h9M11.5 18h9M11.5 21.5h5.5" {...s} />
          <rect x="19" y="20" width="5" height="4" rx="1" fill={color} />
        </>
      );
    case 'document':
    case 'text':
      return <path d="M11.5 14.5h9.5M11.5 18h9.5M11.5 21.5h6" {...s} />;
    case 'code':
      return <path d="m14 15-3.4 3.5 3.4 3.5M19 15l3.4 3.5-3.4 3.5" {...s} />;
    case 'archive':
      return (
        <>
          <path d="M16.5 4.5v1.4M16.5 8v1.4M16.5 11.5v1.4M16.5 15v1.4" {...s} strokeWidth={1.6} />
          <rect x="14.3" y="18" width="4.4" height="5.6" rx="1.2" fill={color} />
        </>
      );
    case 'executable':
      return (
        <>
          <rect x="10.5" y="13.4" width="12" height="10" rx="1.8" {...s} strokeWidth={1.6} />
          <path d="M10.5 16.4h12" {...s} strokeWidth={1.6} />
        </>
      );
    case 'diskimage':
      return (
        <>
          <circle cx="16.5" cy="18.5" r="5" {...s} strokeWidth={1.7} />
          <circle cx="16.5" cy="18.5" r="1.3" fill={color} />
        </>
      );
    case 'font':
      return <path d="m12.3 23.4 4.2-10 4.2 10M13.8 20h5.4" {...s} />;
    case 'temporary':
      return (
        <>
          <circle cx="16.5" cy="18.5" r="4.8" {...s} strokeWidth={1.7} />
          <path d="M16.5 16v2.6l1.7 1.1" {...s} strokeWidth={1.6} />
        </>
      );
    case 'system':
      return (
        <>
          <circle cx="16.5" cy="18.5" r="2.2" {...s} strokeWidth={1.7} />
          <path d="M16.5 13.6v1.6M16.5 21.8v1.6M11.6 18.5h1.6M19.8 18.5h1.6M13 15l1.1 1.1M19 21l1.1 1.1M13 22l1.1-1.1M19 16l1.1-1.1" {...s} strokeWidth={1.5} />
        </>
      );
    default:
      return null;
  }
}

function SpecialGlyph({ kind }: { kind: SpecialFolder }) {
  const s = {
    stroke: 'rgba(110, 62, 0, 0.62)',
    strokeWidth: 1.7,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'downloads':
      return <path d="M16 15v6.2M13.2 18.6l2.8 2.8 2.8-2.8M12.5 23.6h7" {...s} />;
    case 'documents':
      return <path d="M13 16h6M13 19h6M13 22h4" {...s} />;
    case 'pictures':
      return (
        <>
          <circle cx="14" cy="17" r="1.3" fill={s.stroke} />
          <path d="m12 23 3-3.2 2 2 1.6-1.8 2.4 3" {...s} />
        </>
      );
    case 'music':
      return (
        <>
          <path d="M17.6 15.4v5.6l2.4.6" {...s} />
          <circle cx="15.8" cy="21.5" r="1.8" fill={s.stroke} />
        </>
      );
    case 'videos':
      return <path d="M14.4 16.4v6l4.8-3Z" fill={s.stroke} stroke={s.stroke} strokeWidth="1" strokeLinejoin="round" />;
    case 'desktop':
      return <path d="M12.3 16h7.4v4.6h-7.4ZM14.6 22.8h2.8" {...s} />;
    case 'home':
      return <path d="M12.6 19 16 16l3.4 3v4h-6.8Z" {...s} />;
    default:
      return null;
  }
}

/** Ícone de arquivo/pasta no estilo do Organizador (grade 32×32). */
export const FileIcon = memo(function FileIcon({ category, ext = '', size = 20, special, thumb, link, className }: FileIconProps) {
  const [thumbFailed, setThumbFailed] = useState(false);

  if (thumb && !thumbFailed && category === 'image') {
    return (
      <span className={`file-thumb ${className ?? ''}`} style={{ width: size, height: size }}>
        <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setThumbFailed(true)} />
      </span>
    );
  }

  if (category === 'folder') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" className={`file-icon ${className ?? ''}`} aria-hidden>
        <path
          d="M3 9.5A2.5 2.5 0 0 1 5.5 7h6.4a2.5 2.5 0 0 1 1.8.8l1.6 1.7h11.2A2.5 2.5 0 0 1 29 12v12.5a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24.5Z"
          fill="var(--folder-back)"
        />
        <path d="M3 13.6a2.5 2.5 0 0 1 2.5-2.5h21a2.5 2.5 0 0 1 2.5 2.5v10.9a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24.5Z" fill="var(--folder-front)" />
        <path d="M5.6 12.4h20.8" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
        {special && size >= 18 ? <SpecialGlyph kind={special} /> : null}
        {link ? <LinkBadge /> : null}
      </svg>
    );
  }

  const color = familyColor(category);
  const showLabel = size >= 44 && ext.length > 0 && ext.length <= 5;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`file-icon ${className ?? ''}`} aria-hidden>
      <path d={PAGE} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.2" />
      <path d={FOLD} fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinejoin="round" />
      {showLabel ? (
        <>
          <rect x="3.5" y="19.5" width={Math.max(13, ext.length * 4.4 + 5)} height="8" rx="2.2" fill={color} />
          <text
            x={3.5 + Math.max(13, ext.length * 4.4 + 5) / 2}
            y="25.4"
            textAnchor="middle"
            fontSize="5.6"
            fontWeight="800"
            fontFamily="Inter Variable, Segoe UI, sans-serif"
            fill="#ffffff"
            letterSpacing="0.2"
          >
            {ext.toUpperCase()}
          </text>
          <g transform="translate(0 -4.5)">
            <Glyph category={category} color={color} />
          </g>
        </>
      ) : (
        <Glyph category={category} color={color} />
      )}
      {link ? <LinkBadge /> : null}
    </svg>
  );
});

function LinkBadge() {
  return (
    <g>
      <rect x="2" y="20" width="10" height="10" rx="2.4" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1" />
      <path d="M5.2 26.8 9 23M6.4 23H9v2.6" stroke="var(--accent-text)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
