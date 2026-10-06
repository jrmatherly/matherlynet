import { describe, expect, it } from "vitest";
import { availability, career, gateway, headline, recruiterFacts, work, workGroups, type WorkItem } from "../src/data/profile";

describe("profile data", () => {
  it("has a headline and no placeholder availability copy", () => {
    expect(headline.length).toBeGreaterThan(10);
    if (availability !== null) expect(availability).not.toMatch(/confirm|placeholder|TBD/i);
  });

  it("gives every role a heading and highlights for the changelog", () => {
    for (const role of career) {
      expect(role.heading.length).toBeGreaterThan(0);
      expect(role.highlights.length).toBeGreaterThan(0);
    }
  });

  it("keeps each role's milestones newest first, inside the role's years", () => {
    expect(career[0].milestones?.length).toBeGreaterThan(0);
    for (const role of career) {
      const milestones = role.milestones ?? [];
      milestones.forEach((m, i) => {
        expect(m.year).toMatch(/^20\d\d$/);
        expect(m.heading.length).toBeGreaterThan(0);
        expect(m.highlights.length).toBeGreaterThan(0);
        expect(Number(m.year)).toBeGreaterThan(Number(role.start.slice(-4)));
        if (role.end) expect(Number(m.year)).toBeLessThanOrEqual(Number(role.end.slice(-4)));
        if (i > 0) expect(Number(m.year)).toBeLessThan(Number(milestones[i - 1].year));
      });
    }
  });

  it("keeps the five roles newest first, with \"Mon YYYY\" dates", () => {
    expect(career).toHaveLength(5);
    career.forEach((role, i) => {
      expect(role.start).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
      // Only the current role is open-ended, and each role ends where the next one up starts.
      expect(role.end).toBe(i === 0 ? undefined : career[i - 1].start);
    });
  });

  it("gives every platform a period and a one-line result", () => {
    for (const item of work) {
      expect(item.period).toMatch(/^20\d\d( to (20\d\d|now))?$/);
      expect(item.result.length).toBeLessThanOrEqual(110);
    }
  });

  it("lists each group newest first, AI platform then Infrastructure", () => {
    const rank = (w: WorkItem) => workGroups.indexOf(w.group);
    expect(work.map(rank)).toEqual([...work].sort((a, b) => rank(a) - rank(b)).map(rank));
    for (const group of workGroups) {
      const starts = work.filter((w) => w.group === group).map((w) => Number(w.period.slice(0, 4)));
      expect(starts.length, group).toBeGreaterThan(0);
      expect(starts).toEqual([...starts].sort((a, b) => b - a));
    }
  });

  it("marks exactly one gateway generation as current", () => {
    expect(gateway.generations.filter((g) => g.current)).toHaveLength(1);
    expect(gateway.results).toHaveLength(3);
  });

  it("lists the recruiter screening facts", () => {
    expect(recruiterFacts.map((f) => f.term)).toEqual(["Current title", "Reports to", "Team", "Built", "Location", "Education", "Writes code in"]);
  });
});
