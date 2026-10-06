// Site copy drawn from Jason's résumé (resume.matherly.net/jason/matherly). Edit facts here, not in pages.
// Contact details are deliberately absent: LinkedIn and the résumé link handle contact.
import { person } from "../lib/site";

export const resumeUrl = "https://resume.matherly.net/jason/matherly";

export const headline = "Every AI request at a 15,000‑person company runs through the platform I built."; // ‑: non-breaking hyphen
export const aboutHeadline = "Twenty years, one company, four promotions.";
// The current role's title, as the résumé writes it; career[0].title, recruiterFacts and the recruiters perspective
// read it, so a retitle is one edit.
const currentTitle = "Manager, Infrastructure Services";
// One paragraph each for what was built and what comes next. Asterisks mark the phrases the home page sets in the
// foreground color, so a skim of those alone still tells the story.
export const intro = [
  "In *twenty years* at The Aaron's Company I designed and built its primary and disaster recovery *data centers*, the infrastructure for three corporate offices, and SD‑WAN to every store.",
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
    { value: "15M to about 2 billion", label: "tokens a month, launch to today" },
    { value: "$100K+ to near zero", label: "projected yearly licensing" },
    { value: "Every call", label: "attributed, limited, logged" },
  ],
} as const;

export const recruiterFacts = [
  { term: "Current title", detail: currentTitle },
  { term: "Reports to", detail: "Director of IT" },
  { term: "Team", detail: "4 direct reports; 8 while also leading BrandsMart's team, 2023 to 2026" },
  { term: "Built", detail: "Two data centers, three corporate offices, SD-WAN to 2,300+ stores (at the time), and the AI platform" },
  { term: "Location", detail: "Atlanta, remote since 2020" },
  { term: "Education", detail: "B.S. Computer Science, Kennesaw State" },
  { term: "Writes code in", detail: "Python, TypeScript, Go" },
];

// The home page says "three corporate offices" in the intro and the recruiters' facts, so the bio leaves it out.
export const bio =
  "I started in The Aaron's Company's IT call center in 2006 and moved into infrastructure as a Network Analyst in 2009. Since then I've designed and built the store network, two data centers and the Azure footprint. Now I work on how a 15,000-person company adopts AI without losing control of cost, data or risk.";

export interface Perspective {
  // Each id has a selector in the <style> of Perspectives.astro: a new one needs a line there, or its panel never
  // shows.
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
    headline: aboutHeadline,
    body: `From the IT call center in 2006 to ${currentTitle} at The Aaron's Company. I now lead company-wide AI strategy and adoption, along with the infrastructure behind 15,000+ employees and 1,200+ stores.`,
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
  // "2024 to now", "2015 to 2021", or one year, "2022".
  period: string;
  // One short line: the outcome a reader should remember.
  result: string;
  group: (typeof workGroups)[number];
}

// /work's sections, in page order.
export const workGroups = ["AI platform", "Infrastructure"] as const;

