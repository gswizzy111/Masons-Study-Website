"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { authErrorMessage, GENERIC_AUTH_ERROR, RATE_LIMIT_ERROR } from "@/components/profile/auth-errors";
import {
  collectErrors,
  NAME_MAX,
  text,
  validateDisplayName,
  validatePassword,
  type FormState,
} from "@/components/profile/form-state";
import type { NameField, PasswordField } from "./fields";

export async function updateDisplayName(
  _prev: FormState<NameField>,
  formData: FormData,
): Promise<FormState<NameField>> {
  const displayName = text(formData, "displayName").trim().slice(0, NAME_MAX * 2);
  const error = validateDisplayName(displayName);
  if (error) {
    return { status: "error", fieldErrors: { displayName: error }, values: { displayName }, at: Date.now() };
  }

  const { supabase, user } = await requireUser();
  const { error: dbError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" });
  if (dbError) {
    console.error("[settings] updateDisplayName:", dbError.message);
    return {
      status: "error",
      message: "We couldn’t save your name. Try again in a moment.",
      values: { displayName },
      at: Date.now(),
    };
  }

  // Re-render the layout so the header shows the new name.
  refresh();
  return { status: "success", values: { displayName }, at: Date.now() };
}

export async function changePassword(
  _prev: FormState<PasswordField>,
  formData: FormData,
): Promise<FormState<PasswordField>> {
  const currentPassword = text(formData, "currentPassword");
  const newPassword = text(formData, "newPassword");

  const fieldErrors = collectErrors<PasswordField>({
    currentPassword: currentPassword ? undefined : "Enter your current password.",
    newPassword: validatePassword(newPassword, "new password"),
  });
  if (fieldErrors) return { status: "error", fieldErrors, at: Date.now() };
  if (currentPassword === newPassword) {
    return {
      status: "error",
      fieldErrors: { newPassword: "Your new password has to be different from the current one." },
      at: Date.now(),
    };
  }

  const { supabase, user } = await requireUser();
  if (!user.email) {
    return { status: "error", message: "This account has no email, so its password can’t be changed here.", at: Date.now() };
  }

  try {
    // Confirm it's really them before changing the password.
    const { error: checkError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (checkError) {
      if (checkError.code === "invalid_credentials") {
        return {
          status: "error",
          fieldErrors: { currentPassword: "That isn’t your current password." },
          at: Date.now(),
        };
      }
      if (checkError.status === 429) return { status: "error", message: RATE_LIMIT_ERROR, at: Date.now() };
      return { status: "error", message: authErrorMessage(checkError), at: Date.now() };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const message = authErrorMessage(error, "We couldn’t change your password. Try again.");
      if (error.code === "weak_password" || error.code === "same_password") {
        return { status: "error", fieldErrors: { newPassword: message }, at: Date.now() };
      }
      return { status: "error", message, at: Date.now() };
    }
  } catch (err) {
    console.error("[settings] changePassword failed:", err);
    return { status: "error", message: GENERIC_AUTH_ERROR, at: Date.now() };
  }

  return { status: "success", at: Date.now() };
}
