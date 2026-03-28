export const HOSPITAL_ONLY_ROUTES: string[] = [
  "/patient-invoices",
  "/bed-board",
  "/room-management",
  "/surgery-types",
  "/doctor-settlements",
  "/patients",
  "/patient-inquiry",
  "/duplicate-patients",
  "/doctors",
  "/doctor-statement",
  "/services-pricing",
  "/clinic-booking",
  "/doctor-consultation",
  "/doctor-orders",
  "/dept-services",
  "/contracts",
  "/contract-claims",
  "/approvals",
  "/contracts-analytics",
];

export function isHospitalOnlyRoute(pathname: string): boolean {
  return HOSPITAL_ONLY_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}
