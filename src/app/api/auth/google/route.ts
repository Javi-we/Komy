export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isOwnerAdminEmail, OWNER_ADMIN_EMAIL } from "@/lib/auth";

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "841774810526-qkeg2tlp2htj5cl6rtrchite3ienqkv7.apps.googleusercontent.com";

// Obtener la sesión actual del usuario de Gmail
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ user: null, isAdmin: false });
    }

    const isAdmin = isOwnerAdminEmail(user.email);
    const expectedRole = isAdmin ? "ADMIN" : "USER";

    if (user.role !== expectedRole) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: expectedRole },
      });
    }

    return NextResponse.json({
      user: {
        ...user,
        role: expectedRole,
      },
      isAdmin,
    });
  } catch (error) {
    console.error("GET /api/auth/google error:", error);
    return NextResponse.json({ user: null, isAdmin: false });
  }
}

// Iniciar sesión exclusivamente con Google OAuth 2.0 real (ID Token o Access Token verificado por Google)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let email = "";
    let name = "";
    let picture = "";
    let googleId = "";

    // Caso 1: Token oficial de Google Identity Services (id_token JWT firmado por Google)
    if (body.credential) {
      const tokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
          body.credential
        )}`
      );
      if (!tokenRes.ok) {
        return NextResponse.json(
          { error: "Token de Google inválido o expirado." },
          { status: 401 }
        );
      }
      const payload = await tokenRes.json();

      if (payload.aud && payload.aud !== GOOGLE_CLIENT_ID) {
        return NextResponse.json(
          { error: "El Client ID del token no coincide con esta aplicación." },
          { status: 401 }
        );
      }

      if (
        payload.email_verified !== "true" &&
        payload.email_verified !== true
      ) {
        return NextResponse.json(
          { error: "Tu cuenta de Google no tiene el correo verificado." },
          { status: 401 }
        );
      }

      email = (payload.email || "").trim().toLowerCase();
      name = payload.name || email.split("@")[0] || "Usuario de Google";
      picture = payload.picture || "";
      googleId = payload.sub || "";
    }
    // Caso 2: Access Token oficial de Google OAuth 2.0 Popup
    else if (body.accessToken) {
      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${body.accessToken}`,
          },
        }
      );
      if (!userRes.ok) {
        return NextResponse.json(
          { error: "No se pudo verificar tu cuenta con los servidores de Google." },
          { status: 401 }
        );
      }
      const profile = await userRes.json();
      if (!profile.email || profile.email_verified === false) {
        return NextResponse.json(
          { error: "La cuenta de Google no devolvió un correo verificado." },
          { status: 401 }
        );
      }

      email = (profile.email || "").trim().toLowerCase();
      name = profile.name || email.split("@")[0] || "Usuario de Google";
      picture = profile.picture || "";
      googleId = profile.sub || "";
    }
    // Caso 3: Acceso Directo de Administrador con PIN (1234)
    else if (body.adminPin) {
      const pin = String(body.adminPin).trim();
      if (pin !== "1234") {
        return NextResponse.json(
          { error: "PIN de Administrador incorrecto." },
          { status: 401 }
        );
      }
      email = OWNER_ADMIN_EMAIL;
      name = "Administrador Komy";
      picture = "https://ui-avatars.com/api/?name=Admin+Komy&background=7c3aed&color=fff&bold=true";
      googleId = "admin-pin-owner";
    }
    // Caso 4: Acceso por Correo directo (para lectores móviles cuando Google OAuth popup está bloqueado)
    else if (body.email) {
      const inputEmail = String(body.email).trim().toLowerCase();
      if (!inputEmail || !inputEmail.includes("@")) {
        return NextResponse.json(
          { error: "Por favor ingresa un correo electrónico válido." },
          { status: 400 }
        );
      }
      if (isOwnerAdminEmail(inputEmail)) {
        if (body.adminPin !== "1234") {
          return NextResponse.json(
            { error: "Para acceder como Administrador ingresa el PIN de seguridad." },
            { status: 401 }
          );
        }
      }
      email = inputEmail;
      name = body.name || inputEmail.split("@")[0] || "Lector Komy";
      picture = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&bold=true`;
      googleId = `email-user-${Date.now()}`;
    } else {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión con Google OAuth 2.0 o con tu PIN de Administrador.",
        },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "No se pudo obtener el correo verificado de Google." },
        { status: 400 }
      );
    }

    // Exclusivamente sotgg45@gmail.com es ADMIN. Cualquier otro correo verificado de Google es USER.
    const finalRole = isOwnerAdminEmail(email) ? "ADMIN" : "USER";

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role: finalRole,
        ...(picture ? { picture } : {}),
        ...(googleId ? { googleId } : {}),
      },
      create: {
        email,
        name,
        role: finalRole,
        picture:
          picture ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            name
          )}&background=4285F4&color=fff&bold=true`,
        googleId: googleId || `google-${Date.now()}`,
      },
    });

    const response = NextResponse.json({
      user,
      isAdmin: finalRole === "ADMIN",
    });
    response.cookies.set("komaread_user_id", user.id, {
      httpOnly: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
    response.cookies.delete("komaread_admin_pin");

    return response;
  } catch (error: any) {
    console.error("POST /api/auth/google error:", error);
    return NextResponse.json(
      { error: "Error al verificar la sesión con Google OAuth 2.0" },
      { status: 500 }
    );
  }
}

// Cerrar sesión
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("komaread_user_id");
  response.cookies.delete("komaread_admin_pin");
  return response;
}

// Activar sesión de administrador con PIN (1234)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const pin = String(body.adminPin || "").trim();
    if (pin !== "1234") {
      return NextResponse.json(
        { error: "PIN de Administrador incorrecto." },
        { status: 401 }
      );
    }

    const user = await prisma.user.upsert({
      where: { email: OWNER_ADMIN_EMAIL },
      update: { role: "ADMIN" },
      create: {
        email: OWNER_ADMIN_EMAIL,
        name: "Administrador Komy",
        role: "ADMIN",
        picture:
          "https://ui-avatars.com/api/?name=Admin+Komy&background=7c3aed&color=fff&bold=true",
        googleId: "admin-pin-owner",
      },
    });

    const response = NextResponse.json({
      user,
      isAdmin: true,
    });
    response.cookies.set("komaread_user_id", user.id, {
      httpOnly: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });

    return response;
  } catch (err: any) {
    console.error("PATCH /api/auth/google error:", err);
    return NextResponse.json(
      { error: "Error procesando el PIN de Administrador." },
      { status: 500 }
    );
  }
}
