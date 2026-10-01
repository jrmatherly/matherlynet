import { describe, expect, it } from "vitest";
import { isPrivateAddress, parseSettingsForm } from "../src/lib/settings-form";

const DSN = "https://abc123@o1.ingest.sentry.io/4507";
const SITE_ID = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ theme: "pro", proPalette: "merlot", ...fields })) data.set(key, value);
  return data;
};

describe("parseSettingsForm", () => {
  it("accepts a complete form", () => {
    const result = parseSettingsForm(
      form({ sentryDsn: DSN, sentryServer: "on", umamiScriptUrl: "https://stats.example.com/script.js", umamiWebsiteId: SITE_ID, umamiEnabled: "on" }),
    );
    expect(result).toEqual({
      settings: {
        theme: "pro",
        proPalette: "merlot",
        sentry: { dsn: DSN, server: true, browser: false },
        umami: { enabled: true, scriptUrl: "https://stats.example.com/script.js", websiteId: SITE_ID },
      },
    });
  });

  it("stores blank optional fields as null with everything off", () => {
    expect(parseSettingsForm(form({}))).toMatchObject({
      settings: { sentry: { dsn: null, server: false, browser: false }, umami: { enabled: false, scriptUrl: null, websiteId: null } },
    });
  });

  it.each([
    ["an unknown palette", { proPalette: "nope" }],
    ["a DSN without a key", { sentryDsn: "https://o1.ingest.sentry.io/4507" }],
    ["a DSN without a project id", { sentryDsn: "https://abc@o1.ingest.sentry.io/" }],
    ["a javascript: script URL", { umamiScriptUrl: "javascript:alert(1)" }],
    ["a website id that isn't a UUID", { umamiWebsiteId: "<script>" }],
    ["reporting switched on without a DSN", { sentryBrowser: "on" }],
    ["analytics switched on without a website id", { umamiEnabled: "on", umamiScriptUrl: "https://stats.example.com/script.js" }],
  ])("rejects %s", (_name, fields) => {
    expect(parseSettingsForm(form(fields))).toHaveProperty("error");
  });

  it.each([
    ["a plain-http script URL", { umamiScriptUrl: "http://stats.example.com/script.js" }],
    ["a plain-http DSN", { sentryDsn: "http://k@o1.ingest.sentry.io/1" }],
    ...["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "0.0.0.0", "100.64.0.1", "localhost", "localhost.", "LOCALHOST", "sentry.localhost", "2130706433"].map(
      (host) => [`a DSN on ${host}`, { sentryDsn: `https://k@${host}/1` }] as [string, Record<string, string>],
    ),
    ...["[::1]", "[::]", "[::ffff:127.0.0.1]", "[fd00::1]", "[fe80::1]", "[64:ff9b::10.0.0.5]", "[2002:a00:5::1]"].map(
      (host) => [`a DSN on ${host}`, { sentryDsn: `https://k@${host}/1` }] as [string, Record<string, string>],
    ),
  ])("rejects %s", (_name, fields) => {
    expect(parseSettingsForm(form(fields))).toHaveProperty("error");
  });

  it("accepts a local Umami over plain http", () => {
    expect(parseSettingsForm(form({ umamiScriptUrl: "http://localhost:3000/script.js" }))).toHaveProperty("settings");
    expect(parseSettingsForm(form({ umamiScriptUrl: "http://127.0.0.1:3000/script.js" }))).toHaveProperty("settings");
  });

  it("accepts public DSN hosts that merely look numeric or private", () => {
    for (const host of ["o1.ingest.sentry.io", "10.example.com", "172.32.0.1", "[2001:db8::1]"]) {
      expect(parseSettingsForm(form({ sentryDsn: `https://k@${host}/1` }))).toHaveProperty("settings");
    }
  });
});

describe("isPrivateAddress", () => {
  it("flags private, loopback, link-local and shared addresses", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "100.127.255.254",
      "::", "::1", "fd00::1", "fe80::1", "fec0::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("flags IPv6 forms that carry or tunnel to a private IPv4 address", () => {
    for (const ip of [
      "::ffff:10.0.0.5", "::ffff:a00:5", "0:0:0:0:0:ffff:a00:5", // IPv4-mapped, any text form
      "::a00:5", "::10.0.0.5", // IPv4-compatible (deprecated)
      "64:ff9b::a00:5", "64:ff9b::10.0.0.5", "64:ff9b:1::a00:5", // NAT64 well-known and local-use prefixes
      "2002:a00:5::1", // 6to4
      "2001:0:4136:e378::1", // Teredo
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("passes public addresses, including NAT64 and 6to4 forms of public IPv4", () => {
    for (const ip of [
      "104.16.0.1", "100.63.255.255", "100.128.0.1", "172.32.0.1", "2606:4700::1111", "2001:db8::1",
      "2a00:1450:4001::200e", "::ffff:104.16.0.1", "::ffff:6810:1", "64:ff9b::6810:1", "2002:6810:1::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
