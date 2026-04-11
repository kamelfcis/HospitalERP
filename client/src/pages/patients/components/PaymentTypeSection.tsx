import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./SectionLabel";
import { PAYMENT_TYPES } from "./PatientFormConstants";
import { ContractMemberLookup } from "./ContractMemberLookup";
import type { PaymentKind } from "./PatientFormTypes";
import type { useContractResolution } from "../hooks/useContractResolution";

export interface PaymentTypeSectionProps {
  paymentType: PaymentKind;
  handlePaymentTypeChange: (v: PaymentKind) => void;
  handlePaymentKeyDown: (e: React.KeyboardEvent, v: PaymentKind) => void;
  insuranceCo: string;
  setInsuranceCo: (v: string) => void;
  resolution: ReturnType<typeof useContractResolution>;
  consultDate: string;
}

export function PaymentTypeSection({
  paymentType,
  handlePaymentTypeChange,
  handlePaymentKeyDown,
  insuranceCo,
  setInsuranceCo,
  resolution,
  consultDate,
}: PaymentTypeSectionProps) {
  return (
    <section aria-label="نوع الدفع" className="space-y-2">
      <SectionLabel>نوع الدفع</SectionLabel>
      <div className="flex gap-2" role="group" aria-label="نوع الدفع">
        {PAYMENT_TYPES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={paymentType === value}
            onClick={() => handlePaymentTypeChange(value)}
            onKeyDown={e => handlePaymentKeyDown(e, value)}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              paymentType === value
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background border-input hover:bg-muted",
            ].join(" ")}
            data-testid={`button-payment-${value.toLowerCase()}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {paymentType === "INSURANCE" && (
        <div className="space-y-2">
          <ContractMemberLookup
            paymentType="INSURANCE"
            resolution={resolution}
            appointmentDate={consultDate}
          />
          {!resolution.state.resolved && (
            <div className="space-y-1">
              <Label className="text-xs">اسم شركة التأمين (بديل عند عدم توفر البطاقة)</Label>
              <Input
                value={insuranceCo}
                onChange={e => setInsuranceCo(e.target.value)}
                placeholder="اسم شركة التأمين"
                className="h-7 text-xs"
                data-testid="input-insurance-company"
              />
            </div>
          )}
        </div>
      )}
      {paymentType === "CONTRACT" && (
        <ContractMemberLookup
          paymentType="CONTRACT"
          resolution={resolution}
          appointmentDate={consultDate}
        />
      )}
    </section>
  );
}
