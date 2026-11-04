"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/profile/form-alert";
import { focusFirstError } from "@/components/profile/focus-first-error";
import { text, validateEmail, type FormState } from "@/components/profile/form-state";
import { requestPasswordReset } from "../actions";
import { AuthCard } from "../auth-card";
import type { ForgotField } from "../fields";

const initial: FormState<ForgotField> = { status: "idle" };

const linkClass = "rounded-xs font-medium text-accent-strong underline-offset-4 hover:underline";

export function ForgotPasswordForm({ notice }: { notice: string | null }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initial);
  const [clientError, setClientError] = useState<string | undefined>(undefined);
  const [dismissedAt, setDismissedAt] = useState<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const sent = state.status === "success" && state.at !== dismissedAt;

  useEffect(() => {
    if (state.fieldErrors) focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const backToLogin = (
    <Link href="/login" className={linkClass}>
      Back to log in
    </Link>
  );

  if (sent) {
    return (
      <div ref={sentRef} tabIndex={-1} className="outline-none">
        <AuthCard
          icon={<MailCheck strokeWidth={1.75} aria-hidden />}
          title="Check your email"
          description={
            <>
              If an account uses{" "}
              <span className="font-medium break-all text-ink">
                {state.values?.email || "that email"}
              </span>
              , we sent it a link to choose a new password.
            </>
          }
          footer={backToLogin}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-2">
              The link works once and expires after a while. It can take a minute to arrive, so
              check your spam folder too. Opening it in this browser works best.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setDismissedAt(state.at)}>
              Try a different email
            </Button>
          </div>
        </AuthCard>
      </div>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const error = validateEmail(text(new FormData(e.currentTarget), "email"));
    setClientError(error);
    if (error) {
      e.preventDefault();
      focusFirstError(e.currentTarget, { email: error });
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we’ll send you a link to choose a new password."
      footer={backToLogin}
    >
      {notice ? (
        <FormAlert tone="info" className="mb-6">
          {notice}
        </FormAlert>
      ) : null}
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
      >
        <Field label="Email" error={clientError ?? state.fieldErrors?.email} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.status === "success" ? "" : (state.values?.email ?? "")}
          />
        </Field>

        <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
          {pending ? "Sending the link" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
