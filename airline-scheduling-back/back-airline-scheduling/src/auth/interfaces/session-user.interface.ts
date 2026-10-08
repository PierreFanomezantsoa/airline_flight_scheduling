import { UserRole } from '../../users/enums/user-role.enum';

export interface SessionUser {
  refUser: string;
  role: UserRole;
  exp: number;
}
