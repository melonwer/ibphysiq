'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SvgFigurePlateProps {
  svgMarkup: string;
  questionId: string;
  className?: string;
}

/**
 * Deterministically scopes all internal SVG `id="..."`, `url(#...)`, `href="#..."`,
 * `xlink:href="#..."`, and `aria-labelledby`/`aria-describedby` references by `scopeKey`
 * so multiple physics diagrams rendered on the same page never collide `<marker>`,
 * `<clipPath>`, or gradient definitions.
 */
export function scopeSvgMarkup(svgMarkup: string, scopeKey: string): string {
  const trimmed = svgMarkup.trim();
  if (!trimmed) return '';

  const safeScope =
    'sp-fig-' +
    (scopeKey || 'item')
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const idMap = new Map<string, string>();
  for (const match of trimmed.matchAll(/\bid=(["'])([^"']+)\1/g)) {
    const rawId = match[2];
    if (rawId && !idMap.has(rawId)) {
      const scopedId = rawId.startsWith(`${safeScope}--`)
        ? rawId
        : `${safeScope}--${rawId}`;
      idMap.set(rawId, scopedId);
    }
  }

  let scoped = trimmed;

  if (idMap.size > 0) {
    scoped = scoped.replace(
      /\bid=(["'])([^"']+)\1/g,
      (full, quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `id=${quote}${mapped}${quote}` : full;
      }
    );

    scoped = scoped.replace(
      /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
      (full, _quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `url(#${mapped})` : full;
      }
    );

    scoped = scoped.replace(
      /\b(xlink:href|href)=(["'])#([^"']+)\2/g,
      (full, attr: string, quote: string, rawId: string) => {
        const mapped = idMap.get(rawId);
        return mapped ? `${attr}=${quote}#${mapped}${quote}` : full;
      }
    );

    scoped = scoped.replace(
      /\b(aria-labelledby|aria-describedby)=(["'])([^"']+)\2/g,
      (_full, attr: string, quote: string, rawList: string) => {
        const remapped = rawList
          .split(/\s+/)
          .map((token) => idMap.get(token) ?? token)
          .join(' ');
        return `${attr}=${quote}${remapped}${quote}`;
      }
    );
  }

  // Ensure proportional scaling inside responsive max-height containers
  scoped = scoped.replace(/<svg\b([^>]*)>/i, (openTag, attrs: string) => {
    if (/preserveAspectRatio=/i.test(attrs)) {
      return openTag;
    }
    return `<svg${attrs} preserveAspectRatio="xMidYMid meet">`;
  });

  return scoped;
}

/**
 * Extracts a human-readable figure description from `<svg aria-label="...">` or `<title>`.
 */
export function extractSvgLabel(svgMarkup: string): string | null {
  if (!svgMarkup) return null;
  const ariaMatch = svgMarkup.match(/<svg\b[^>]*\baria-label=(["'])([^"']+)\1/i);
  if (ariaMatch?.[2]?.trim()) {
    return ariaMatch[2].trim();
  }
  const titleMatch = svgMarkup.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return titleMatch[1].trim();
  }
  return null;
}

export function SvgFigurePlate({
  svgMarkup,
  questionId,
  className,
}: SvgFigurePlateProps) {
  const [expanded, setExpanded] = useState(false);
  const reactInstanceId = useId().replace(/[^A-Za-z0-9_-]/g, '');

  const inlineScopedSvg = useMemo(
    () => scopeSvgMarkup(svgMarkup, `${questionId}-${reactInstanceId}`),
    [svgMarkup, questionId, reactInstanceId]
  );

  const modalScopedSvg = useMemo(
    () =>
      expanded
        ? scopeSvgMarkup(svgMarkup, `${questionId}-${reactInstanceId}-zoom`)
        : '',
    [expanded, svgMarkup, questionId, reactInstanceId]
  );

  const figureLabel = useMemo(() => extractSvgLabel(svgMarkup), [svgMarkup]);

  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded]);

  if (!inlineScopedSvg) {
    return null;
  }

  const modalNode =
    expanded && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label={figureLabel ?? 'Expanded physics diagram'}
            onClick={() => setExpanded(false)}
          >
            <div
              className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] shadow-2xl"
              style={{ colorScheme: 'light' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2.5 sm:px-5">
                <p className="truncate text-sm font-medium text-[#111827]">
                  {figureLabel ?? 'Diagram view'}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Close expanded diagram"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                >
                  <span>Close</span>
                  <kbd className="rounded bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[11px] text-[#4B5563]">
                    Esc
                  </kbd>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="overflow-auto bg-white p-4 sm:p-6">
                <div
                  className="w-full [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[76vh] [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: modalScopedSvg }}
                />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <figure
        className={cn(
          'group relative my-3 rounded-xl border border-[#E5E7EB] bg-white p-3 sm:p-4 text-[#111827]',
          className
        )}
        style={{ colorScheme: 'light' }}
      >
        <div className="mb-1.5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-xs font-medium text-[#374151] transition-colors hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Expand diagram</span>
          </button>
        </div>

        <div
          onClick={() => setExpanded(true)}
          title="Click to expand diagram"
          className="w-full cursor-zoom-in [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[380px] [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: inlineScopedSvg }}
        />
      </figure>
      {modalNode}
    </>
  );
}
