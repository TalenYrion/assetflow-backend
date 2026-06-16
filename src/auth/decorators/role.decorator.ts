import { SetMetadata } from "@nestjs/common";
import { Role } from "src/user/enums/role.enum";


export const ROLES_KEY = 'role';
export const Roles = (...role:[Role, ...Role[]]) => SetMetadata(ROLES_KEY, role);
