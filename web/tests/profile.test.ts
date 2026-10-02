import { describe, expect, it } from "vitest";
import { availability, career, gateway, headline, recruiterFacts, samePeriod, work } from "../src/data/profile";

describe("profile data", () => {
  it("has a headline and no placeholder availability copy", () => {
    expect(headline.length).toBeGreaterThan(10);
    if (availability !== null) expect(availability).not.toMatch(/confirm|placeholder|TBD/i);
  });

  it("gives every role a heading and summary for the changelog", () => {
    for (const role of career) {
      expect(role.heading.length).toBeGreaterThan(0);
      expect(role.summary.length).toBeGreaterThan(0);
    }
  });

  it("keeps the five roles the changelog binds by position, newest first, with \"Mon YYYY\" dates", () => {
    expect(career).toHaveLength(5);
    career.forEach((role, i) => {
      expect(role.start).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
      // Only the current role is open-ended, and each role ends where the next one up starts.
      expect(role.end).toBe(i === 0 ? undefined : career[i - 1].start);
    });
  });

  it("gives every platform a period and a one-line result", () => {
    for (const item of work) {
      expect(item.period).toMatch(/^20\d\d to (20\d\d|now)$/);
      expect(item.result.length).toBeLessThanOrEqual(110);
    }
  });

  it("marks exactly one gateway generation as current", () => {
    expect(gateway.generations.filter((g) => g.current)).toHaveLength(1);
    expect(gateway.results).toHaveLength(3);
  });

  it("lists the recruiter screening facts", () => {
    expect(recruiterFacts.map((f) => f.term)).toEqual(["Current title", "Reports to", "Team", "Built", "Location", "Education", "Writes code in"]);
  });

  it("lists the same-period items the changelog shows under the gateway", () => {
    expect(samePeriod.map((s) => s.term)).toEqual(["MCP", "Agents", "Kubernetes", "Rollouts", "Data center", "Team"]);
  });
});
