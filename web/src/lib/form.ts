// Tailwind class sets shared by the account forms.
// border-muted: the control's edge needs 3:1 against the card, which border-border doesn't reach (about 1.3:1);
// muted is held to 4.5:1 on every surface by theme.test.ts. text-base on phones: iOS zooms into inputs under 16px.
export const field =
  "w-full rounded-lg border border-muted bg-background px-3 py-2.5 text-base font-normal placeholder:text-muted focus:border-accent sm:text-sm";
export const label = "grid gap-1.5 text-sm font-semibold";
export const hint = "text-xs font-normal text-muted";
export const primary = "rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60";
export const secondary = "rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60";
export const textLink = "font-semibold text-accent hover:underline";

// Page scripts: the submit button stays disabled while the request runs, so a double tap sends it once.
export async function whileBusy<T>(form: HTMLFormElement, work: () => Promise<T>): Promise<T> {
  const button = form.querySelector<HTMLButtonElement>("button:not([type=button])");
  if (button) button.disabled = true;
  try {
    return await work();
  } finally {
    if (button) button.disabled = false;
  }
}
