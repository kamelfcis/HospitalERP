import { type Express } from "express";
import { registerContractsManagementContractsRoutes } from "./contracts-management-contracts";
import { registerContractsManagementMembersRoutes } from "./contracts-management-members";

export function registerContractsManagementRoutes(app: Express) {
  registerContractsManagementContractsRoutes(app);
  registerContractsManagementMembersRoutes(app);
}
