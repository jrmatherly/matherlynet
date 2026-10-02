import { describe, expect, it, vi } from "vitest";
import { ogImage } from "../src/lib/og";
import { GET } from "../src/pages/og/[slug].png";
import { paletteColors } from "../src/theme/colors";

vi.mock("../src/lib/site-settings", () => ({ getSiteSettings: vi.fn(async () => ({ theme: "pro", proPalette: "paper" })) }));

describe("ogImage", () => {
  it("versions the card URL by the palette it will render with", () => {
    expect(ogImage("home", { theme: "pro", proPalette: "paper" })).toBe("/og/home.png?v=paper");
    // A Brand site gets a Signal card, not a Pro one.
    expect(ogImage("home", { theme: "brand", proPalette: "paper" })).toBe("/og/home.png?v=signal");
  });
});

const call = (slug: string) => GET({ params: { slug } } as unknown as Parameters<typeof GET>[0]) as Promise<Response>;

describe("paletteColors", () => {
  it("reads either side of a palette's light-dark() pairs from palettes.css", () => {
    expect(paletteColors("amber", "dark")).toMatchObject({ bg: "#0c0c0b", text: "#f3f1ea", accent: "#f5a524" });
    expect(paletteColors("amber", "light").bg).toBe("#faf9f6");
  });

  it("rejects unknown palettes", () => {
    expect(() => paletteColors("nope", "dark")).toThrow("Unknown palette");
    // Regex metacharacters are matched literally, not compiled (CodeQL js/regex-injection).
    expect(() => paletteColors("(a+)+$", "dark")).toThrow("Unknown palette");
  });
});

describe("/og/[slug].png", () => {
  it("renders a 1200x630 PNG for a known card", async () => {
    const res = await call("home");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // IHDR: width and height are big-endian at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("returns 404 for unknown cards instead of rendering arbitrary text", async () => {
    expect((await call("<script>")).status).toBe(404);
  });

  it("returns 404 for names inherited from Object.prototype", async () => {
    for (const slug of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect((await call(slug)).status).toBe(404);
  });
});
