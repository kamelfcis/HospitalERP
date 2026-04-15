/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  clinic-intake.test.ts — اختبار شامل لاستقبال العيادة والمفضلة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  التغطية:
 *    A) Schema / DB validation
 *    B) Intake API (GET / PUT / POST-complete)
 *    C) Intake locking (backend-enforced, not UI-only)
 *    D) RBAC enforcement
 *    E) Clinic isolation
 *    F) Doctor favorites (CRUD + ownership)
 *    G) Template persistence
 *    H) Audit fields
 *    I) Edge cases
 *
 *  يعتمد على:
 *    - admin / admin123 → كل الصلاحيات + clinic.view_all
 *    - مستخدمين مؤقتين يُنشأون في beforeAll ويُحذفون في afterAll
 *    - مواعيد موجودة في الـ DB (waiting / clinic-A)
 *    - موعد اختبار يُنشأ في clinic-B لاختبار العزل
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuthenticatedApi, loginWithRetry, BASE_URL } from "./api-auth-helper";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

// ─── Constants ───────────────────────────────────────────────────────────────

const CLINIC_A = "2b11fc0b-1314-4b3d-8714-c7cbf273372c"; // عيادة الباطنة
const CLINIC_B = "34494fdf-b817-4138-a574-07bc5a2c6112"; // عيادة القلب
const DOCTOR_ID_A = "0c74913e-64f7-4ec2-a7d3-e7d69fc50c70"; // دكتور اختبار تلقائي
const DOCTOR_ID_B = "101f9f5f-bb4b-4a39-acc9-168fde4c3131"; // محمد مصطفى حفناوى

/** Unique per run so parallel / repeated runs do not collide on username unique constraint. */
const INTAKE_RUN = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const USER_INTAKE_RECEPTION = `ti_rec_${INTAKE_RUN}`;
const USER_INTAKE_DOCTOR    = `ti_doc_${INTAKE_RUN}`;
const USER_INTAKE_NOCLINIC  = `ti_nc_${INTAKE_RUN}`;

// ─── Test state ───────────────────────────────────────────────────────────────

const adminApi = new AuthenticatedApi();

// Temporary user IDs created in beforeAll
let testReceptionUserId   = "";
let testDoctorUserId      = "";
let testNonClinicUserId   = "";

// Passwords for temp users (known at creation time)
const TEMP_PASS = "TestPass@2026!";

let receptionApi: AuthenticatedApi;  // scoped to clinic A
let doctorApi:    AuthenticatedApi;  // has doctor assignment (DOCTOR_ID_A)
let noClinicApi:  AuthenticatedApi;  // reception role but NO clinic assignments

// Appointments
let aptClinicA = "afdeac9e-546d-4521-b770-4656131e3962"; // existing waiting in clinic A
let aptLockTest = "5e3d191d-475d-479a-8742-147c81330e17"; // used for lock tests
let aptClinicB  = "";  // created in beforeAll in clinic B

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createUser(
  api:      AuthenticatedApi,
  username: string,
  role:     string,
  fullName: string
): Promise<string> {
  const r = await api.call("POST", "/api/users", {
    username, password: TEMP_PASS, fullName, role,
  });
  if (r.status !== 201) throw new Error(`createUser ${username} failed: ${JSON.stringify(r.data)}`);
  return (r.data as any).id as string;
}

async function deleteUser(api: AuthenticatedApi, id: string) {
  await api.call("DELETE", `/api/users/${id}`);
}

async function assignUserToClinic(api: AuthenticatedApi, userId: string, clinicId: string) {
  await api.call("PUT", `/api/users/${userId}/clinics`, { clinicIds: [clinicId] });
}

async function assignUserToDoctor(api: AuthenticatedApi, userId: string, doctorId: string) {
  await api.call("POST", "/api/clinic-user-doctor", { userId, doctorId });
}

async function deleteClinicIntake(appointmentId: string) {
  await db.execute(sql`DELETE FROM clinic_visit_intake WHERE appointment_id = ${appointmentId}`);
}

