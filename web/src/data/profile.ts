// Site copy drawn from Jason's résumé (resume.matherly.net/jason/matherly). Edit facts here, not in pages.
// Contact details are deliberately absent: LinkedIn and the résumé link handle contact.
import { person } from "../lib/site";

export const resumeUrl = "https://resume.matherly.net/jason/matherly";

export const headline = "I run the platform 15,000 people's AI goes through.";
export const intro =
  "Seventeen years at The Aaron's Company, from store networks to the company's AI Gateway, MCP platform and Kubernetes clusters, with security, governance and cost accounting designed in from the start.";
// Rendered only when set. Jason supplies the wording (roles, remote/Atlanta, timing).
export const availability: string | null = null;
export const contact = { label: "Message me on LinkedIn", href: person.sameAs[0] } as const;

export const gateway = {
  title: "AI Gateway",
  summary:
    "Started as a quick way to give teams safe access to models. Each generation was replaced when it could no longer answer the questions the business asked: who is spending what, on which model, and under which rules.",
  generations: [
    { name: "LiteLLM", note: "Fast to stand up, proved demand. Couldn't attribute cost per team or enforce policy per use case.", current: false },
    { name: "Azure API Management", note: "Added SSO and rate limits. Routing and guardrails were awkward to express, and licensing costs grew with usage.", current: false },
    {
      name: "In-house platform",
      note: "SSO, per-user and per-team cost accounting, rate limiting, guardrails, model routing across Azure AI Foundry and Anthropic, audit logging.",
      current: true,
    },
  ],
  results: [
    { value: "~2 billion", label: "tokens a month" },
    { value: "Near zero", label: "projected AI licensing cost" },
    { value: "Every call", label: "attributed, limited, logged" },
  ],
} as const;

export const recruiterFacts = [
  { term: "Current title", detail: "Manager, Infrastructure Services" },
  { term: "Team", detail: "4 direct reports; 8 while leading BrandsMart's team after the acquisition" },
  { term: "Location", detail: "Atlanta, remote since 2020" },
  { term: "Education", detail: "B.S. Computer Science, Kennesaw State" },
  { term: "Languages", detail: "Python, TypeScript, Go" },
];

// The changelog's "In the same period" list under the gateway generations.
export const samePeriod = [
  { term: "MCP", detail: "Gateway, Registry and Portal: about 20 managed servers behind OAuth and approvals." },
  { term: "Agents", detail: "Internal chat platform and about 30 agents, 400 users across 14 teams." },
  { term: "Kubernetes", detail: "On-prem Talos clusters with Flux, Argo CD, Cilium and External Secrets." },
  { term: "Rollouts", detail: "Microsoft Copilot and Copilot Studio; managed Claude Code and Claude Desktop packaged via Intune." },
  { term: "Team", detail: "Led BrandsMart USA's infrastructure team after the acquisition, 2023 to 2026." },
];

export const bio =
  "I joined The Aaron's Company as a Network Analyst in 2009 and grew with it: Network Engineer, Senior Infrastructure Engineer, and since 2021 Manager of Infrastructure Services. Along the way I built the store network, the data centers and the Azure footprint, then turned to the question of how a 15,000-person company adopts AI without losing control of cost, data or risk.";
export const facts = [
  { title: "Atlanta, GA", detail: "remote since 2020" },
  { title: "Kennesaw State", detail: "B.S. Computer Science" },
  { title: "Spoons of Salt", detail: "volunteer IT since 2023" },
];

export interface Perspective {
  // Each id has a selector in the <style> of Perspectives.astro and changelog.astro: a new one needs a line in
  // both, or its panel never shows.
  id: "recruiters" | "leaders" | "security";
  label: string;
  headline: string;
  body: string;
  // Home page only, and not for recruiters, whose panel lists recruiterFacts instead.
  points: string[];
}

