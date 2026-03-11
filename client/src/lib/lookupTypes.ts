export interface LookupItem {
  id: string;
  name: string;
  code?: string;
  subtitle?: string;
  isActive?: boolean;
  meta?: Record<string, unknown>;
}

export interface LookupResult {
  items: LookupItem[];
  total?: number;
}