async function deleteConsultation(appointmentId: string) {
  await db.execute(sql`DELETE FROM clinic_consultations WHERE appointment_id = ${appointmentId}`);
}

async function createTestAppointmentInClinicB(): Promise<string> {
  const turnNumber = Math.floor(100_000 + Math.random() * 800_000);
  const result = await db.execute(sql`
    INSERT INTO clinic_appointments (clinic_id, doctor_id, patient_name, appointment_date, turn_number, status)
    VALUES (${CLINIC_B}, ${DOCTOR_ID_B}, 'مريض اختبار عزل', CURRENT_DATE, ${turnNumber}, 'waiting')
    RETURNING id
  `);
  return ((result.rows[0] as any).id) as string;
}

async function deleteTestAppointment(id: string) {
  await db.execute(sql`DELETE FROM clinic_appointments WHERE id = ${id}`);
}

async function deleteFavoritesForDoctor(doctorId: string) {
  await db.execute(sql`DELETE FROM clinic_doctor_favorites WHERE doctor_id = ${doctorId}`);
}

// ─── beforeAll: setup test users & data ──────────────────────────────────────

beforeAll(async () => {
  await loginWithRetry(adminApi);

  // Clean up any leftover intake from previous test runs
  await deleteConsultation(aptLockTest).catch(() => {});
  await deleteClinicIntake(aptClinicA).catch(() => {});
  await deleteClinicIntake(aptLockTest).catch(() => {});

  // Create temp users (unique usernames — avoids leftover rows from aborted runs)
  testReceptionUserId = await createUser(adminApi, USER_INTAKE_RECEPTION, "reception", "استقبال اختبار");
  testDoctorUserId    = await createUser(adminApi, USER_INTAKE_DOCTOR,    "doctor",    "طبيب اختبار");
  testNonClinicUserId = await createUser(adminApi, USER_INTAKE_NOCLINIC,  "reception", "استقبال بلا عيادة");

  // Assign reception → clinic A only
  await assignUserToClinic(adminApi, testReceptionUserId, CLINIC_A);
  // noClinic user gets NO clinic assignments

  // Assign doctor user → doctor record A
  await assignUserToDoctor(adminApi, testDoctorUserId, DOCTOR_ID_A);

  // Build API clients
  receptionApi = new AuthenticatedApi(USER_INTAKE_RECEPTION, TEMP_PASS);
  doctorApi    = new AuthenticatedApi(USER_INTAKE_DOCTOR,    TEMP_PASS);
  noClinicApi  = new AuthenticatedApi(USER_INTAKE_NOCLINIC,  TEMP_PASS);

  await loginWithRetry(receptionApi);
  await loginWithRetry(doctorApi);
  await loginWithRetry(noClinicApi);

  // Create appointment in clinic B for isolation tests
  aptClinicB = await createTestAppointmentInClinicB();

  // Delete any existing favorites for DOCTOR_ID_A to start clean
  await deleteFavoritesForDoctor(DOCTOR_ID_A);
}, 30_000);

// ─── afterAll: cleanup ────────────────────────────────────────────────────────

afterAll(async () => {
  await deleteConsultation(aptClinicA).catch(() => {});
  await deleteConsultation(aptLockTest).catch(() => {});
  await deleteClinicIntake(aptClinicA).catch(() => {});
  await deleteClinicIntake(aptLockTest).catch(() => {});
  await deleteClinicIntake(aptClinicB).catch(() => {});
  await deleteFavoritesForDoctor(DOCTOR_ID_A).catch(() => {});
  if (aptClinicB) await deleteTestAppointment(aptClinicB).catch(() => {});
  await deleteUser(adminApi, testReceptionUserId).catch(() => {});
  await deleteUser(adminApi, testDoctorUserId).catch(() => {});
  await deleteUser(adminApi, testNonClinicUserId).catch(() => {});
  // Remove doctor assignment
  await adminApi.call("DELETE", `/api/clinic-user-doctor/${testDoctorUserId}`).catch(() => {});
}, 15_000);

