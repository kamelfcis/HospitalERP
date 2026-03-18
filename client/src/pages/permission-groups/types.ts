export interface GroupSummary {
  id:              string;
  name:            string;
  description:     string | null;
  isSystem:        boolean;
  systemKey:       string | null;   // مفتاح الدور الأصلي (owner, pharmacist…)
  memberCount:     number;
  permissionCount: number;
  createdAt:       string;
}

export interface GroupMember {
  id:       string;
  fullName: string;
  username: string;
}

export interface GroupDetail extends GroupSummary {
  permissions: string[];
  members:     GroupMember[];
}

export interface UserRow {
  id:       string;
  username: string;
  fullName: string;
  role:     string;
  isActive: boolean;
}
