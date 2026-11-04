// Field names for the auth forms (kept out of actions.ts, which may only
// export async functions).
export type LoginField = "email" | "password";
export type SignupField = "displayName" | "email" | "password";
export type ForgotField = "email";
export type ResetField = "password";
