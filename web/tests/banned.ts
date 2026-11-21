// Claims the site retired. One list, so the page, profile, share-card and post checks cannot drift apart. "Go" is not
// here: it names a language Jason uses; profile.test.ts keeps it off the chat platform alone. Nor is "AWS" by itself:
// the playground's guardrail demo names "an AWS access key"; EKS and Bedrock still catch an AWS platform claim.
export const BANNED =
  /nearly 17|Manager of Infrastructure|built it alone|sole builder|single-handedly|14 teams|2B\+|about 6 ?(B\b|billion)|every (AI request|model call)|who is spending|three questions|policy per use case|single path to|100-plus|two data centers|designed and built (its|the|the new) primary|primary and (DR|disaster recovery)|deployed SonicWALL|led the firewall migrations|Always-On VPN ready|\b(Rancher|AKS|Portworx|EKS|Bedrock|Crossplane|GitLab|Datadog|SLOs?|error budgets?)\b/i;
