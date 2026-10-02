---
title: "One gateway, three generations"
description: "How I built The Aaron's Company's AI Gateway three times in eighteen months, and why each version was retired."
pubDate: 2026-10-02
tags: [ai, platforms, governance]
draft: true
---

<!-- Draft from the 2026-10-02 case-study pass. Every fact below was confirmed by Jason; check the wording is yours
     before setting draft: false. IMAGE notes mark where a figure would help. -->

Every model call at The Aaron's Company, a 15,000-person retailer, goes through one gateway. Claude Code, Claude
Desktop, our agents and the people using our internal tools all reach Azure AI Foundry and Anthropic through it.
I built it alone, then rebuilt it twice in eighteen months.

## Quick facts

- **Role:** designer and sole builder; Manager, Infrastructure Services
- **Timeline:** built December 2024 to June 2026; the current version has been in production since June 2026
- **Scale:** from about 15 million tokens a month at launch to about 2 billion, across 400 users and 14 teams
- **Cost:** projected licensing from $100K+ a year to about $38K, then to near zero

## The problem

The first version was a quick way to give teams safe access to models. Demand showed up immediately, and so did
three questions the business kept asking: who is spending what, on which model, and under which rules. Each
generation was retired when it could no longer answer them.

## Generation 1: LiteLLM (December 2024)

LiteLLM was fast to stand up and proved the demand. It couldn't attribute cost per team or enforce policy per use
case, and its licensing was projected at more than $100,000 a year.

## Generation 2: Azure API Management (February 2026)

Moving to Azure API Management added single sign-on and rate limits, and cut projected licensing to about $38,000 a
year. But routing and guardrails were awkward to express in it, and those were exactly the parts the business
needed next.

## Choosing to build

Before writing the third generation I evaluated Portkey, Kong AI Gateway, Envoy, Agent Gateway and kgateway. Each
one either lacked features we needed or cost too much. Building in-house was the option that answered all three
questions at a licensing cost close to zero.

## Generation 3: in-house (June 2026)

<!-- IMAGE: the home page's gateway figure: callers on the left, the gateway's checks, models and MCP servers on the
     right, the audit log underneath. -->

The current gateway runs on our on-prem Kubernetes platform, managed through GitOps. Every request:

- signs in with SSO, so cost is tracked per user and per team;
- is rate limited;
- passes guardrails that check for personal data, secrets, prompt injection and restricted topics;
- can be answered from a cache instead of a model;
- is routed to Azure AI Foundry or Anthropic;
- is written to an audit log kept for at least 90 days and reviewed by audit and compliance.

Tools sit behind a separate MCP Gateway, which reaches only the MCP servers approved into our registry, over OAuth.

## Results

| Metric | Before | Now |
| :--- | :--- | :--- |
| Tokens a month | about 15 million (launch) | about 2 billion |
| Projected licensing | $100K+ a year (LiteLLM) | near zero |

## What I'd do differently

Talk to the business units sooner. Each generation was replaced because a need surfaced after it shipped; asking
earlier would have found some of those needs before I built around them.
