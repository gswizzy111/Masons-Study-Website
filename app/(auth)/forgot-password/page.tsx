import type { Metadata } from "next";
import { linkErrorMessage } from "../link-errors";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const notice = linkErrorMessage(Array.isArray(error) ? error[0] : error);
  return <ForgotPasswordForm notice={notice} />;
}
