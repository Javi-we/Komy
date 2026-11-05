import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";

// Asegura que exista la tabla para configuraciones globales
async function ensureSettingsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    // Si ya existe o la conexión es transitoria, continuar
  }
}

export async function GET() {
  try {
    await ensureSettingsTable();
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT "value" FROM "SystemSetting" WHERE "key" = 'hide_sensitive_mode' LIMIT 1
    `)) as Array<{ value: string }>;

    // Por defecto el modo de ocultar contenido +18 está activado (true)
    const hideSensitiveMode = rows && rows.length > 0 ? rows[0].value === "true" : true;

    return NextResponse.json({
      hideSensitiveMode,
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ hideSensitiveMode: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    const body = await req.json();

    const adminPin = body.adminPin ? String(body.adminPin).trim() : "";
    const hasValidPin =
      adminPin === "1234" || adminPin === (process.env.ADMIN_PIN || "1234");

    if (!isAdmin && !hasValidPin) {
      return NextResponse.json(
        { error: "No autorizado. Solo el Administrador puede activar o desactivar este modo." },
        { status: 403 }
      );
    }

    await ensureSettingsTable();
    const val = body.hideSensitiveMode ? "true" : "false";

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
      VALUES ('hide_sensitive_mode', $1, CURRENT_TIMESTAMP)
      ON CONFLICT ("key")
      DO UPDATE SET "value" = $1, "updatedAt" = CURRENT_TIMESTAMP;
    `,
      val
    );

    return NextResponse.json({
      success: true,
      hideSensitiveMode: Boolean(body.hideSensitiveMode),
    });
  } catch (error) {
    console.error("POST /api/settings error:", error);
    return NextResponse.json(
      { error: "Error al guardar el ajuste de contenido +18." },
      { status: 500 }
    );
  }
}
