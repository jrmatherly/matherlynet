import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// start.mjs is the image's entry. Run without APPDB_URI, a value the SMTP check lets through stops one step later, at
// migrate.mjs's own error, so the output tells the two apart.
function start(smtpUrl: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env, SMTP_URL: smtpUrl };
  delete env.APPDB_URI;
  if (smtpUrl === undefined) delete env.SMTP_URL;
  const run = spawnSync(process.execPath, ["start.mjs"], { cwd: fileURLToPath(new URL("..", import.meta.url)), env, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

describe("start.mjs and SMTP_URL", () => {
  it.each([
    ["a bare host", "smtp.mail.me.com"],
    ["no scheme, with a password", "user:hunter2@smtp.example.com"],
    ["another scheme", "http://user:hunter2@smtp.example.com"],
    ["a leading space", " smtp://user:hunter2@smtp.example.com:587"],
  ])("refuses %s as not an smtp URL, without printing it", (_, value) => {
    const { status, output } = start(value);
    expect(status).toBe(1);
    expect(output).toContain("start: SMTP_URL is not an smtp:// or smtps:// URL");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("smtp.mail.me.com");
  });

  it.each([
    ["an unencoded / in the password", "smtp://user:hunt/er2@smtp.example.com:587"],
    ["an unencoded # in the password", "smtp://user:hunt#er2@smtp.example.com:587"],
    ["a port out of range", "smtp://user:hunter2@smtp.example.com:99999"],
    ["a scheme with no host", "smtp:"],
  ])("refuses %s as not parsing, without printing it", (_, value) => {
    const { status, output } = start(value);
    expect(status).toBe(1);
    expect(output).toContain("start: SMTP_URL does not parse as a URL with a host");
    expect(output).not.toContain("er2");
  });

  it.each([
    ["unset", undefined],
    ["blank, the chart's default", ""],
    ["smtp with STARTTLS", "smtp://user%40icloud.com:hunter2@smtp.mail.me.com:587?requireTLS=true"],
    ["smtps", "smtps://user:hunter2@smtp.example.com:465"],
    ["an upper-case scheme", "SMTP://user:hunter2@smtp.example.com:587"],
    ["a percent-encoded / in the password", "smtp://user:hunt%2Fer2@smtp.example.com:587"],
  ])("lets %s through to migrate.mjs", (_, value) => {
    const { status, output } = start(value);
    expect(status).toBe(1);
    expect(output).toContain("migrate: APPDB_URI is not set");
    expect(output).not.toContain("SMTP_URL");
  });
});
