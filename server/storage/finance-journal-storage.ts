/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Finance Journal Storage — Barrel
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يجمع طريقتَي الملفين:
 *  - account-mappings-storage   : CRUD + TTL Cache + getMappingsForTransaction
 *  - journal-generation-storage : buildPatientInvoiceGLLines + generateJournalEntry + batchPost
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import accountMappingsMethods from "./account-mappings-storage";
import journalGenerationMethods from "./journal-generation-storage";

const methods = {
  ...accountMappingsMethods,
  ...journalGenerationMethods,
};

export default methods;
