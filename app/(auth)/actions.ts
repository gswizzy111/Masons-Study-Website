"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { siteUrlFrom } from "@/lib/env";
import { isAllowedEmail, NOT_ALLOWED_MESSAGE } from "@/lib/access";
import { createClient, getUser, safeNextPath } from "@/lib/supabase/server";
import { authErrorMessage, GENERIC_AUTH_ERROR } from "@/components/profile/auth-errors";
import {
  collectErrors,
  NAME_MAX,
  text,
  validateDisplayName,
  validateEmail,
  validatePassword,
  type FormState,
} from "@/components/profile/form-state";
import { isRecoveryFor, RECOVERY_COOKIE } from "@/app/auth/recovery-cookie";
import type { ForgotField, LoginField, ResetField, SignupField } from "./fields";

/** The origin the request came from, for building auth email links. */
async function requestOrigin(): Promise<string | undefined> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin && origin !== "null") return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(
  _prev: FormState<LoginField>,
  formData: FormData,
): Promise<FormState<LoginField>> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  const next = safeNextPath(text(formData, "next"));

  const fieldErrors = collectErrors<LoginField>({
    email: validateEmail(email),
    password: password ? undefined : "Enter your password.",
  });
  if (fieldErrors) return { status: "error", fieldErrors, values: { email }, at: Date.now() };

  let onboarded = true;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return {
        status: "error",
        message: authErrorMessage(error, "We couldn’t log you in. Try again in a moment."),
        values: { email },
        at: Date.now(),
      };
    }
    // Logins are shared with another app in the same Supabase project.
    if (!isAllowedEmail(data.user.email)) {
      await supabase.auth.signOut();
      return { status: "error", message: NOT_ALLOWED_MESSAGE, values: { email }, at: Date.now() };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", data.user.id)
      .maybeSingle<{ onboarded_at: string | null }>();
    onboarded = Boolean(profile?.onboarded_at);
  } catch {
    return { status: "error", message: GENERIC_AUTH_ERROR, values: { email }, at: Date.now() };
  }

  // redirect() throws, so it stays outside the try block.
  redirect(onboarded ? (next ?? "/dashboard") : "/onboarding");
}

export async function signUp(
  _prev: FormState<SignupField>,
  formData: FormData,
): Promise<FormState<SignupField>> {
  const displayName = text(formData, "displayName").trim().slice(0, NAME_MAX * 2);
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  const values = { displayName, email };

  const fieldErrors = collectErrors<SignupField>({
    displayName: validateDisplayName(displayName),
    email: validateEmail(email),
    password: validatePassword(password),
  });
  if (fieldErrors) return { status: "error", fieldErrors, values, at: Date.now() };
  if (!isAllowedEmail(email)) {
    return {
      status: "error",
      fieldErrors: { email: "This email can't make an account on Mason's Study." },
      values,
      at: Date.now(),
    };
  }

  let hasSession = false;
  try {
    const supabase = await createClient();
    const emailRedirectTo = `${siteUrlFrom(await requestOrigin())}/auth/callback?next=/onboarding`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo, data: { display_name: displayName } },
    });
    if (error) {
      const message = authErrorMessage(error, "We couldn’t create your account. Try again in a moment.");
      if (error.code === "weak_password") {
        return { status: "error", fieldErrors: { password: message }, values, at: Date.now() };
      }
      if (error.code === "email_address_invalid") {
        return { status: "error", fieldErrors: { email: message }, values, at: Date.now() };
      }
      const code =
        error.code === "user_already_exists" || error.code === "email_exists"
          ? "account_exists"
          : undefined;
      return { status: "error", message, code, values, at: Date.now() };
    }
    hasSession = Boolean(data.session);
  } catch {
    return { status: "error", message: GENERIC_AUTH_ERROR, values, at: Date.now() };
  }

  if (hasSession) redirect("/onboarding");

  // Email confirmation is on: the account exists but needs the link.
  // (Supabase answers the same way for an email that is already
  // registered, so this never reveals which emails have accounts.)
  return { status: "success", values, at: Date.now() };
}

export async function requestPasswordReset(
  _prev: FormState<ForgotField>,
  formData: FormData,
): Promise<FormState<ForgotField>> {
  const email = text(formData, "email").trim();
  const emailError = validateEmail(email);
  if (emailError) {
    return { status: "error", fieldErrors: { email: emailError }, values: { email }, at: Date.now() };
  }

  try {
    const supabase = await createClient();
    const redirectTo = `${siteUrlFrom(await requestOrigin())}/auth/callback?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) console.error("[auth] resetPasswordForEmail:", error.code ?? error.message);
  } catch (err) {
    console.error("[auth] resetPasswordForEmail failed:", err);
  }

  // Always the same answer, so this form never reveals which emails have accounts.
  return { status: "success", values: { email }, at: Date.now() };
}

export async function updatePassword(
  _prev: FormState<ResetField>,
  formData: FormData,
): Promise<FormState<ResetField>> {
  const password = text(formData, "password");
  const passwordError = validatePassword(password, "new password");
  if (passwordError) return { status: "error", fieldErrors: { password: passwordError }, at: Date.now() };

  const user = await getUser();
  const cookieStore = await cookies();
  if (!user || !isRecoveryFor(cookieStore.get(RECOVERY_COOKIE)?.value, user.id)) {
    return {
      status: "error",
      message: "Your reset link has expired. Ask for a new one to choose a password.",
      code: "link_expired",
      at: Date.now(),
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const message = authErrorMessage(error, "We couldn’t save your new password. Try again.");
      if (error.code === "weak_password" || error.code === "same_password") {
        return { status: "error", fieldErrors: { password: message }, at: Date.now() };
      }
      return { status: "error", message, at: Date.now() };
    }
  } catch {
    return { status: "error", message: GENERIC_AUTH_ERROR, at: Date.now() };
  }

  cookieStore.delete(RECOVERY_COOKIE);
  redirect("/dashboard");
}
