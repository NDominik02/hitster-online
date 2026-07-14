/**
 * Recommended decks are stored decks, not Spotify playlist definitions.
 *
 * Recommended decks are starred decks with `decks.report.featured = true` and
 * `is_public = true`. The deck metadata, cards, and uploaded audio are then
 * reused directly; selecting it never re-imports the Spotify playlist.
 */
export interface FeaturedDeckReport {
  featured?: boolean;
  starred?: boolean;
  featuredAt?: string;
  featuredBy?: string;
}

export function isFeaturedDeckReport(report: unknown): boolean {
  return Boolean(
    report &&
      typeof report === "object" &&
      "featured" in report &&
      (report as FeaturedDeckReport).featured === true &&
      (report as FeaturedDeckReport).starred === true
  );
}
