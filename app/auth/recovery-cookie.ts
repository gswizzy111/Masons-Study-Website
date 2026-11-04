// A short-lived, httpOnly marker that the current session came from a
// password reset link. /reset-password only lets you set a password without
// the current one while it is present; otherwise people change it in
// Settings, which asks for the current password.
import type { NextResponse } from "next/server";

export const RECOVERY_COOKIE = "ms_recovery";
const MAX_AGE_SECONDS = 15 * 60;

export function setRecoveryCookie(response: NextResponse, userId: string) {
  response.cookies.set(RECOVERY_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** True when the cookie value marks a reset for this user. */
export function isRecoveryFor(cookieValue: string | undefined, userId: string): boolean {
  return Boolean(cookieValue) && cookieValue === userId;
}