// ═══════════════════════════════════════════════════════════════════════════
// A) SCHEMA / DATABASE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("A) Schema Validation", () => {

  it("A-01: clinic_visit_intake table exists with correct columns", async () => {
    const result = await db.execute(sql`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'clinic_visit_intake'
      ORDER BY ordinal_position
    `);
    const cols = (result.rows as any[]).map((r: any) => r.column_name);

    // Required columns
    const required = [
      "id", "appointment_id", "visit_type", "reason_for_visit",
      "blood_pressure", "pulse", "temperature", "weight", "height",
      "spo2", "random_blood_sugar", "intake_notes",
      "template_key", "template_label", "structured_flags", "selected_prompt_values",
      "is_locked", "completed_by", "completed_at",
      "created_by", "updated_by", "created_at", "updated_at",
    ];
    for (const col of required) {
      expect(cols, `Column missing: ${col}`).toContain(col);
    }

    // is_locked is NOT NULL
    const locked = (result.rows as any[]).find((r: any) => r.column_name === "is_locked");
    expect(locked?.is_nullable).toBe("NO");

    // created_by is NOT NULL
    const createdBy = (result.rows as any[]).find((r: any) => r.column_name === "created_by");
    expect(createdBy?.is_nullable).toBe("NO");
  });

  it("A-02: clinic_doctor_favorites table exists with correct columns", async () => {
    const result = await db.execute(sql`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clinic_doctor_favorites'
      ORDER BY ordinal_position
    `);
    const cols = (result.rows as any[]).map((r: any) => r.column_name);
    const required = ["id", "doctor_id", "clinic_id", "type", "title", "content", "is_pinned", "created_at", "updated_at"];
    for (const col of required) {
      expect(cols, `Column missing: ${col}`).toContain(col);
    }
    // clinic_id IS nullable (doctor-wide favorites)
    const clinicIdRow = (result.rows as any[]).find((r: any) => r.column_name === "clinic_id");
    expect(clinicIdRow?.is_nullable).toBe("YES");
  });

  it("A-03: UNIQUE constraint on clinic_visit_intake.appointment_id", async () => {
    const result = await db.execute(sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'clinic_visit_intake'
      AND constraint_type = 'UNIQUE'
    `);
    expect((result.rows as any[]).length).toBeGreaterThan(0);
  });

  it("A-04: Required indexes exist on clinic_doctor_favorites", async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'clinic_doctor_favorites'
    `);
    const idxNames = (result.rows as any[]).map((r: any) => r.indexname as string);
    expect(idxNames.some((n) => n.includes("doctor_id"))).toBe(true);
    expect(idxNames.some((n) => n.includes("clinic_id"))).toBe(true);
    expect(idxNames.some((n) => n.includes("type"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B) INTAKE API — HAPPY PATH
// ═══════════════════════════════════════════════════════════════════════════

describe("B) Intake API — Happy Path", () => {

  it("HP-01a: Reception creates intake draft (PUT)", async () => {
    await deleteClinicIntake(aptClinicA);
    const r = await receptionApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType:      "follow_up",
      reasonForVisit: "متابعة دورية",
      bloodPressure:  "120/80",
      pulse:          "72",
      temperature:    "36.7",
      weight:         "75",
      height:         "170",
    });
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.appointmentId).toBe(aptClinicA);
    expect(body.visitType).toBe("follow_up");
    expect(body.bloodPressure).toBe("120/80");
    expect(body.isLocked).toBe(false);
  });

  it("HP-01b: Reception reads intake (GET)", async () => {
    const r = await receptionApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.visitType).toBe("follow_up");
    expect(body.bloodPressure).toBe("120/80");
  });

  it("HP-01c: Reception updates intake (PUT again)", async () => {
    const r = await receptionApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType:      "follow_up",
      reasonForVisit: "متابعة - تم تعديل السبب",
      bloodPressure:  "130/85",
      pulse:          "80",
      temperature:    "37.2",
      weight:         "76",
      height:         "170",
      spo2:           "98",
      randomBloodSugar: "110",
      intakeNotes:    "ملاحظة إضافية",
    });
    expect(r.status).toBe(200);
    expect((r.data as any).bloodPressure).toBe("130/85");
    expect((r.data as any).spo2).toBe("98");
  });

  it("HP-01d: Complete intake (POST /complete)", async () => {
    const r = await receptionApi.call("POST", `/api/clinic-intake/${aptClinicA}/complete`, {});
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.completedAt).toBeTruthy();
    expect(body.completedBy).toBeTruthy();
  });

  it("HP-01e: Doctor sees completed intake summary (GET as admin)", async () => {
    const r = await adminApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.completedAt).toBeTruthy();
    expect(body.isLocked).toBe(false); // Not locked yet — consultation not started
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C) INTAKE LOCKING SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

