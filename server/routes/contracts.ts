import { type Express } from "express";
import { registerContractCrudRoutes } from "./contracts-crud";
import { registerContractClaimsRoutes } from "./contracts-claims-routes";

export function registerContractRoutes(app: Express) {
  registerContractCrudRoutes(app);
  registerContractClaimsRoutes(app);
}
