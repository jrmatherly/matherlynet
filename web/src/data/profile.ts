// Site copy drawn from Jason's résumé (resume.matherly.net/jason/matherly). Edit facts here, not in pages.
// Contact details are deliberately absent: LinkedIn and the résumé link handle contact.
import { person } from "../lib/site";

export const resumeUrl = "https://resume.matherly.net/jason/matherly";

export const headline = "Every AI request at a 15,000‑person company runs through the platform I built."; // ‑: non-breaking hyphen
// One paragraph each for what was built and what comes next. Asterisks mark the phrases the home page sets in the
// foreground color, so a skim of those alone still tells the story.
export const intro = [
  "Over *twenty years* at The Aaron's Company I designed and built its primary and disaster recovery *data centers*, the infrastructure for three corporate offices, and SD‑WAN to every store.",
  "Now I lead its move into *agentic AI*: a gateway carrying about *2 billion tokens a month*, built in-house to take projected licensing from $100K+ a year to near zero.",
];
// Rendered only when set. Jason supplies the wording (roles, remote/Atlanta, timing).
export const availability: string | null = "Interested in roles leading AI platform, AI enablement or infrastructure teams.";
export const contact = { label: "Message me on LinkedIn", href: person.sameAs[0] } as const;

export const gateway = {
  title: "AI Gateway",
  summary:
    "Started as a quick way to give teams safe access to models. Each generation was replaced when it could no longer answer the questions the business asked: who is spending what, on which model, and under which rules. Before building the third, I evaluated Portkey, Kong AI Gateway, Envoy, Agent Gateway and kgateway; each lacked features we needed or cost too much.",
  generations: [
    { name: "LiteLLM", since: "Dec 2024", note: "Fast to stand up, proved demand. Couldn't attribute cost per team or enforce policy per use case, and licensing was projected at $100K+ a year.", current: false },
    { name: "Azure API Management", since: "Feb 2026", note: "Added SSO and rate limits, and cut projected licensing to about $38K a year. Routing and guardrails were awkward to express.", current: false },
    {
      name: "In-house platform",
      since: "Jun 2026",
      note: "Answers all three: cost per user and team, routing across Azure AI Foundry and Anthropic, and guardrails, rate limits and an audit log on every call.",
      current: true,
    },
  ],
  results: [
    { value: "15M to ~2 billion", label: "tokens a month, launch to today" },
    { value: "$100K+ to near zero", label: "projected yearly licensing" },
    { value: "Every call", label: "attributed, limited, logged" },
  ],
} as const;

export const recruiterFacts = [
  { term: "Current title", detail: "Manager, Infrastructure Services" },
  { term: "Reports to", detail: "Director of IT" },
  { term: "Team", detail: "4 direct reports; 8 while also leading BrandsMart's team, 2023 to 2026" },
  { term: "Built", detail: "Two data centers, three corporate offices, SD-WAN to 2,300+ stores (at the time), and the AI platform" },
  { term: "Location", detail: "Atlanta, remote since 2020" },
  { term: "Education", detail: "B.S. Computer Science, Kennesaw State" },
  { term: "Writes code in", detail: "Python, TypeScript, Go" },
];

