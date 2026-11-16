// Temporary kill switch for AI visibility scan runs while the scan
// providers are unavailable. Flip RUNS_TEMPORARILY_UNAVAILABLE to false to
// re-enable scans everywhere: the header button, the command palette, the
// "+ New" menu, the /api/geo/scan endpoint and scheduled cron runs.
// Run history stays readable either way.
export const RUNS_TEMPORARILY_UNAVAILABLE = true;

export const RUNS_UNAVAILABLE_MESSAGE =
  "Runs are temporarily unavailable. We are working to bring them back - your past scans and results are still here.";
