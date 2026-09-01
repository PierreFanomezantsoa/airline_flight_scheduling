import { UserRole } from '../../users/enums/user-role.enum';

export interface SessionUser {
  id: string;
  role: UserRole;
  exp: number;
}