// Recruiters first: they screen before engineers read.
export const perspectives: Perspective[] = [
  {
    id: "recruiters",
    label: "Recruiters",
    headline: "Seventeen years, one company, three promotions.",
    body: "From Network Analyst in 2009 to Manager, Infrastructure Services, now leading company-wide AI strategy and adoption at The Aaron's Company. B.S. in Computer Science from Kennesaw State. Based in Atlanta, remote since 2020.",
    points: [
      "AI platform engineering: gateways, MCP, agents, Copilot and Claude rollouts",
      "Infrastructure leadership: data centers, network, security, DR and identity",
      "Cut projected AI licensing costs to near zero",
    ],
  },
  {
    id: "leaders",
    label: "Engineering leaders",
    headline: "A platform leader who still writes the code.",
    body: "I run infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime. I architected the AI Gateway and the MCP platform. Both run on GitOps-managed Kubernetes, and I still write the code: Python, TypeScript and Go.",
    points: [
      "AI Gateway serving ~2 billion tokens a month across Azure AI Foundry and Anthropic",
      "On-prem Talos Kubernetes with Flux, Argo CD, Cilium and External Secrets",
      "Led teams of up to 8 engineers, including an acquired company's infrastructure team",
    ],
  },
  {
    id: "security",
    label: "Security & governance",
    headline: "AI adoption with the guardrails built in.",
    body: "Every model call through the AI Gateway gets SSO, rate limiting, guardrails and audit logging, with cost tracked per user and per team. The MCP Gateway adds tool-approval workflows and OAuth, so agents reach internal systems only in approved ways.",
    points: [
      "~20 managed MCP servers behind approvals and OAuth",
      "Authored AI SDLC guidelines and presented on AI security to the Information Security team",
      "Owns privileged access (PAM) and identity; earlier rolled out 802.1X network access control",
    ],
  },
];

export interface WorkItem {
  title: string;
  summary: string;
  // "2021 to now" or "2015 to 2021".
  period: string;
  // One short line: the outcome a reader should remember.
  result: string;
}

export const work: WorkItem[] = [
  {
    title: "AI Gateway",
    summary:
      "The company's single path to large language models. It evolved from LiteLLM to Azure APIM to a custom in-house platform, with SSO, per-user and per-team cost accounting, rate limiting, guardrails, model routing and audit logging.",
    period: "2021 to now",
    result: "~2 billion tokens a month; projected licensing cost cut to near zero",
  },
  {
    title: "MCP Gateway, Registry & Portal",
    summary:
      "A governed way for teams to connect AI agents to internal systems and data, with tool-approval workflows and OAuth.",
    period: "2021 to now",
    result: "About 20 managed MCP servers behind OAuth and tool-approval workflows",
  },
  {
    title: "AI chat platform & agents",
    summary: "An internal AI chat platform and agents grounded in company knowledge, built in Python, TypeScript and Go.",
    period: "2021 to now",
    result: "About 30 agents grounded in company knowledge, 400 users across 14 teams",
  },
  {
    title: "On-prem Kubernetes platform",
    summary: "Talos Linux clusters run with GitOps (Flux and Argo CD), Cilium networking, and External Secrets Operator backed by Secret Server.",
    period: "2021 to now",
    result: "Talos Linux, Flux and Argo CD, Cilium, External Secrets backed by Secret Server",
  },
  {
    title: "SD-WAN for every store",
    summary: "Led the SD-WAN rollout to every store on CloudGenix, then migrated the store network to Meraki.",
    period: "2015 to 2021",
    result: "CloudGenix to 2,300+ stores, later migrated to Meraki",
  },
  {
    title: "Data centers & disaster recovery",
    summary:
      "Directed the new primary data center build-out and migration, then the disaster recovery data center and the storage move from HPE Nimble to Pure Storage.",
    period: "2015 to 2021",
    result: "New primary data center and DR site, Nimble to Pure Storage, Azure with ExpressRoute; zero unplanned downtime",
  },
];

export interface Role {
  title: string;
  // "Mon YYYY": pages take the year with slice(-4). Only the current role has no end.
  start: string;
  end?: string;
  highlights: string[];
  // Changelog entry: a heading and a short paragraph.
  heading: string;
  summary: string;
}

export const employer = { name: "The Aaron's Company", location: "Atlanta, GA (remote since 2020)", since: "Nov 2009" };

