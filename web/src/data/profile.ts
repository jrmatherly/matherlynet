// Site copy drawn from Jason's résumé (resume.matherly.net/jason/matherly). Edit facts here, not in pages.
// Contact details are deliberately absent: LinkedIn and the résumé link handle contact.
import { person } from "../lib/site";

export const resumeUrl = "https://resume.matherly.net/jason/matherly";

export const headline = "I built the AI platform a 15,000-person company runs on.";
// One paragraph each for what was built and what comes next. Asterisks mark the phrases the home page sets in the
// foreground color, so a skim of those alone still tells the story.
export const intro = [
  "Over *twenty years* at The Aaron's Company I designed and built its primary and disaster recovery *data centers*, the infrastructure for three corporate offices, and SD-WAN to every store.",
  "Now I lead its move into *agentic AI*: a gateway carrying about *2 billion tokens a month*, built in-house to take projected licensing from $100K+ a year to near zero.",
];
// Rendered only when set. Jason supplies the wording (roles, remote/Atlanta, timing).
export const availability: string | null = "Interested in roles leading AI platform, AI enablement or infrastructure teams.";
export const contact = { label: "Message me on LinkedIn", href: person.sameAs[0] } as const;

export const gateway = {
  title: "AI Gateway",
  summary:
    "Started as a quick way to give teams safe access to models. Each generation was replaced when it could no longer answer the questions the business asked: who is spending what, on which model, and under which rules.",
  generations: [
    { name: "LiteLLM", note: "Fast to stand up, proved demand. Couldn't attribute cost per team or enforce policy per use case, and licensing was projected at $100K+ a year.", current: false },
    { name: "Azure API Management", note: "Added SSO and rate limits, and cut projected licensing to about $38K a year. Routing and guardrails were awkward to express.", current: false },
    {
      name: "In-house platform",
      note: "Answers all three: cost per user and team, routing across Azure AI Foundry and Anthropic, and guardrails, rate limits and an audit log on every call.",
      current: true,
    },
  ],
  results: [
    { value: "~2 billion", label: "tokens a month" },
    { value: "$100K+ to near zero", label: "projected yearly licensing" },
    { value: "Every call", label: "attributed, limited, logged" },
  ],
} as const;

export const recruiterFacts = [
  { term: "Current title", detail: "Manager, Infrastructure Services" },
  { term: "Team", detail: "4 direct reports; 8 while also leading BrandsMart's team, 2023 to 2026" },
  { term: "Built", detail: "Two data centers, three corporate offices, SD-WAN to 2,300+ stores, and the AI platform" },
  { term: "Location", detail: "Atlanta, remote since 2020" },
  { term: "Education", detail: "B.S. Computer Science, Kennesaw State" },
  { term: "Writes code in", detail: "Python, TypeScript, Go" },
];

// The changelog's "In the same period" list under the gateway generations.
export const samePeriod = [
  { term: "MCP", detail: "Gateway, Registry and Portal: about 20 servers, each approved into the registry, behind OAuth." },
  { term: "Agents", detail: "Internal chat platform and about 30 agents, 400 users across 14 teams." },
  { term: "Kubernetes", detail: "On-prem Talos clusters with Flux, Argo CD, Cilium and External Secrets." },
  { term: "Rollouts", detail: "Microsoft Copilot and Copilot Studio; managed Claude Code and Claude Desktop packaged via Intune; a weekly AI community of practice." },
  { term: "Data center", detail: "Designed and built the disaster recovery data center and moved storage from HPE Nimble to Pure Storage, with zero unplanned downtime." },
  { term: "Team", detail: "Led BrandsMart USA's infrastructure team after the acquisition, 2023 to 2026: a data center and 12 sites." },
];

export const bio =
  "I started in The Aaron's Company's IT call center in 2006 and moved into infrastructure as a Network Analyst in 2009. Since then I've designed and built the store network, two data centers, three corporate offices and the Azure footprint. Now I work on how a 15,000-person company adopts AI without losing control of cost, data or risk.";
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
    headline: "Twenty years, one company, four promotions.",
    body: "From the IT call center in 2006 to Manager, Infrastructure Services at The Aaron's Company. I now lead company-wide AI strategy and adoption, along with the infrastructure behind 15,000+ employees and 1,200+ stores.",
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
    body: "I run infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime. I designed the AI Gateway and the MCP platform, both on GitOps-managed Kubernetes, and I write production code in Python, TypeScript and Go.",
    points: [
      "AI Gateway carrying about 2 billion tokens a month across Azure AI Foundry and Anthropic",
      "Took the gateway from LiteLLM to Azure API Management to an in-house platform, and projected licensing from $100K+ a year to about $38K to near zero",
      "Led teams of up to 8 engineers, including an acquired company's infrastructure team",
      "Designed and built the primary and DR data centers, three corporate offices, and SD-WAN to 2,300+ stores",
    ],
  },
  {
    id: "security",
    label: "Security & governance",
    headline: "AI adoption with the guardrails built in.",
    body: "Every model call goes through the AI Gateway: signed in with SSO, rate limited, checked for personal data, secrets, prompt injection and restricted topics, and written to the audit log, with cost tracked per user and team. Tools sit behind the MCP Gateway, which reaches only servers approved into the registry, over OAuth.",
    points: [
      "Audit logs kept for at least 90 days and reviewed by audit and compliance",
      "About 20 MCP servers, each approved into the registry before any agent can call it",
      "Wrote the company's guidelines for building software with AI, and briefed the Information Security team on AI security",
      "Responsible for privileged access (PAM) and identity; rolled out 802.1X network access control",
    ],
  },
];

