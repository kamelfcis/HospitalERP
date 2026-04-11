import { upsertInpatientVisits } from "./rpt-visit-inpatient-storage";
import { upsertOutpatientVisitsAndCleanup } from "./rpt-visit-outpatient-storage";
import type { RptRefreshResult } from "./rpt-refresh-storage";

const methods = {

  async refreshPatientVisitSummary(): Promise<RptRefreshResult> {
    const start = Date.now();

    const result = await upsertInpatientVisits();

    await upsertOutpatientVisitsAndCleanup();

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return {
      upserted,
      durationMs,
      ranAt: new Date().toISOString(),
    };
  },
};

export default methods;
