export function parsePageSelection(
  input: string | number | null | undefined,
  totalPages: number
): number[] {
  const total = Math.max(1, Number(totalPages) || 1);
  const raw = String(input ?? '').trim();

  if (!raw) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>();

  raw.split(',').forEach(part => {
    const segment = part.trim();
    if (!segment) return;

    const rangeMatch = segment.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const first = Number(rangeMatch[1]);
      const second = Number(rangeMatch[2]);
      const start = Math.max(1, Math.min(first, second));
      const end = Math.min(total, Math.max(first, second));
      for (let page = start; page <= end; page += 1) {
        pages.add(page);
      }
      return;
    }

    const single = Number(segment);
    if (Number.isInteger(single) && single >= 1 && single <= total) {
      pages.add(single);
    }
  });

  return [...pages].sort((a, b) => a - b);
}
