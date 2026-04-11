import { pool } from "../db";
import type { DatabaseStorage } from "./index";
import {
  resolveClinicAndValidate,
  checkDuplicateAppointment,
  getNextTurnNumber,
  insertAppointmentRecord,
} from "./clinic-booking-create-setup";
import { handleConsultationInvoice } from "./clinic-booking-create-invoice";

const methods = {
  async createAppointment(this: DatabaseStorage, data: {
    clinicId: string; doctorId: string; patientId?: string; patientName: string;
    patientPhone?: string; appointmentDate: string; appointmentTime?: string;
    notes?: string; createdBy?: string;
    paymentType?: string; insuranceCompany?: string; payerReference?: string;
    companyId?: string; contractId?: string; contractMemberId?: string;
    visitId?: string;
  }): Promise<any> {
    const paymentType = (data.paymentType || 'CASH').toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const clinic = await resolveClinicAndValidate(client, data, paymentType);
      await checkDuplicateAppointment(client, data);
      const turnNumber = await getNextTurnNumber(client, data.clinicId, data.appointmentDate);
      const appointment = await insertAppointmentRecord(client, data, paymentType, turnNumber);

      await handleConsultationInvoice(client, clinic, appointment, data, paymentType);

      await client.query('COMMIT');
      return appointment;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default methods;
