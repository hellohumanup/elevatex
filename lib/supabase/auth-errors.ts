export function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos. Verifica tus credenciales.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Debes confirmar tu email antes de iniciar sesión.";
  }

  if (normalized.includes("fetch")) {
    return "No se pudo conectar con el servicio de autenticación.";
  }

  return message;
}