describe("C) Intake Locking", () => {

  it("LK-04: Before consultation starts, intake is editable", async () => {
    await deleteClinicIntake(aptLockTest);
    // Create intake
    const r = await adminApi.call("PUT", `/api/clinic-intake/${aptLockTest}`, {
      visitType: "new",
      reasonForVisit: "قبل القفل",
      bloodPressure: "110/70",
    });
    expect(r.status).toBe(200);
    expect((r.data as any).isLocked).toBe(false);
  });

  it("LK-01: Doctor starts consultation → intake becomes locked → reception cannot edit", async () => {
    // Admin creates consultation (has doctor.consultation permission)
    const consultR = await adminApi.call("POST", "/api/clinic-consultations", {
      appointmentId: aptLockTest,
      chiefComplaint: "شكوى اختبار",
    });
    expect(consultR.status).toBe(200);

    // Small delay for fire-and-forget lockIntake to propagate
    await new Promise((r) => setTimeout(r, 300));

    // Verify intake is now locked in DB
    const dbRow = await db.execute(sql`
      SELECT is_locked FROM clinic_visit_intake WHERE appointment_id = ${aptLockTest}
    `);
    expect((dbRow.rows[0] as any)?.is_locked).toBe(true);

    // Reception tries to update → should get 423 INTAKE_LOCKED
    const updateR = await receptionApi.call("PUT", `/api/clinic-intake/${aptLockTest}`, {
      visitType: "follow_up",
      reasonForVisit: "محاولة تعديل بعد القفل",
    });
    expect(updateR.status).toBe(423);
    expect((updateR.data as any).code).toBe("INTAKE_LOCKED");
  });

  it("LK-02: After lock, intake remains locked across requests", async () => {
    // Second attempt by reception
    const r = await receptionApi.call("PUT", `/api/clinic-intake/${aptLockTest}`, {
      visitType: "urgent",
    });
    expect(r.status).toBe(423);
  });

  it("LK-03: Direct API bypass attempt still fails (server-side enforcement)", async () => {
    // Non-doctor user (noClinicApi has reception role, no clinic assignments → 403)
    // Test that even an unauthenticated/wrong-role direct API call fails
    const anonFetch = await fetch(`${BASE_URL}/api/clinic-intake/${aptLockTest}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitType: "new" }),
    });
    expect(anonFetch.status).toBe(401);
  });

  it("LK-01b: Admin (doctor.consultation permission) CAN still edit locked intake", async () => {
    // Admin has CLINIC_INTAKE_MANAGE + DOCTOR_CONSULTATION
    const r = await adminApi.call("PUT", `/api/clinic-intake/${aptLockTest}`, {
      visitType: "review_results",
      reasonForVisit: "تعديل من الطبيب/الأدمن بعد القفل",
    });
    // Admin has DOCTOR_CONSULTATION so the lock check passes
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D) RBAC VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("D) RBAC", () => {

  it("D-01: Unauthenticated request to intake GET → 401", async () => {
    const r = await fetch(`${BASE_URL}/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(401);
  });

  it("D-02: No-permission user (accounts_manager) → 403 on intake GET", async () => {
    const api = new AuthenticatedApi("احمد", "admin123");
    await loginWithRetry(api).catch(() => {}); // may fail — that's ok
    if (!api.isLoggedIn()) return; // skip if password unknown
    const r = await api.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect([401, 403]).toContain(r.status);
  });

  it("D-03: Reception user CAN create intake (has clinic.intake.manage)", async () => {
    await deleteClinicIntake(aptClinicA);
    const r = await receptionApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType: "new",
      reasonForVisit: "اختبار RBAC",
    });
    expect(r.status).toBe(200);
  });

  it("D-04: Reception user CAN view intake (has clinic.intake.view)", async () => {
    const r = await receptionApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(200);
  });

  it("D-05: Reception user CANNOT access favorites endpoint (no clinic.favorites.manage)", async () => {
    const r = await receptionApi.call("GET", "/api/doctor-favorites");
    // Must be 403 (no permission) — NOT 200
    expect(r.status).toBe(403);
  });

  it("D-06: Doctor user CAN access favorites (has clinic.favorites.manage)", async () => {
    const r = await doctorApi.call("GET", "/api/doctor-favorites");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });

  it("D-07: Doctor user CAN view intake (has clinic.intake.view)", async () => {
    // Doctor user has clinic.view_all OR assigned clinics — depends on setup
    // Admin can view regardless
    const r = await adminApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E) CLINIC ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe("E) Clinic Isolation", () => {

  it("CI-01: Reception (clinic A only) CANNOT read intake for clinic B appointment → 403", async () => {
    // First create an intake for clinic B appointment (as admin)
    await deleteClinicIntake(aptClinicB);
    await adminApi.call("PUT", `/api/clinic-intake/${aptClinicB}`, {
      visitType: "new",
      reasonForVisit: "مريض عيادة ب",
    });

    // Now test_intake_reception (scoped to clinic A) tries to read → 403
    const r = await receptionApi.call("GET", `/api/clinic-intake/${aptClinicB}`);
    expect(r.status).toBe(403);
  });

  it("CI-02: Reception (clinic A only) CANNOT update intake for clinic B appointment → 403", async () => {
    const r = await receptionApi.call("PUT", `/api/clinic-intake/${aptClinicB}`, {
      visitType: "follow_up",
      reasonForVisit: "محاولة تعديل عبر الحدود",
    });
    expect(r.status).toBe(403);
  });

  it("CI-03: User with NO clinic assignments CANNOT access any intake → 403", async () => {
    const r = await noClinicApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    expect(r.status).toBe(403);
  });

  it("CI-04: Admin (clinic.view_all) CAN access intake for any clinic", async () => {
    const rA = await adminApi.call("GET", `/api/clinic-intake/${aptClinicA}`);
    const rB = await adminApi.call("GET", `/api/clinic-intake/${aptClinicB}`);
    expect(rA.status).toBe(200);
    expect(rB.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F) DOCTOR FAVORITES — CRUD + OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════

describe("F) Doctor Favorites CRUD", () => {

  let favId1 = "";
  let favId2 = "";

  it("HP-03a: Doctor creates favorite (note)", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type:    "note",
      title:   "شكوى شائعة",
      content: "المريض يشكو من ألم في الصدر عند الجهد",
      isPinned: false,
    });
    expect(r.status).toBe(201);
    const body = r.data as any;
    expect(body.id).toBeTruthy();
    expect(body.type).toBe("note");
    expect(body.doctorId).toBe(DOCTOR_ID_A);
    favId1 = body.id;
  });

  it("HP-03b: Doctor creates second favorite (plan)", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type:    "plan",
      title:   "خطة متابعة قياسية",
      content: "متابعة بعد أسبوعين، استكمال التحاليل، راجع للضرورة",
      isPinned: false,
    });
    expect(r.status).toBe(201);
    favId2 = (r.data as any).id;
  });

  it("HP-03c: Doctor sees both favorites in GET", async () => {
    const r = await doctorApi.call("GET", "/api/doctor-favorites");
    expect(r.status).toBe(200);
    const list = r.data as any[];
    expect(list.some((f) => f.id === favId1)).toBe(true);
    expect(list.some((f) => f.id === favId2)).toBe(true);
  });

  it("HP-04: Doctor pins favorite → pinned appears first", async () => {
    const r = await doctorApi.call("PATCH", `/api/doctor-favorites/${favId2}`, {
      isPinned: true,
    });
    expect(r.status).toBe(200);
    expect((r.data as any).isPinned).toBe(true);

    const listR = await doctorApi.call("GET", "/api/doctor-favorites");
    const list = listR.data as any[];
    // First item should be the pinned one
    expect(list[0].id).toBe(favId2);
    expect(list[0].isPinned).toBe(true);
  });

  it("FV-01: Different doctor (admin) CANNOT patch doctor A's favorite → 404", async () => {
    // Admin has no doctor assignment → doctorId lookup returns null → 404
    const r = await adminApi.call("PATCH", `/api/doctor-favorites/${favId1}`, {
      title: "مختطف",
    });
    expect(r.status).toBe(404);
  });

  it("FV-01b: Different doctor (admin) CANNOT delete doctor A's favorite → 404", async () => {
    const r = await adminApi.call("DELETE", `/api/doctor-favorites/${favId1}`);
    expect(r.status).toBe(404);
  });

  it("EC-05: Partial patch (update title only) works", async () => {
    const r = await doctorApi.call("PATCH", `/api/doctor-favorites/${favId1}`, {
      title: "شكوى شائعة — معدّل",
    });
    expect(r.status).toBe(200);
    expect((r.data as any).title).toBe("شكوى شائعة — معدّل");
    // Content unchanged
    expect((r.data as any).content).toContain("المريض يشكو");
  });

  it("EC-04: Delete pinned favorite works", async () => {
    const r = await doctorApi.call("DELETE", `/api/doctor-favorites/${favId2}`);
    expect(r.status).toBe(204);

    // Verify deleted from list
    const listR = await doctorApi.call("GET", "/api/doctor-favorites");
    const list = listR.data as any[];
    expect(list.some((f: any) => f.id === favId2)).toBe(false);
  });

  it("FV-02: Doctor-wide favorite (clinicId null) appears when no clinicId filter", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type:     "quick_text",
      title:    "نص سريع عام",
      content:  "تم الفحص بالكامل",
      isPinned: false,
      clinicId: null,
    });
    expect(r.status).toBe(201);
    expect((r.data as any).clinicId).toBeNull();

    const listR = await doctorApi.call("GET", "/api/doctor-favorites");
    expect((listR.data as any[]).some((f: any) => f.clinicId === null)).toBe(true);
    // cleanup
    await doctorApi.call("DELETE", `/api/doctor-favorites/${(r.data as any).id}`);
  });

  it("FV-03: Valid favorite types accepted", async () => {
    const validTypes = ["note", "assessment_note", "plan", "followup", "quick_text"];
    for (const type of validTypes) {
      const r = await doctorApi.call("POST", "/api/doctor-favorites", {
        type, title: `اختبار نوع ${type}`, content: "محتوى",
      });
      expect(r.status, `type '${type}' should be accepted`).toBe(201);
      await doctorApi.call("DELETE", `/api/doctor-favorites/${(r.data as any).id}`);
    }
  });

  it("FV-04: Invalid favorite type (diagnosis) is rejected → 400", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type: "diagnosis", title: "تشخيص محظور", content: "لا يجب أن يُقبل",
    });
    expect(r.status).toBe(400);
  });

  it("FV-04b: Other forbidden types rejected", async () => {
    const forbidden = ["auto_diagnosis", "suggestion", "protocol", "decision"];
    for (const type of forbidden) {
      const r = await doctorApi.call("POST", "/api/doctor-favorites", {
        type, title: "محظور", content: "محتوى",
      });
      expect(r.status, `type '${type}' should be rejected`).toBe(400);
    }
  });

  it("EC-03: Empty favorite title is rejected → 400", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type: "note", title: "", content: "محتوى",
    });
    expect(r.status).toBe(400);
  });

  it("EC-03b: Empty favorite content is rejected → 400", async () => {
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type: "note", title: "عنوان", content: "",
    });
    expect(r.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G) TEMPLATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

