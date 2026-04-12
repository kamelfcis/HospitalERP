import { db } from "../db";
import { departments, warehouses } from "@shared/schema";
import { asc } from "drizzle-orm";

const CACHE_TTL = 5 * 60_000;

let _departments: any[] = [];
let _departmentsAt = 0;

let _warehouses: any[] = [];
let _warehousesAt = 0;

export async function getCachedDepartments(): Promise<any[]> {
  const now = Date.now();
  if (now - _departmentsAt < CACHE_TTL && _departments.length > 0) {
    return _departments;
  }
  _departments = await db
    .select()
    .from(departments)
    .orderBy(asc(departments.code));
  _departmentsAt = now;
  return _departments;
}

export async function getCachedWarehouses(): Promise<any[]> {
  const now = Date.now();
  if (now - _warehousesAt < CACHE_TTL && _warehouses.length > 0) {
    return _warehouses;
  }
  _warehouses = await db
    .select()
    .from(warehouses)
    .orderBy(asc(warehouses.warehouseCode));
  _warehousesAt = now;
  return _warehouses;
}

export function invalidateDepartmentsCache() {
  _departmentsAt = 0;
}

export function invalidateWarehousesCache() {
  _warehousesAt = 0;
}
