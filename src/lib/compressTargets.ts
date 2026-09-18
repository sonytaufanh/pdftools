import { formatBytes } from './formatters';

export interface TargetSizeOption {
  bytes: number;
  label: string;
}

const TARGET_FRACTIONS = [0.75, 0.5, 0.25];

/**
 * Builds target-size choices that are always smaller than the original file,
 * so a compression target can never be larger than the source.
 */
export function buildTargetSizeOptions(originalBytes: number): TargetSizeOption[] {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return [];

  const options: TargetSizeOption[] = [];
  const seen = new Set<number>();

  for (const fraction of TARGET_FRACTIONS) {
    const bytes = Math.max(1, Math.round(originalBytes * fraction));
    if (bytes >= originalBytes || seen.has(bytes)) continue;
    seen.add(bytes);
    options.push({
      bytes,
      label: `${formatBytes(bytes)} (${Math.round(fraction * 100)}%)`
    });
  }

  return options;
}
