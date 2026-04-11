import { Express } from "express";
import { registerItemsExportTemplate } from "./items-export-template";
import { registerItemsImportUpload } from "./items-import-upload";

export function registerItemsImportExport(app: Express, _storage: any) {
  registerItemsExportTemplate(app, _storage);
  registerItemsImportUpload(app, _storage);
}