// In workGroups order, then newest start year first: /work and PlatformList render this order as is.
export const work: WorkItem[] = [
  {
    title: "MCP Gateway, Registry & Portal",
    summary:
      "How Claude Code, Claude Desktop and company agents reach internal systems and data. A server is approved into the registry once; from then on, every call to it goes through the MCP Gateway.",
    period: "2025 to now",
    result: "About 20 MCP servers, each approved into the registry, behind OAuth",
    group: "AI platform",
  },
  {
    title: "AI chat platform & agents",
    summary:
      "An internal AI chat platform and agents on third-party and open-source agent frameworks, with prompt composition, agent memory, multi-step orchestration with tool use, and model evaluations, built in Python, TypeScript and Go. Designed the retrieval pipeline that grounds the agents in company knowledge: source documents are curated, chunked, embedded and indexed for RAG and Graph-RAG over a vector store.",
    period: "2025 to now",
    result: "About 30 agents grounded in company knowledge, 400 users across 14 teams",
    group: "AI platform",
  },
  {
    title: gateway.title,
    summary:
      "The company's single path to large language models, rebuilt twice: LiteLLM, then Azure API Management, then an in-house platform. Every call is signed in with SSO, rate limited, checked by guardrails, routed across Azure AI Foundry and Anthropic with model fallback, and written to the audit log, with cost tracked per user and team.",
    period: "2024 to now",
    result: "About 2 billion tokens a month; projected licensing from $100K+ a year to near zero",
    group: "AI platform",
  },
  {
    title: "On-prem Kubernetes platform",
    summary: "Talos Linux clusters run with GitOps (Flux and Argo CD), Cilium networking, and External Secrets Operator backed by Secret Server.",
    period: "2024 to now",
    result: "Runs the AI Gateway and the MCP platform, managed through GitOps",
    group: "AI platform",
  },
  {
    title: "AD auditing platform",
    summary: "Replaced ADAudit Plus with a custom Active Directory auditing platform.",
    period: "2026",
    result: "$20K a year in licensing replaced by an in-house platform",
    group: "Infrastructure",
  },
  {
    title: "BrandsMart USA integration",
    summary:
      "After the acquisition, led BrandsMart's 4-person infrastructure team alongside Aaron's own, standardizing policies, procedures and tooling across its data center and 12 sites.",
    period: "2023 to 2026",
    result: "8 direct reports in all; one set of policies and tooling across both companies",
    group: "Infrastructure",
  },
  {
    title: "Self-service automation",
    summary: "Self-service requests for VMs, storage, VDI, accounts and firewall changes, fulfilled by automation instead of tickets.",
    period: "2023",
    result: "Saves 10 minutes to several hours per request",
    group: "Infrastructure",
  },
  {
    title: "Monitoring on Zabbix & Grafana",
    summary: "Replaced SolarWinds with Zabbix and custom Grafana dashboards.",
    period: "2022",
    result: "$80K a year in licensing replaced by in-house monitoring",
    group: "Infrastructure",
  },
  {
    title: "Disaster recovery data center",
    summary: "Designed and built the disaster recovery data center and moved storage from HPE Nimble to Pure Storage.",
    period: "2021",
    result: "A second data center, with zero unplanned downtime",
    group: "Infrastructure",
  },
  {
    title: "SD-WAN for every store",
    summary: "Led the SD-WAN rollout to every store on CloudGenix. Later moved SD-WAN onto the Meraki equipment the stores already had, which simplified each store's hardware and cut licensing costs.",
    period: "2015 to 2021",
    result: "2,300+ stores at the time; later moved onto existing Meraki gear for a simpler stack and lower licensing",
    group: "Infrastructure",
  },
  {
    title: "Primary data center, corporate offices & Azure",
    summary:
      "Designed and built the new primary data center, a $2M project (10 racks, 1,400+ VMs, hundreds of applications), and led its migration. Fitted out the full infrastructure for three corporate offices: the IT building (2015), the corporate headquarters (2016) and an office for payroll, procurement and other business units (2018). Established the Azure tenant, subscriptions and ExpressRoute hybrid connectivity.",
    period: "2015 to 2021",
    result: "Primary data center, three offices, Azure with ExpressRoute; zero unplanned downtime",
    group: "Infrastructure",
  },
  {
    title: "Store network re-IP & firewall migrations",
    summary:
      "Designed a standard IP plan and re-IP'd every store network. Led the firewall migrations: corporate offices and data centers to Palo Alto, stores from SonicWALL to Meraki.",
    period: "2012 to 2015",
    result: "2,300+ stores on one addressing plan",
    group: "Infrastructure",
  },
  {
    title: "Secret Server PAM rollout",
    summary: "Rolled out Secret Server, vaulting every organization service account and elevated-credential account with rotation.",
    period: "2012 to 2015",
    result: "Every privileged credential vaulted and rotated",
    group: "Infrastructure",
  },
];

export interface Milestone {
  // "YYYY": the year the rail shows.
  year: string;
  heading: string;
  // A paragraph only when the heading needs one (the gateway milestone); highlights usually say it.
  summary?: string;
  highlights: string[];
}

export interface Role {
  title: string;
  // "Mon YYYY": pages take the year with slice(-4). Only the current role has no end.
  start: string;
  end?: string;
  heading: string;
  highlights: string[];
  // Newest first; years after the role's start year (that year is the role's own entry) and no later than its end.
  milestones?: Milestone[];
}

export const employer = { name: person.worksFor };

