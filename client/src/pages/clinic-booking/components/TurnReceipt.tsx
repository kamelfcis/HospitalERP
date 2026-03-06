import type { ClinicAppointment } from "../types";

interface Props {
  appointment: ClinicAppointment | null;
  clinicName: string;
}

export function TurnReceipt({ appointment, clinicName }: Props) {
  if (!appointment) return null;
  return (
    <div className="turn-receipt-print-only">
      <div style={{ textAlign: "center", fontFamily: "Arial, sans-serif", padding: "20px", width: "80mm" }}>
        <h2 style={{ fontSize: "16px", margin: "0 0 8px" }}>ورقة الدور</h2>
        <p style={{ fontSize: "14px", margin: "0 0 4px" }}>{clinicName}</p>
        <hr style={{ margin: "8px 0" }} />
        <p style={{ fontSize: "24px", fontWeight: "bold", margin: "12px 0" }}>
          رقم الدور: {appointment.turnNumber}
        </p>
        <p style={{ fontSize: "14px" }}>المريض: {appointment.patientName}</p>
        {appointment.doctorName && (
          <p style={{ fontSize: "14px" }}>الطبيب: {appointment.doctorName}</p>
        )}
        {appointment.appointmentDate && (
          <p style={{ fontSize: "13px", color: "#666" }}>التاريخ: {appointment.appointmentDate}</p>
        )}
        {appointment.appointmentTime && (
          <p style={{ fontSize: "13px", color: "#666" }}>الوقت: {appointment.appointmentTime}</p>
        )}
        <hr style={{ margin: "8px 0" }} />
        <p style={{ fontSize: "11px", color: "#888" }}>يُرجى الاحتفاظ بهذه الورقة</p>
      </div>
    </div>
  );
}
