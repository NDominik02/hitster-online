type FeaturedDeckReport = {
  featured?: boolean;
};

export function isProtectedDeckReport(report: unknown): boolean {
  return Boolean(
    report &&
      typeof report === 'object' &&
      'featured' in report &&
      (report as FeaturedDeckReport).featured === true
  );
}
