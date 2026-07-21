# Agent V3 architecture

- `admin/`: server functions used by the CMS and Playground.
- `audit/`: deterministic and LLM-assisted brain audits.
- `brain/`: CMS module loading, global configuration and output guards.
- `integrations/`: Anthropic and media processing adapters.
- `memory/`: short-term conversation state and metadata extraction.
- `prompt/`: final prompt composition and module traceability.
- `selector/`: context detection and CMS-driven module routing.
- `telemetry/`: reserved boundary for V3 telemetry components.
- `orchestrator.server.ts`: production turn orchestration entry point.
- `router.server.ts`: routing entry point.

The CMS table `agent_modules_v3` is the only source of behavioral knowledge. Runtime code contains technical selection and orchestration logic only.
