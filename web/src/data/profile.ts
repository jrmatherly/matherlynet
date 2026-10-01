// Site copy drawn from Jason's résumé (resume.matherly.net/jason/matherly). Edit facts here, not in pages.
// Contact details are deliberately absent: LinkedIn and the résumé link handle contact.

export const resumeUrl = "https://resume.matherly.net/jason/matherly";

export const metrics = [
  { label: "AI Gateway", value: "~2B", detail: "tokens / month" },
  { label: "MCP servers", value: "~20", detail: "managed, OAuth + approvals" },
  { label: "AI chat platform", value: "400", detail: "users across 14 teams" },
  { label: "Core infrastructure", value: "99.999%", detail: "uptime · 15,000+ employees" },
] as const;

export interface Perspective {
  id: string;
  label: string;
  headline: string;
  body: string;
  points: string[];
}

export const perspectives: Perspective[] = [
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
  {
    id: "recruiters",
    label: "Recruiters",
    headline: "Nearly 17 years, one company, three promotions.",
    body: "From Network Analyst in 2009 to Manager, Infrastructure Services, now leading company-wide AI strategy and adoption at The Aaron's Company. B.S. in Computer Science from Kennesaw State. Based in Atlanta, remote since 2020.",
    points: [
      "AI platform engineering: gateways, MCP, agents, Copilot and Claude rollouts",
      "Infrastructure leadership: data centers, network, security, DR and identity",
      "Cut projected AI licensing costs to near zero",
    ],
  },
];

export interface WorkItem {
  title: string;
  area: string;
  summary: string;
  outcomes: string[];
}

export const work: WorkItem[] = [
  {
    title: "AI Gateway",
    area: "AI · FinOps",
    summary:
      "The company's single path to large language models. It evolved from LiteLLM to Azure APIM to a custom in-house platform, with SSO, per-user and per-team cost accounting, rate limiting, guardrails, model routing and audit logging.",
    outcomes: ["~2 billion tokens a month across Azure AI Foundry and Anthropic", "Projected AI licensing costs cut to near zero"],
  },
  {
    title: "MCP Gateway, Registry & Portal",
    area: "AI · Governance",
    summary:
      "A governed way for teams to connect AI agents to internal systems and data, with tool-approval workflows and OAuth.",
    outcomes: ["~20 managed MCP servers"],
  },
  {
    title: "AI chat platform & agents",
    area: "AI · Adoption",
    summary: "An internal AI chat platform and agents grounded in company knowledge, built in Python, TypeScript and Go.",
    outcomes: ["~30 agents", "400 users across 14 teams"],
  },
  {
    title: "On-prem Kubernetes platform",
    area: "Kubernetes · GitOps",
    summary: "Talos Linux clusters run with GitOps (Flux and Argo CD), Cilium networking, and External Secrets Operator backed by Secret Server.",
    outcomes: [],
  },
  {
    title: "SD-WAN for every store",
    area: "Networking",
    summary: "Led the SD-WAN rollout to every store on CloudGenix, then migrated the store network to Meraki.",
    outcomes: ["2,300+ stores at the time", "Earlier: re-IP'd every store to one standard addressing plan"],
  },
  {
    title: "Data centers & disaster recovery",
    area: "Infrastructure",
    summary:
      "Directed the new primary data center build-out and migration, then the disaster recovery data center and the storage move from HPE Nimble to Pure Storage.",
    outcomes: ["Zero unplanned downtime", "Built hybrid connectivity: Azure tenant + ExpressRoute"],
  },
];

export interface Role {
  title: string;
  start: string;
  end?: string;
  highlights: string[];
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
  },
  {
    title: "Network Engineer",
    start: "Aug 2012",
    end: "Apr 2015",
    highlights: [
      "Designed a standard IP plan and re-IP'd every store network (2,300+ at the time)",
      "Led firewall migrations to Palo Alto and Meraki, and the Secret Server PAM rollout",
    ],
  },
  {
    title: "Network Analyst",
    start: "Nov 2009",
    end: "Aug 2012",
    highlights: ["Store network connectivity and SonicWALL firewall deployments"],
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
