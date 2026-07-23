# Agent V3 — Cost Optimization checkpoint

Base: `agent-whatsaap-aa3b98f6-main(32).zip`

## Changes

- Removed the requirement for Claude to generate hidden lead-intelligence markers on every reply.
- Lead telemetry is now derived deterministically from the existing module-selector context.
- Kept Playground intelligence fields populated without paying output tokens for hidden metadata.
- Reduced Anthropic `max_tokens` from 1024 to 384 for the WhatsApp-focused V3 runtime.
- Tightened the system instruction to prefer 1–4 short sentences and avoid repeating information already present in history.
- Playground now loads only the 10 most recent messages instead of resending the whole session forever.
- Playground sequence numbering now uses the latest stored sequence, so limiting history does not reset sequence numbers.
- Added static regression tests in `tests/agent-v3/cost-optimization.test.ts`.

## Expected effect

The largest saving should come from output tokens: Claude no longer writes TEMP/CONF/INTENT/STAGE/PROB/SENT/URG/ACTION/REASON/SCORE/FEEDBACK text that is stripped before delivery.

Long Playground sessions should also stop growing input cost without bound because only the recent window is sent to the orchestrator.
