import { Role } from 'src/user/enums/role.enum';

export interface CurrentUser {
  id: number;
  role: Role;
  firstName: string;
  lastName?: string | null;
  email: string;
  avatarUrl: string;
}