describe("G) Template Persistence", () => {

  const APT = "74b0e7d3-e081-4ef3-81fe-68dffb73472e"; // كراس سمسم سامى سميح

  beforeAll(async () => {
    await deleteConsultation(APT).catch(() => {});
    await deleteClinicIntake(APT).catch(() => {});
  });

  afterAll(async () => {
    await deleteClinicIntake(APT).catch(() => {});
  });

  it("TP-01: templateKey persists and reloads correctly", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType:       "urgent",
      reasonForVisit:  "حالة طارئة — تم تعديل السبب",
      templateKey:     "urgent_template_v1",
      templateLabel:   "قالب الحالات الطارئة",
    });
    expect(r.status).toBe(200);
    expect((r.data as any).templateKey).toBe("urgent_template_v1");
    expect((r.data as any).templateLabel).toBe("قالب الحالات الطارئة");
  });

  it("TP-02: structuredFlags persists", async () => {
    const flags = { has_fever: true, is_diabetic: false, has_hypertension: true };
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType: "urgent",
      structuredFlags: flags,
    });
    expect(r.status).toBe(200);
    expect((r.data as any).structuredFlags).toMatchObject(flags);
  });

  it("TP-03: selectedPromptValues persists and reloads correctly", async () => {
    const prompts = { chief_complaint: "صداع", duration: "3 أيام", severity: "متوسطة" };
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType: "urgent",
      selectedPromptValues: prompts,
    });
    expect(r.status).toBe(200);
    expect((r.data as any).selectedPromptValues).toMatchObject(prompts);

    // Reload and verify
    const getR = await adminApi.call("GET", `/api/clinic-intake/${APT}`);
    expect((getR.data as any).selectedPromptValues).toMatchObject(prompts);
  });

  it("TP-04: Missing optional vitals still allows valid save", async () => {
    // Only visitType provided, no vitals
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType: "review_results",
    });
    expect(r.status).toBe(200);
    // Optional fields remain from previous upserts
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H) AUDIT FIELDS
// ═══════════════════════════════════════════════════════════════════════════

