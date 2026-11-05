import { NextRequest, NextResponse } from "next/server";
import { saveUploadedFile, saveBase64Cover } from "@/lib/storage";
import { verifyAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Solo el Administrador puede subir archivos o portadas." },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (body.base64Image) {
        const url = await saveBase64Cover(body.base64Image, body.prefix || "cover");
        return NextResponse.json({ url });
      }
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as "pdfs" | "covers") || "pdfs";

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    const saved = await saveUploadedFile(file, folder);
    return NextResponse.json(saved);
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Error al subir el archivo" },
      { status: 500 }
    );
  }
}