export const career: Role[] = [
  {
    title: currentTitle,
    start: "Jul 2021",
    highlights: [
      "Designed and built the disaster recovery data center (2021) and moved storage from HPE Nimble to Pure Storage, with zero unplanned downtime",
      "Owns core infrastructure for 15,000+ employees and 1,200+ stores at 99.999% uptime while supporting PCI DSS and SOX requirements; leads a team of 4",
      "Leads company-wide AI strategy and adoption; rolled out Microsoft Copilot and Copilot Studio to 600 users",
      "With no standing annual budget through downsizing and acquisitions, funds each project on its own business case; replaced paid tools with in-house platforms (SolarWinds with Zabbix and Grafana, ADAudit Plus with a custom auditing platform), saving $100K a year in licensing",
      "Rolled out self-service automation for VMs, storage, VDI, accounts and firewall changes, saving 10 minutes to several hours per request",
    ],
    heading: "Manager, and a second data center",
    milestones: [
      {
        year: "2026",
        heading: "One gateway, three generations",
        summary:
          "The company's single path to large language models since December 2024. Each generation was retired when it couldn't answer the business's questions: who is spending what, on which model, under which rules.",
        highlights: [
          "Moved the gateway from LiteLLM to Azure API Management in February, then to the in-house platform in June",
          "Packaged managed Claude Code and Claude Desktop for Windows and macOS via Intune for 400 users, and hosts a weekly AI community of practice",
        ],
      },
      {
        year: "2025",
        heading: "Tools and agents behind a gateway, too",
        highlights: [
          "Designed and delivered the MCP Gateway, Registry and Portal",
          "Built the internal AI chat platform and its agents, grounded in company knowledge",
        ],
      },
      {
        year: "2024",
        heading: "The first gateway",
        highlights: [
          "Built the AI Gateway single-handedly and launched it on LiteLLM in December at 15 million tokens a month",
          "Stood up the on-prem Kubernetes platform that runs the gateway and the MCP platform",
        ],
      },
      {
        year: "2023",
        heading: "Two infrastructure teams",
        highlights: [
          "After the BrandsMart USA acquisition, also led its 4-person infrastructure team from March 2023 to March 2026 (8 direct reports in all), standardizing policies and tooling across a data center and 12 sites",
        ],
      },
    ],
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
  },
  {
    title: "Network Analyst",
    start: "Nov 2009",
    end: "Aug 2012",
    highlights: ["Supported network connectivity and deployed SonicWALL firewalls for 2,300+ stores"],
    heading: "Started where the packets start",
  },
  {
    title: "Call Center & Quality Assurance",
    start: "Nov 2006",
    end: "Nov 2009",
    highlights: ["Started in the IT call center and quality assurance before moving into infrastructure"],
    heading: "First, the help desk",
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "AI platform engineering", items: ["AI gateways & Model Context Protocol (MCP)", "Azure AI Foundry", "Copilot & Copilot Studio", "Anthropic & OpenAI", "Azure API Management (APIM)", "AI agents & agent skills", "Agent frameworks (Microsoft, Anthropic, OpenAI, open source)", "Agent memory & orchestration", "Prompt composition", "RAG, Graph-RAG & vector stores", "Model evaluations", "LLMOps", "AI security & governance", "Responsible AI policy", "AI cost management (FinOps)", "AI enablement & adoption"] },
  { group: "Platform engineering & cloud", items: ["Kubernetes", "Docker", "Talos Linux", "Helm", "Terraform", "GitOps (Flux & Argo CD)", "CI/CD (GitHub Actions)", "Cilium", "External Secrets Operator", "Observability (OpenTelemetry, Grafana & Zabbix)", "ITIL", "Azure & ExpressRoute"] },
  { group: "Networking", items: ["Cisco ASR & Nexus 9K", "Aruba / Meraki / Ubiquiti", "SD-WAN", "F5", "Infoblox", "Wireless", "WAN circuits"] },
  { group: "Security & identity", items: ["Palo Alto & GlobalProtect", "Meraki firewalls", "Aruba ClearPass (802.1X)", "Secret Server (PAM)", "Active Directory & Entra ID", "Microsoft 365", "Intune", "PCI DSS & SOX"] },
  { group: "Data center", items: ["VMware & Hyper-V", "Cisco UCS", "HPE Nimble & Pure Storage", "Rubrik", "Zerto DR"] },
  { group: "Programming", items: ["Python", "TypeScript", "Go"] },
];

export const education = { degree: "B.S., Computer Science", school: "Kennesaw State University (Southern Polytechnic)", years: "2008 to 2012" };

export const volunteer = {
  org: "Spoons of Salt",
  years: "since 2023",
  summary: "IT and technical support for a local 501(c)(3) nonprofit that supports people living with chronic illness.",
};