export const career: Role[] = [
  {
    title: "Manager, Infrastructure Services",
    start: "Jul 2021",
    highlights: [
      "Leads company-wide AI strategy and adoption: AI Gateway, MCP Gateway, Registry and Portal, and the internal AI chat platform",
      "Rolled out Microsoft Copilot and Copilot Studio, and packaged managed Claude Code and Claude Desktop for Windows and macOS via Intune",
      "Owns core infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime; leads a team of 4",
      "Led BrandsMart USA's 4-person infrastructure team after the acquisition (Mar 2023 – Mar 2026), for 8 direct reports",
      "Delivered multi-million-dollar infrastructure projects and replaced paid tools with in-house platforms",
    ],
    heading: "One gateway, three generations",
    summary:
      "The company's single path to large language models. Each generation was retired when it couldn't answer the business's questions: who is spending what, on which model, under which rules.",
  },
  {
    title: "Sr. Infrastructure Engineer",
    start: "Apr 2015",
    end: "Jul 2021",
    highlights: [
      "Directed the new primary data center build-out and migration with zero unplanned downtime",
      "Established the Azure tenant, subscriptions and ExpressRoute hybrid connectivity",
      "Led SD-WAN to every store (2,300+ at the time); had Always-On VPN ready the day the company went remote (~1,200 users)",
    ],
    heading: "A new data center, a DR site, and SD-WAN to every store",
    summary:
      "Directed the primary data center build-out and migration with zero unplanned downtime, then the disaster recovery site and the move from HPE Nimble to Pure Storage. Established the Azure tenant and ExpressRoute. Rolled SD-WAN to 2,300+ stores, and had Always-On VPN ready the day the company went remote.",
  },
  {
    title: "Network Engineer",
    start: "Aug 2012",
    end: "Apr 2015",
    highlights: [
      "Designed a standard IP plan and re-IP'd every store network (2,300+ at the time)",
      "Led firewall migrations to Palo Alto and Meraki, and the Secret Server PAM rollout",
    ],
    heading: "One addressing plan for 2,300 stores",
    summary:
      "Designed a standard IP plan and re-addressed every store network. Led the firewall migrations to Palo Alto and Meraki, and the Secret Server PAM rollout.",
  },
  {
    title: "Network Analyst",
    start: "Nov 2009",
    end: "Aug 2012",
    highlights: ["Store network connectivity and SonicWALL firewall deployments"],
    heading: "Started where the packets start",
    summary:
      "Store network connectivity and SonicWALL firewall deployments, while finishing a Computer Science degree at Kennesaw State (Southern Polytechnic), 2008 to 2012.",
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "AI platform engineering", items: ["AI & MCP gateways", "Azure AI Foundry", "Copilot & Copilot Studio", "Anthropic & OpenAI", "Azure APIM", "AI agents & agent skills", "AI security & governance"] },
  { group: "Cloud & Kubernetes", items: ["Kubernetes", "Docker", "Talos Linux", "GitOps (Flux & Argo CD)", "Cilium", "External Secrets Operator", "Grafana & Zabbix", "Azure & ExpressRoute"] },
  { group: "Networking", items: ["Cisco ASR & Nexus 9K", "Aruba / Meraki / Ubiquiti", "SD-WAN", "F5", "Infoblox", "Wireless", "WAN circuits"] },
  { group: "Security & identity", items: ["Palo Alto & GlobalProtect", "Meraki firewalls", "Aruba ClearPass (802.1X)", "Secret Server (PAM)", "Active Directory & Entra ID", "Microsoft 365", "Intune"] },
  { group: "Data center", items: ["VMware & Hyper-V", "Cisco UCS", "HPE Nimble & Pure Storage", "Rubrik", "Zerto DR"] },
  { group: "Programming", items: ["Python", "TypeScript", "Go"] },
];

export const education = { degree: "B.S., Computer Science", school: "Kennesaw State University (Southern Polytechnic)", years: "2008 – 2012" };

export const volunteer = {
  org: "Spoons of Salt",
  years: "2023 – present",
  summary: "IT and technical support for a local 501(c)(3) nonprofit that supports people living with chronic illness.",
};
