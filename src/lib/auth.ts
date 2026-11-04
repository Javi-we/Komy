import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const OWNER_ADMIN_EMAIL = "sotgg45@gmail.com";

export function isOwnerAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

export async function getSessionUser(req: NextRequest) {
  const userId =
    req.cookies.get("komaread_user_id")?.value ||
    req.headers.get("x-user-id");

  if (!userId) return null;

  try {
    return await prisma.user.findUnique({
      where: { id: userId },
    });
  } catch {
    return null;
  }
}

export async function verifyAdminRequest(req: NextRequest): Promise<boolean> {
  const user = await getSessionUser(req);
  if (user && isOwnerAdminEmail(user.email)) {
    return true;
  }
  return false;
}
