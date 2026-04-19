// User profile types
export type UserRole = 'admin' | 'staff' | 'delivery';

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}
