import {
  Stethoscope, Bed, FlaskConical, Radiation,
  Banknote, ShieldCheck, FileSignature,
} from "lucide-react";
import type { VisitReason, PaymentKind } from "./PatientFormTypes";

export const VISIT_TYPES: { value: VisitReason; label: string; sub: string; Icon: any; color: string; bg: string; border: string }[] = [
  { value: "consultation", label: "كشف عيادة",     sub: "حجز في طابور العيادة",    Icon: Stethoscope,  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-300"   },
  { value: "admission",    label: "تسكين / إقامة",  sub: "تسكين على سرير بالمستشفى", Icon: Bed,          color: "text-green-700",  bg: "bg-green-50",  border: "border-green-300"  },
  { value: "lab",          label: "تحاليل",         sub: "طلب تحاليل مختبر",         Icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300" },
  { value: "radiology",    label: "أشعة",           sub: "طلب أشعة تشخيصية",         Icon: Radiation,    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-300"  },
];

export const PAYMENT_TYPES: { value: PaymentKind; label: string; Icon: any }[] = [
  { value: "CASH",      label: "نقدي",  Icon: Banknote      },
  { value: "INSURANCE", label: "تأمين", Icon: ShieldCheck   },
  { value: "CONTRACT",  label: "تعاقد", Icon: FileSignature },
];
