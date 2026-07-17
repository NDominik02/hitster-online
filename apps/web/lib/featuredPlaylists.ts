/**
 * Recommended decks are stored decks, not Spotify playlist definitions.
 *
 * Recommended decks have `decks.report.featured = true` and `is_public = true`.
 * Selecting one reuses the stored deck metadata and cards directly; it never
 * re-imports the Spotify playlist.
 */
export interface FeaturedDeckReport {
  featured?: boolean;
  featuredAt?: string;
  featuredBy?: string;
}

export function isFeaturedDeckReport(report: unknown): boolean {
  return Boolean(
    report &&
      typeof report === "object" &&
      "featured" in report &&
      (report as FeaturedDeckReport).featured === true
  );
}
