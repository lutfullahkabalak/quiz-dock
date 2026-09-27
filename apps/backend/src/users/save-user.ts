import type { User, UserRole } from '@prisma/client';
import type { AuthPrincipal } from '../auth/auth-provider';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The user row of `principal` with `roles`, written only when something changed:
 * the auth guard reads the user on every request, and would otherwise write it
 * back each time (every media fetched, every editor save).
 */
export async function saveUser(
  prisma: PrismaService,
  principal: AuthPrincipal,
  roles: UserRole[],
  existing: User | null,
): Promise<User> {
  if (
    existing &&
    existing.displayName === principal.displayName &&
    existing.email === principal.email &&
    sameRoles(existing.roles, roles)
  ) {
    return existing;
  }
  return prisma.user.upsert({
    where: { oidcSubject: principal.sub },
    create: {
      oidcSubject: principal.sub,
      displayName: principal.displayName,
      email: principal.email,
      roles,
    },
    update: { displayName: principal.displayName, email: principal.email, roles },
  });
}

function sameRoles(a: UserRole[], b: UserRole[]): boolean {
  return a.length === b.length && a.every((r) => b.includes(r));
}
