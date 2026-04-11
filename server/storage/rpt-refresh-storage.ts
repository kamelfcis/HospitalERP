export interface RptRefreshResult {
  upserted: number;
  durationMs: number;
  ranAt: string;
}

import rptPatientVisitMethods from "./rpt-patient-visit-storage";
import rptInventoryMethods from "./rpt-inventory-storage";

const methods = {
  ...rptInventoryMethods,
  ...rptPatientVisitMethods,
};

export default methods;