// The changelog's "In the same period" list under the gateway generations.
export const samePeriod = [
  { term: "MCP", detail: "Gateway, Registry and Portal: about 20 servers, each approved into the registry, behind OAuth." },
  { term: "Agents", detail: "Internal chat platform and about 30 agents, 400 users across 14 teams." },
  { term: "Kubernetes", detail: "On-prem Talos clusters with Flux, Argo CD, Cilium and External Secrets." },
  { term: "Rollouts", detail: "Microsoft Copilot and Copilot Studio for 600 users; managed Claude Code and Claude Desktop, packaged via Intune, for 400; a weekly AI community of practice." },
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
      "Designed and built the primary and DR data centers, three corporate offices, and SD-WAN to 2,300+ stores (at the time)",
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
      "The company's single path to large language models, rebuilt twice: LiteLLM, then Azure API Management, then an in-house platform. Every call is signed in with SSO, rate limited, checked by guardrails, routed across Azure AI Foundry and Anthropic and written to the audit log, with cost tracked per user and team.",
    period: "2024 to now",
    result: "About 2 billion tokens a month; projected licensing from $100K+ a year to near zero",
  },
  {
    title: "MCP Gateway, Registry & Portal",
    summary:
      "How Claude Code, Claude Desktop and company agents reach internal systems and data. A server is approved into the registry once; from then on, every call to it goes through the MCP Gateway.",
    period: "2025 to now",
    result: "About 20 MCP servers, each approved into the registry, behind OAuth",
  },
  {
    title: "AI chat platform & agents",
    summary: "An internal AI chat platform and agents grounded in company knowledge through RAG and Graph-RAG, with model evaluations, built in Python, TypeScript and Go.",
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
    summary: "Led the SD-WAN rollout to every store on CloudGenix. Later moved SD-WAN onto the Meraki equipment the stores already had, which simplified each store's hardware and cut licensing costs.",
    period: "2015 to 2021",
    result: "2,300+ stores at the time; later moved onto existing Meraki gear for a simpler stack and lower licensing",
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
      "Leads company-wide AI strategy and adoption. Built the AI Gateway single-handedly and grew it from 15 million tokens a month at launch to about 2 billion, across 400 users and 14 teams; also delivered the MCP Gateway, Registry and Portal and the internal AI chat platform",
      "Rolled out Microsoft Copilot and Copilot Studio to 600 users, and packaged managed Claude Code and Claude Desktop for Windows and macOS via Intune for 400; since early 2026, hosts a weekly AI community of practice",
      "Owns core infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime; leads a team of 4",
      "After the BrandsMart USA acquisition, also led its 4-person infrastructure team from March 2023 to March 2026 (8 direct reports in all), standardizing policies and tooling across a data center and 12 sites",
      "Designed and built the disaster recovery data center (2021) and moved storage from HPE Nimble to Pure Storage, with zero unplanned downtime",
      "With no standing annual budget through downsizing and acquisitions, funds each project on its own business case; replaced paid tools with in-house platforms (SolarWinds with Zabbix and Grafana, ADAudit Plus with a custom auditing platform), saving $80K a year in licensing",
      "Rolled out self-service automation for VMs, storage, VDI, accounts and firewall changes, saving 10 minutes to several hours per request",
    ],
    heading: "One gateway, three generations",
    summary:
      "The company's single path to large language models since December 2024. Each generation was retired when it couldn't answer the business's questions: who is spending what, on which model, under which rules.",
  },
  {
    title: "Sr. Infrastructure Engineer",
    start: "Apr 2015",
    end: "Jul 2021",
    highlights: [
      "Designed and built the new primary data center, a $2M project (10 racks, 1,400+ VMs, hundreds of applications), and led its migration with zero unplanned downtime",
      "Fitted out the full infrastructure for three corporate offices: the IT building (2015), the corporate headquarters (2016) and an office for payroll, procurement and other business units (2018)",
      "Established the Azure tenant, subscriptions and ExpressRoute hybrid connectivity",
      "Led SD-WAN to every store (2,300+ at the time); had Always-On VPN ready the day the company went remote (about 1,200 users)",
    ],
    heading: "A new data center, three offices, and SD-WAN to every store",
    summary:
      "Designed and built the primary data center and moved 1,400+ VMs and hundreds of applications into it with zero unplanned downtime. Fitted out three corporate offices between 2015 and 2018. Established the Azure tenant and ExpressRoute. Rolled SD-WAN to 2,300+ stores, and had Always-On VPN ready the day the company went remote.",
  },
  {
    title: "Network Engineer",
    start: "Aug 2012",
    end: "Apr 2015",
    highlights: [
      "Designed a standard IP plan and re-IP'd every store network (2,300+ at the time)",
      "Led the firewall migrations (corporate offices and data centers to Palo Alto, stores from SonicWALL to Meraki) and the Secret Server PAM rollout, vaulting every organization service account and elevated-credential account with rotation",
    ],
    heading: "One addressing plan for 2,300 stores",
    summary:
      "Designed a standard IP plan and re-addressed every store network. Moved the offices and data centers to Palo Alto and the stores from SonicWALL to Meraki, and vaulted every service and elevated-credential account in Secret Server.",
  },
  {
    title: "Network Analyst",
    start: "Nov 2009",
    end: "Aug 2012",
    highlights: ["Supported network connectivity and deployed SonicWALL firewalls for 2,300+ stores"],
    heading: "Started where the packets start",
    summary:
      "Supported network connectivity and deployed SonicWALL firewalls for 2,300+ stores, while finishing a Computer Science degree at Kennesaw State (Southern Polytechnic), 2008 to 2012.",
  },
  {
    title: "Call Center & Quality Assurance",
    start: "Nov 2006",
    end: "Nov 2009",
    highlights: ["Started in the IT call center and quality assurance before moving into infrastructure"],
    heading: "First, the help desk",
    summary: "Started in the IT call center, supporting the company's stores and employees, and in quality assurance, then moved into infrastructure.",
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "AI platform engineering", items: ["AI gateways & Model Context Protocol (MCP)", "Azure AI Foundry", "Copilot & Copilot Studio", "Anthropic & OpenAI", "Azure APIM", "AI agents & agent skills", "RAG & Graph-RAG", "Model evaluations", "LLMOps", "AI security & governance", "Responsible AI policy", "AI cost management", "AI enablement & adoption"] },
  { group: "Platform engineering & cloud", items: ["Kubernetes", "Docker", "Talos Linux", "GitOps (Flux & Argo CD)", "Cilium", "External Secrets Operator", "Observability (Grafana & Zabbix)", "Azure & ExpressRoute"] },
  { group: "Networking", items: ["Cisco ASR & Nexus 9K", "Aruba / Meraki / Ubiquiti", "SD-WAN", "F5", "Infoblox", "Wireless", "WAN circuits"] },
  { group: "Security & identity", items: ["Palo Alto & GlobalProtect", "Meraki firewalls", "Aruba ClearPass (802.1X)", "Secret Server (PAM)", "Active Directory & Entra ID", "Microsoft 365", "Intune"] },
  { group: "Data center", items: ["VMware & Hyper-V", "Cisco UCS", "HPE Nimble & Pure Storage", "Rubrik", "Zerto DR"] },
  { group: "Programming", items: ["Python", "TypeScript", "Go"] },
];

export const education = { degree: "B.S., Computer Science", school: "Kennesaw State University (Southern Polytechnic)", years: "2008 to 2012" };

export const volunteer = {
  org: "Spoons of Salt",
  years: "since 2023",
  summary: "IT and technical support for a local 501(c)(3) nonprofit that supports people living with chronic illness.",
};
