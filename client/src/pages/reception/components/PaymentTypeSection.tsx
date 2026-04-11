import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContractMemberLookup } from "@/pages/patients/components/ContractMemberLookup";
import type { PaymentKind } from "./types";
import { PAYMENT_TYPES, SectionLabel } from "./types";

interface PaymentTypeSectionProps {
  paymentType: PaymentKind;
  handlePaymentTypeChange: (v: PaymentKind) => void;
  insuranceCo: string;
  setInsuranceCo: (v: string) => void;
  resolution: any;
  consultDate: string;
}

export function PaymentTypeSection({
  paymentType, handlePaymentTypeChange,
  insuranceCo, setInsuranceCo,
  resolution, consultDate,
}: PaymentTypeSectionProps) {
  return (
    <section className="space-y-2">
      <SectionLabel>نوع الدفع</SectionLabel>
      <div className="flex gap-2" role="group" aria-label="نوع الدفع">
        {PAYMENT_TYPES.map(({ value, label, Icon }) => (
          <button
            key={value} type="button" aria-pressed={paymentType === value}
            onClick={() => handlePaymentTypeChange(value)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${paymentType === value ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"}`}
            data-testid={`button-payment-${value.toLowerCase()}`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>
      {paymentType === "INSURANCE" && (
        <div className="space-y-2">
          <ContractMemberLookup paymentType="INSURANCE" resolution={resolution} appointmentDate={consultDate} />
          {!resolution.state.resolved && (
            <div className="space-y-1">
              <Label className="text-xs">اسم شركة التأمين (بديل)</Label>
              <Input value={insuranceCo} onChange={e => setInsuranceCo(e.target.value)} placeholder="شركة التأمين" className="h-7 text-xs" data-testid="input-insurance-company" />
            </div>
          )}
        </div>
      )}
      {paymentType === "CONTRACT" && (
        <ContractMemberLookup paymentType="CONTRACT" resolution={resolution} appointmentDate={consultDate} />
      )}
    </section>
  );
}
