// Tailwind class sets shared by pages and components.
// border-muted: the control's edge needs 3:1 against the card, which border-border doesn't reach (about 1.3:1);
// muted is held to 4.5:1 on every surface by theme.test.ts. text-base on phones: iOS zooms into inputs under 16px.
export const field =
  "w-full rounded-lg border border-muted bg-background px-3 py-2.5 text-base font-normal placeholder:text-muted focus:border-accent sm:text-sm";
export const label = "grid gap-1.5 text-sm font-semibold";
export const hint = "text-xs font-normal text-muted";
export const primary = "rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60";
export const secondary = "rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60";
export const textLink = "font-semibold text-accent hover:underline";
export const inlineLink = "text-foreground underline decoration-accent decoration-2 underline-offset-4";
// A radio-chip label; each use sets its own padding.
export const choice =
  "cursor-pointer rounded-lg border border-border/60 font-medium text-muted transition-[color,background-color] hover:text-foreground has-checked:border-border has-checked:bg-surface has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";
export const badge = "ms-1 inline-block rounded-full border border-border px-1.5 text-[10px] font-medium whitespace-nowrap not-italic";

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
