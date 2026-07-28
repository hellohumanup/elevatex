export function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("email address is already registered")
  ) {
    return "Este email ya está registrado. Inicia sesión o recupera tu contraseña.";
  }

  if (
    normalized.includes("password should be at least") ||
    normalized.includes("password is too weak") ||
    normalized.includes("weak password") ||
    normalized.includes("signup_disabled")
  ) {
    return "La contraseña es demasiado débil. Usa al menos 6 caracteres.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos. Verifica tus credenciales.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Debes confirmar tu email antes de iniciar sesión.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  }

  if (normalized.includes("fetch") || normalized.includes("network")) {
    return "No se pudo conectar con el servicio de autenticación.";
  }

  return message;
}
