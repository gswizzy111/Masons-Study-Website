/** Moves focus to the first form control with an error, in form order. */
export function focusFirstError(form: HTMLFormElement | null, errors: object | null | undefined) {
  if (!form || !errors) return;
  const names = new Set(Object.keys(errors).filter((k) => (errors as Record<string, unknown>)[k]));
  if (!names.size) return;
  for (const el of Array.from(form.elements)) {
    const name = (el as HTMLInputElement).name;
    if (name && names.has(name) && el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}