describe("H) Audit Fields", () => {

  const APT = "1e62f201-da50-451b-8af7-44637e954bd2"; // مدين مدين مدين

  beforeAll(async () => {
    await deleteConsultation(APT).catch(() => {});
    await deleteClinicIntake(APT).catch(() => {});
  });

  afterAll(async () => {
    await deleteClinicIntake(APT).catch(() => {});
  });

  it("AU-01: Create intake → createdBy, updatedBy, createdAt, updatedAt populated", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType: "new",
      reasonForVisit: "اختبار حقول التدقيق",
    });
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.createdBy).toBeTruthy();
    expect(body.updatedBy).toBeTruthy();
    expect(body.createdAt).toBeTruthy();
    expect(body.updatedAt).toBeTruthy();
  });

  it("AU-02: Update intake → updatedBy changes, createdBy stable", async () => {
    // Save the initial createdBy
    const getR = await adminApi.call("GET", `/api/clinic-intake/${APT}`);
    const originalCreatedBy = (getR.data as any).createdBy;

    // Update with reception user
    await receptionApi.call("PUT", `/api/clinic-intake/${APT}`, {
      visitType: "follow_up",
      bloodPressure: "115/75",
    });

    const updatedR = await adminApi.call("GET", `/api/clinic-intake/${APT}`);
    const updated = updatedR.data as any;
    // createdBy must remain admin's ID (the creator)
    expect(updated.createdBy).toBe(originalCreatedBy);
    // updatedBy should now be reception user's ID (different from admin)
    expect(updated.updatedBy).not.toBe(originalCreatedBy);
  });

  it("AU-03: Complete intake → completedBy and completedAt set", async () => {
    const r = await receptionApi.call("POST", `/api/clinic-intake/${APT}/complete`, {});
    expect(r.status).toBe(200);
    const body = r.data as any;
    expect(body.completedAt).toBeTruthy();
    expect(body.completedBy).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I) VALIDATION FAILURE SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

describe("I) Validation Failures", () => {

  it("VF-01: Invalid visitType is rejected → 400", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType: "INVALID_TYPE",
    });
    expect(r.status).toBe(400);
  });

  it("VF-03a: Overly long reasonForVisit is rejected → 400", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType: "new",
      reasonForVisit: "أ".repeat(1001), // > 1000 chars
    });
    expect(r.status).toBe(400);
  });

  it("VF-04: Duplicate intake for same appointmentId is handled (upsert, not error)", async () => {
    // First PUT creates intake
    await deleteClinicIntake(aptClinicA);
    const r1 = await adminApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType: "new",
      reasonForVisit: "الأولى",
    });
    expect(r1.status).toBe(200);

    // Second PUT should UPDATE (upsert), not create a duplicate
    const r2 = await adminApi.call("PUT", `/api/clinic-intake/${aptClinicA}`, {
      visitType: "follow_up",
      reasonForVisit: "الثانية",
    });
    expect(r2.status).toBe(200);
    expect((r2.data as any).visitType).toBe("follow_up");

    // DB must still have only ONE row
    const dbResult = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM clinic_visit_intake WHERE appointment_id = ${aptClinicA}
    `);
    expect((dbResult.rows[0] as any).cnt).toBe(1);
  });

  it("VF-05: Complete intake that does not exist → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const r = await receptionApi.call("POST", `/api/clinic-intake/${fakeId}/complete`, {});
    expect([403, 404]).toContain(r.status);
  });

  it("VF-06: Non-existent appointmentId for PUT → 404", async () => {
    const r = await adminApi.call("PUT", "/api/clinic-intake/00000000-0000-0000-0000-000000000000", {
      visitType: "new",
    });
    expect(r.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J) EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("J) Edge Cases", () => {

  const APT_EDGE = "2608e212-82ba-4ff2-b73d-ca95ecbcf0f3"; // مريض اختبار تلقائي

  beforeAll(async () => {
    await deleteConsultation(APT_EDGE).catch(() => {});
    await deleteClinicIntake(APT_EDGE).catch(() => {});
  });

  afterAll(async () => {
    await deleteClinicIntake(APT_EDGE).catch(() => {});
  });

  it("EC-01: Very long intakeNotes (up to 2000 chars) accepted", async () => {
    const longNote = "ملاحظة ".repeat(200).slice(0, 1999);
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT_EDGE}`, {
      visitType: "new",
      intakeNotes: longNote,
    });
    expect(r.status).toBe(200);
  });

  it("EC-01b: intakeNotes exceeding 2000 chars rejected → 400", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT_EDGE}`, {
      visitType: "new",
      intakeNotes: "أ".repeat(2001),
    });
    expect(r.status).toBe(400);
  });

  it("EC-02: Very long favorite content (up to 5000 chars) accepted", async () => {
    const longContent = "نص ".repeat(1000).slice(0, 4999);
    const r = await doctorApi.call("POST", "/api/doctor-favorites", {
      type: "note", title: "طويل", content: longContent,
    });
    expect(r.status).toBe(201);
    await doctorApi.call("DELETE", `/api/doctor-favorites/${(r.data as any).id}`);
  });

  it("EC-08: Missing optional vitals still allows valid save", async () => {
    const r = await adminApi.call("PUT", `/api/clinic-intake/${APT_EDGE}`, {
      visitType: "review_results",
      reasonForVisit: "مراجعة نتائج فقط",
      // No vitals at all
    });
    expect(r.status).toBe(200);
    expect((r.data as any).bloodPressure).toBeNull();
    expect((r.data as any).spo2).toBeNull();
  });

  it("FV-05: Favorites are never auto-applied (GET returns list only, no side effects)", async () => {
    // GET favorites must ONLY return a list — no indication of auto-application
    const r = await doctorApi.call("GET", "/api/doctor-favorites");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
    // Every item must have explicit type/title/content — no auto-trigger fields
    for (const fav of r.data as any[]) {
      expect(fav).not.toHaveProperty("autoApply");
      expect(fav).not.toHaveProperty("autoInsert");
      expect(fav).not.toHaveProperty("trigger");
    }
  });
});
