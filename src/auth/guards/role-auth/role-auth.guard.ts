import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ROLES_KEY } from 'src/auth/decorators/role.decorator';
import { Role } from 'src/user/enums/role.enum';

@Injectable()
export class RoleAuthGuard implements CanActivate {
	constructor(private reflector: Reflector){};
  canActivate(
    context: ExecutionContext,
  ): boolean  {
	 const requiredRole = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
		 context.getHandler(),
		 context.getClass(),
	 ]);

	 if(!requiredRole) return true;

	const {user} = context.switchToHttp().getRequest();
	if(!user || !user.role) return false;
const hasReuiredRole = requiredRole.some((role) => user.role === role);
return hasReuiredRole;


  }
}
