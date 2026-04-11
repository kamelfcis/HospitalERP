import { type Express } from "express";
import { registerContractsCompaniesRoutes } from "./contracts-companies-routes";
import { registerContractsManagementRoutes } from "./contracts-management-routes";

export function registerContractCrudRoutes(app: Express) {
  registerContractsCompaniesRoutes(app);
  registerContractsManagementRoutes(app);
}
