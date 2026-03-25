export interface UserData {
  id:                          string;
  username:                    string;
  fullName:                    string;
  role:                        string;
  departmentId:                string | null;
  pharmacyId:                  string | null;
  isActive:                    boolean;
  cashierGlAccountId:          string | null;
  cashierVarianceAccountId:    string | null;
  defaultWarehouseId:          string | null;
  defaultPurchaseWarehouseId:  string | null;
  createdAt:                   string;
}

export interface UserFormData {
  username:                    string;
  password:                    string;
  fullName:                    string;
  role:                        string;
  departmentId:                string;
  pharmacyId:                  string;
  isActive:                    boolean;
  cashierGlAccountId:          string;
  cashierVarianceAccountId:    string;
  defaultWarehouseId:          string;
  defaultPurchaseWarehouseId:  string;
  allowedPharmacyIds:          string[];
  allowedDepartmentIds:        string[];
  allowedClinicIds:            string[];
  hasAllUnits:                 boolean;
}
