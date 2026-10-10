import { memo } from 'preact/compat';
import { iconMarkup } from '@/icons';

// Only bundled Lucide SVG markup, never caller-provided HTML.
export const Icon = memo(function Icon({
  name,
  size = '18',
  className = '',
}: {
  name: string;
  size?: string | number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: iconMarkup(name, size, className) }}
    />
  );
});

// Produced by the existing icon sanitizer (Lucide, emoji or validated image URL).
export function NoteIcon({ html }: { html: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
