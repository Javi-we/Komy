"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ShieldCheck,
  ExternalLink,
  Key,
  Mail,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { UserProfile } from "@/types/library";

interface GoogleLoginModalProps {
  onClose: () => void;
  onSuccess: (user: UserProfile, isAdmin: boolean) => void;
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "841774810526-qkeg2tlp2htj5cl6rtrchite3ienqkv7.apps.googleusercontent.com";

declare global {
  interface Window {
    google?: any;
  }
}

export default function GoogleLoginModal({
  onClose,
  onSuccess,
}: GoogleLoginModalProps) {
  const googleButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const [sdkReady, setSdkReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Opciones secundarias plegables
  const [showEmailLogin, setShowEmailLogin] = useState<boolean>(false);
  const [showAdminPin, setShowAdminPin] = useState<boolean>(false);

  const [readerEmail, setReaderEmail] = useState<string>("");
  const [adminPin, setAdminPin] = useState<string>("");

  // Enviar credencial oficial al backend para verificación
  const verifyWithServer = async (payload: {
    credential?: string;
    accessToken?: string;
    adminPin?: string;
    email?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        onSuccess(data.user, Boolean(data.isAdmin));
        onClose();
      } else {
        setError(
          data.error ||
            "No se pudo iniciar sesión. Verifica los datos e intenta de nuevo."
        );
      }
    } catch {
      setError("Error de conexión al verificar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    function initGoogleGsi() {
      if (!window.google?.accounts?.id) return;
      setSdkReady(true);

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            if (response?.credential) {
              verifyWithServer({ credential: response.credential });
            }
          },
          ux_mode: "popup",
          auto_select: false,
        });

        if (googleButtonContainerRef.current) {
          googleButtonContainerRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(
            googleButtonContainerRef.current,
            {
              type: "standard",
              theme: "filled_blue",
              size: "large",
              text: "continue_with",
              shape: "pill",
              logo_alignment: "left",
              width: 320,
            }
          );
        }
      } catch (err) {
        console.error("Error inicializando Google Identity Services:", err);
      }
    }

    if (window.google?.accounts?.id) {
      initGoogleGsi();
      return;
    }

    const existingScript = document.getElementById("google-gsi-client-script");
    if (existingScript) {
      existingScript.addEventListener("load", initGoogleGsi);
      return () => existingScript.removeEventListener("load", initGoogleGsi);
    }

    const script = document.createElement("script");
    script.id = "google-gsi-client-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogleGsi;
    document.head.appendChild(script);
  }, []);

  // Botón emergente oficial de Google OAuth 2.0
  const handleOpenOfficialGooglePopup = () => {
    setError(null);
    if (!window.google?.accounts?.oauth2) {
      setError(
        "Cargando servicios de Google... Intenta de nuevo en un segundo."
      );
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        prompt: "select_account",
        callback: (tokenResponse: any) => {
          if (tokenResponse?.error) {
            setError(
              `Google OAuth: ${
                tokenResponse.error_description || tokenResponse.error
              }`
            );
            return;
          }
          if (tokenResponse?.access_token) {
            verifyWithServer({ accessToken: tokenResponse.access_token });
          }
        },
      });
      tokenClient.requestAccessToken();
    } catch (e: any) {
      setError(
        e?.message || "No se pudo abrir la ventana emergente de Google."
      );
    }
  };

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPin.trim()) return;
    verifyWithServer({ adminPin: adminPin.trim() });
  };

  const handleReaderEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!readerEmail.trim()) return;
    verifyWithServer({ email: readerEmail.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Lock className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-zinc-100 block">
                Iniciar Sesión en Komy
              </span>
              <span className="text-[11px] text-zinc-400 block">
                Tu biblioteca y progreso sincronizados
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-300 text-left space-y-1">
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {/* Sección Principal: Google OAuth */}
          <div className="flex flex-col items-center justify-center gap-3 pt-2">
            <div
              ref={googleButtonContainerRef}
              className="min-h-[44px] flex items-center justify-center"
            />

            <button
              type="button"
              disabled={loading || !sdkReady}
              onClick={handleOpenOfficialGooglePopup}
              className="w-full max-w-[320px] py-3 px-4 rounded-full bg-white hover:bg-zinc-100 disabled:opacity-50 text-zinc-900 font-bold text-xs flex items-center justify-center gap-2.5 shadow-lg transition"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {loading
                  ? "Verificando con Google..."
                  : "Continuar con Google"}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>

          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Acceso seguro mediante Google Identity Services</span>
          </div>

          {/* Divisor */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500 font-semibold">
                Otras opciones
              </span>
            </div>
          </div>

          {/* Opción 1: Entrar con correo (para lectores) */}
          <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setShowEmailLogin(!showEmailLogin);
                if (showAdminPin) setShowAdminPin(false);
              }}
              className="w-full px-4 py-2.5 text-xs text-zinc-300 hover:text-white flex items-center justify-between transition"
            >
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium">Acceder con correo Gmail</span>
              </div>
              {showEmailLogin ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>

            {showEmailLogin && (
              <form
                onSubmit={handleReaderEmailSubmit}
                className="p-3 pt-1 border-t border-zinc-800/60 space-y-2 animate-in fade-in duration-100"
              >
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={readerEmail}
                    onChange={(e) => setReaderEmail(e.target.value)}
                    placeholder="ejemplo@gmail.com"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !readerEmail.trim()}
                  className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  {loading ? "Entrando..." : "Acceder con este correo"}
                </button>
              </form>
            )}
          </div>

          {/* Opción 2: Clave de Administrador (Discreta, sin exponer el PIN) */}
          <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setShowAdminPin(!showAdminPin);
                if (showEmailLogin) setShowEmailLogin(false);
              }}
              className="w-full px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-between transition"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-medium">Acceso Administrativo</span>
              </div>
              {showAdminPin ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>

            {showAdminPin && (
              <form
                onSubmit={handleAdminPinSubmit}
                className="p-3 pt-1 border-t border-zinc-800/60 space-y-2 animate-in fade-in duration-100"
              >
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={10}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Clave de seguridad"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !adminPin.trim()}
                  className="w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow"
                >
                  {loading ? "Verificando..." : "Ingresar"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
