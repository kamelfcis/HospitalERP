import type { Consultation } from "../types";

interface Props {
  consultation: Consultation;
}

export function PrintPrescription({ consultation }: Props) {
  const date = consultation.appointmentDate || new Date().toLocaleDateString("ar-EG");

  return (
    <div className="prescription-print-only">
      <div
        style={{
          fontFamily: "Arial, sans-serif",
          padding: "20px 30px",
          maxWidth: "210mm",
          direction: "rtl",
          fontSize: "13px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", borderBottom: "2px solid #333", paddingBottom: "10px", marginBottom: "12px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: "bold", margin: "0 0 4px" }}>روشتة طبية</h1>
          {consultation.clinicName && (
            <p style={{ fontSize: "14px", color: "#555", margin: 0 }}>{consultation.clinicName}</p>
          )}
        </div>

        {/* Patient & Doctor Info */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
          <div>
            <p style={{ margin: "2px 0" }}>
              <strong>المريض: </strong>{consultation.patientName}
            </p>
            {consultation.patientPhone && (
              <p style={{ margin: "2px 0", direction: "ltr", display: "inline-block" }}>
                <strong>الهاتف: </strong>{consultation.patientPhone}
              </p>
            )}
          </div>
          <div style={{ textAlign: "left" }}>
            <p style={{ margin: "2px 0" }}>
              <strong>الطبيب: </strong>{consultation.doctorName}
            </p>
            {consultation.doctorSpecialty && (
              <p style={{ margin: "2px 0", color: "#666" }}>{consultation.doctorSpecialty}</p>
            )}
            <p style={{ margin: "2px 0", direction: "ltr", display: "inline-block" }}>
              <strong>التاريخ: </strong>{date}
            </p>
          </div>
        </div>

        {/* Diagnosis */}
        {consultation.diagnosis && (
          <div style={{ background: "#f5f5f5", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: "bold" }}>التشخيص:</p>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{consultation.diagnosis}</p>
          </div>
        )}

        {/* Drugs */}
        {consultation.drugs.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontWeight: "bold", margin: "0 0 6px", fontSize: "14px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>
              الأدوية الموصوفة:
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "right", width: "30px" }}>#</th>
                  <th style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "right" }}>الدواء</th>
                  <th style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "right" }}>الجرعة</th>
                  <th style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "right" }}>التكرار</th>
                  <th style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "right" }}>المدة</th>
                </tr>
              </thead>
              <tbody>
                {consultation.drugs.map((drug) => (
                  <tr key={drug.lineNo}>
                    <td style={{ border: "1px solid #ddd", padding: "4px 8px", textAlign: "center" }}>{drug.lineNo}</td>
                    <td style={{ border: "1px solid #ddd", padding: "4px 8px", fontWeight: "bold" }}>{drug.drugName}</td>
                    <td style={{ border: "1px solid #ddd", padding: "4px 8px" }}>{drug.dose || "—"}</td>
                    <td style={{ border: "1px solid #ddd", padding: "4px 8px" }}>{drug.frequency || "—"}</td>
                    <td style={{ border: "1px solid #ddd", padding: "4px 8px" }}>{drug.duration || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Services */}
        {consultation.serviceOrders.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontWeight: "bold", margin: "0 0 6px", fontSize: "14px", borderBottom: "1px solid #ddd", paddingBottom: "4px" }}>
              الفحوصات والخدمات المطلوبة:
            </p>
            <ul style={{ margin: 0, paddingRight: "20px" }}>
              {consultation.serviceOrders.map((svc, i) => (
                <li key={i} style={{ marginBottom: "2px" }}>
                  {svc.serviceNameManual || svc.serviceId}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes */}
        {consultation.notes && (
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontWeight: "bold", margin: "0 0 4px" }}>ملاحظات:</p>
            <p style={{ margin: 0, color: "#555", whiteSpace: "pre-wrap" }}>{consultation.notes}</p>
          </div>
        )}

        {/* Signature */}
        <div style={{ marginTop: "30px", textAlign: "left" }}>
          <div style={{ borderTop: "1px solid #333", width: "200px", paddingTop: "4px", display: "inline-block" }}>
            <p style={{ margin: 0, fontSize: "12px", color: "#555" }}>توقيع الطبيب: {consultation.doctorName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
