/**
 * Recommended decks are stored decks, not Spotify playlist definitions.
 *
 * To promote a generated deck, set `decks.report.featured` to true and keep the
 * deck public. The deck metadata, cards, and uploaded audio are then reused
 * directly; selecting it never re-imports the Spotify playlist.
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
