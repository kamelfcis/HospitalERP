import { roundMoney, parseMoney } from "../finance-helpers";
import type {
  PatientInvoiceHeader,
  PatientInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  buildPatientInvoiceGLLines(
    this: DatabaseStorage,
    header: PatientInvoiceHeader,
    lines: PatientInvoiceLine[],
  ): { lineType: string; amount: string; costCenterId?: string | null }[] {
    const lineTypeMap: Record<string, string> = {
      service:    "revenue_services",
      drug:       "revenue_drugs",
      consumable: "revenue_consumables",
      equipment:  "revenue_equipment",
    };
    const bizClassMap: Record<string, string> = {
      gas:            "revenue_gas",
      operating_room: "revenue_surgery",
      surgery:        "revenue_surgery",
      operation:      "revenue_surgery",
      administrative: "revenue_admin",
      admin:          "revenue_admin",
      admin_service:  "revenue_admin",
    };

    const totals: Record<string, number> = {};
    let doctorCostTotal = 0;
    for (const line of lines) {
      if (line.isVoid) continue;
      if (line.lineType === "doctor_cost") {
        doctorCostTotal += parseMoney(line.totalPrice);
        continue;
      }
      const bizClass = line.businessClassification ?? "";
      const mappingType = (bizClass && bizClassMap[bizClass])
        ? bizClassMap[bizClass]
        : (lineTypeMap[line.lineType as string] || "revenue_general");
      totals[mappingType] = (totals[mappingType] || 0) + parseMoney(line.totalPrice);
    }

    const result: { lineType: string; amount: string }[] = [];
    const totalNet = parseMoney(header.netAmount);
    if (totalNet > 0) {
      const paymentType = header.patientType === "cash" ? "cash" : "receivables";
      result.push({ lineType: paymentType, amount: roundMoney(totalNet) });
    }
    for (const [lt, amt] of Object.entries(totals)) {
      if (amt > 0) result.push({ lineType: lt, amount: roundMoney(amt) });
    }
    if (doctorCostTotal > 0) {
      result.push({ lineType: "doctor_cost", amount: roundMoney(doctorCostTotal) });
    }
    return result;
  },

};

export default methods;
