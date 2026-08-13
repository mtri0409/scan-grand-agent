import * as path from "node:path";

export function getRunOutputDir(runTimestamp: string): string {
  return path.join("output", "runs", runTimestamp || "unstarted");
}

export function getRunReportsDir(runTimestamp: string): string {
  return path.join(getRunOutputDir(runTimestamp), "reports");
}

export function getRunTrackerPath(runTimestamp: string): string {
  return path.join(getRunOutputDir(runTimestamp), "Grant_Scan_Tracker_RetriV_VNF.xlsx");
}

export function getRunMarketExcelPath(runTimestamp: string, topicSlug: string, dateStamp: string): string {
  return path.join(getRunOutputDir(runTimestamp), `Grant_Market_Scan_${topicSlug}_${dateStamp}.xlsx`);
}