export interface WorkItem {
  title: string;
  summary: string;
  // "2024 to now" or "2015 to 2021".
  period: string;
  // One short line: the outcome a reader should remember.
  result: string;
}

export const work: WorkItem[] = [
  {
    title: "AI Gateway",
    summary:
      "The company's single path to large language models. It evolved from LiteLLM to Azure APIM to a custom in-house platform, with SSO, per-user and per-team cost accounting, rate limiting, guardrails, model routing and audit logging.",
    period: "2024 to now",
    result: "About 2 billion tokens a month; projected licensing from $100K+ a year to near zero",
  },
  {
    title: "MCP Gateway, Registry & Portal",
    summary:
      "A governed way for teams to connect AI agents to internal systems and data: a server is approved into the registry before any agent can reach it, and every call is signed in with OAuth.",
    period: "2025 to now",
    result: "About 20 MCP servers, each approved into the registry, behind OAuth",
  },
  {
    title: "AI chat platform & agents",
    summary: "An internal AI chat platform and agents grounded in company knowledge, built in Python, TypeScript and Go.",
    period: "2025 to now",
    result: "About 30 agents grounded in company knowledge, 400 users across 14 teams",
  },
  {
    title: "On-prem Kubernetes platform",
    summary: "Talos Linux clusters run with GitOps (Flux and Argo CD), Cilium networking, and External Secrets Operator backed by Secret Server.",
    period: "2024 to now",
    result: "Runs the AI Gateway and the MCP platform, managed through GitOps",
  },
  {
    title: "SD-WAN for every store",
    summary: "Led the SD-WAN rollout to every store on CloudGenix, then migrated the store network to Meraki.",
    period: "2015 to 2021",
    result: "CloudGenix to 2,300+ stores, later migrated to Meraki",
  },
  {
    title: "Data centers, DR & corporate offices",
    summary:
      "Designed and built the new primary data center and led its migration. Fitted out the full infrastructure for three corporate offices: the IT building (2015), the corporate headquarters (2016) and an office for payroll, procurement and other business units (2018). In 2021, as manager, designed and built the disaster recovery data center and moved storage from HPE Nimble to Pure Storage.",
    period: "2015 to 2021",
    result: "Primary and DR data centers, three corporate offices, Azure with ExpressRoute; zero unplanned downtime",
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

export const employer = { name: person.worksFor, location: "Atlanta, GA (remote since 2020)", since: "Nov 2006" };

export const career: Role[] = [
  {
    title: "Manager, Infrastructure Services",
    start: "Jul 2021",
    highlights: [
      "Leads company-wide AI strategy and adoption: AI Gateway, MCP Gateway, Registry and Portal, and the internal AI chat platform",
      "Rolled out Microsoft Copilot and Copilot Studio, packaged managed Claude Code and Claude Desktop for Windows and macOS via Intune, and hosts a weekly AI community of practice",
      "Owns core infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime; leads a team of 4",
      "Led BrandsMart USA's 4-person infrastructure team after the acquisition (Mar 2023 – Mar 2026), for 8 direct reports, standardizing policies and tooling across a data center and 12 sites",
      "Designed and built the disaster recovery data center (2021) and moved storage from HPE Nimble to Pure Storage, with zero unplanned downtime",
      "Delivered $2M+ in infrastructure projects (the largest about $1.5M) and replaced paid tools with in-house platforms: SolarWinds with Zabbix and Grafana, ADAudit Plus with a custom auditing platform",
      "Rolled out self-service automation for VMs, storage, VDI, accounts and firewall changes",
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
      "Designed and built the new primary data center and led its migration with zero unplanned downtime",
      "Fitted out the full infrastructure for three corporate offices: the IT building (2015), the corporate headquarters (2016) and an office for payroll, procurement and other business units (2018)",
      "Established the Azure tenant, subscriptions and ExpressRoute hybrid connectivity",
      "Led SD-WAN to every store (2,300+ at the time); had Always-On VPN ready the day the company went remote (about 1,200 users)",
    ],
    heading: "A new data center, three offices, and SD-WAN to every store",
    summary:
      "Designed and built the primary data center and led its migration with zero unplanned downtime. Fitted out three corporate offices between 2015 and 2018. Established the Azure tenant and ExpressRoute. Rolled SD-WAN to 2,300+ stores, and had Always-On VPN ready the day the company went remote.",
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
  {
    title: "Call Center & Quality Assurance",
    start: "Nov 2006",
    end: "Nov 2009",
    highlights: ["Started in the IT call center and quality assurance before moving into infrastructure"],
    heading: "First, the customers",
    summary: "Started in the IT call center and quality assurance, then moved into infrastructure.",
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
