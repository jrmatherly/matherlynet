import { expect } from "@playwright/test";

// Waits for the newest email to `to` with `subject` in Mailpit and returns the first link containing `path`.
export async function linkFromEmail(to: string, subject: string, path: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL!;
  let text = "";
  await expect(async () => {
    const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
    const { messages } = (await (await fetch(`${mailpit}/api/v1/search?query=${query}`)).json()) as { messages: { ID: string }[] };
    expect(messages.length).toBeGreaterThan(0);
    ({ Text: text } = (await (await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string });
  }).toPass({ timeout: 20_000 });
  const link = text.match(new RegExp(`https?://\\S*${path}\\S*`))?.[0];
  expect(link, `a ${path} link in "${subject}"`).toBeTruthy();
  return link!;
}
