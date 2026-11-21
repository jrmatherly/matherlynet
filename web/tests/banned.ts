// Claims the site retired (the 2026-10-30 case-study corrections, section 5, the earlier tenure fixes, and the
// 2026-11-21 true-up: the DevOps team's Rancher and AKS, Portworx, the 2B+ and "about 6B" token figures, company-wide
// "every model call" claims, the "questions the business asked" retirement reason, two built data centers). One list,
// so the page, profile, share-card and post checks cannot drift apart. "Go" is not here: it names a language Jason
// uses; profile.test.ts keeps it off the chat platform alone. Nor is "AWS" by itself: the playground's guardrail demo
// names "an AWS access key"; EKS and Bedrock still catch an AWS platform claim.
export const BANNED =
  /nearly 17|Manager of Infrastructure|built it alone|sole builder|single-handedly|14 teams|2B\+|about 6 ?(B|billion)|every (AI|model) (request|call) at|who is spending|three questions|single path to|100-plus|two data centers|deployed SonicWALL|\b(Rancher|AKS|Portworx|EKS|Bedrock|Crossplane|GitLab|Datadog|SLOs?|error budgets?)\b/i;
