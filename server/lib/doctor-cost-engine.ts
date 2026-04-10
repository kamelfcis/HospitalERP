import { storage } from "../storage";
import { roundMoney, parseMoney } from "../finance-helpers";

interface LineInput {
  lineType: string;
  serviceId?: string | null;
  unitPrice?: string | null;
  quantity?: string | null;
  totalPrice?: string | null;
  description?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  sortOrder?: number | null;
  sourceType?: string | null;
  encounterId?: string | null;
  businessClassification?: string | null;
  id?: string | null;
  doctorCostManualOverride?: boolean | null;
  [key: string]: unknown;
}

interface DoctorCostOptions {
  headerDoctorId?: string | null;
  headerDoctorName?: string | null;
}

export async function injectDoctorCostLines<L extends LineInput>(
  lines: L[],
  opts?: DoctorCostOptions,
): Promise<L[]> {
  const existingCostLines = lines.filter(l => l.lineType === "doctor_cost");
  const overrideMap = new Map<string, L[]>();
  for (const cl of existingCostLines) {
    if (cl.serviceId && cl.doctorCostManualOverride) {
      const arr = overrideMap.get(cl.serviceId) || [];
      arr.push(cl);
      overrideMap.set(cl.serviceId, arr);
    }
  }

  const serviceIds = [
    ...new Set(
      lines
        .filter(l => l.lineType === "service" && l.serviceId)
        .map(l => l.serviceId!),
    ),
  ];
  if (serviceIds.length === 0) return lines.filter(l => l.lineType !== "doctor_cost");

  const servicesData = await storage.getServicesByIds(serviceIds);
  const shareMap = new Map(
    servicesData
      .filter(s => s.doctorShareType !== "none" && parseFloat(String(s.doctorShareValue ?? "0")) > 0)
      .map(s => [s.id, { type: s.doctorShareType as "percentage" | "fixed", value: parseFloat(String(s.doctorShareValue)) }]),
  );
  if (shareMap.size === 0) return lines.filter(l => l.lineType !== "doctor_cost");

  const headerDoctorId = opts?.headerDoctorId || null;
  const headerDoctorName = opts?.headerDoctorName || null;

  const result: L[] = [];
  let sortIdx = 0;

  for (const line of lines) {
    if (line.lineType === "doctor_cost") continue;
    result.push({ ...line, sortOrder: sortIdx++ });

    if (line.lineType !== "service" || !line.serviceId) continue;
    const share = shareMap.get(line.serviceId);
    if (!share) continue;

    const lineTotal = parseMoney(line.totalPrice ?? "0");
    if (lineTotal <= 0) continue;

    const overrides = overrideMap.get(line.serviceId);
    if (overrides && overrides.length > 0) {
      const override = overrides.shift()!;
      result.push({ ...override, sortOrder: sortIdx++ });
      continue;
    }

    const costAmount =
      share.type === "percentage"
        ? lineTotal * (share.value / 100)
        : share.value;

    const effectiveDoctorId = line.doctorId || headerDoctorId;
    const effectiveDoctorName = line.doctorName || headerDoctorName;

    result.push({
      ...({} as L),
      lineType: "doctor_cost",
      serviceId: line.serviceId,
      itemId: null,
      description: `أجر طبيب${effectiveDoctorName ? " — " + effectiveDoctorName : ""} — ${line.description || ""}`.trim(),
      quantity: "1",
      unitPrice: roundMoney(costAmount),
      discountPercent: "0",
      discountAmount: "0",
      totalPrice: roundMoney(costAmount),
      unitLevel: "minor",
      doctorId: effectiveDoctorId,
      doctorName: effectiveDoctorName,
      costSubtype: "doctor",
      notes: `${share.type === "percentage" ? share.value + "%" : share.value + " ج.م"} من ${line.description || ""}`,
      sortOrder: sortIdx++,
      sourceType: "DOCTOR_COST",
      sourceId: null,
      linkedLineId: line.id || null,
      doctorCostAmount: roundMoney(costAmount),
      encounterId: line.encounterId || null,
      businessClassification: "doctor_cost",
      isVoid: false,
    } as unknown as L);
  }

  return result;
}
