// Claims the site retired (the 2026-10-30 case-study corrections, section 5, and the earlier tenure fixes). One list,
// so the page, profile, share-card and post checks cannot drift apart. "Go" is not here: it names a language Jason
// uses; profile.test.ts keeps it off the chat platform alone. Nor is "AWS" by itself: the playground's guardrail demo
// names "an AWS access key"; EKS and Bedrock still catch an AWS platform claim.
export const BANNED =
  /nearly 17|Manager of Infrastructure|built it alone|sole builder|single-handedly|14 teams|\b(EKS|Bedrock|Crossplane|GitLab|Datadog|SLOs?|error budgets?)\b/i;
