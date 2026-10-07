# Conversation quality evaluation — 2026-10-07

## What actually ran

Eight real calls/conversation turns against existing `sculpy-chat` v2, using three fictional bookings only. No business records were written. Raw replies, usage and latency are in `scripts/fixtures/conversation-baseline.json`.

Manual review found correct current times/locations, an accurate 20-minute gap, no change proposal when told not to change, a pending-confirmation note, correct switch to Lily, no claim that her deposit arrived, rejection of stale chat time, disambiguation of two Sarahs, and no invented entrance password. The incomplete utterance prompted clarification.

One material weakness: the assistant called a 20-minute gap “时间上可行” before acknowledging unknown travel/preparation time. This is not sufficient evidence of feasibility. The clarification for a garbled utterance also included unnecessary booking details.

Initial automated checks passed 6/8, with two false negatives caused by expecting `14:00` rather than the equivalent `下午2点`. They missed the feasibility wording issue. These are heuristic checks, not proof of correctness. The checked-in runner accepts both time forms and rejects the observed premature claim. Manual transcript review remains required.

Observed original run latency: 5.1–9.1 seconds per turn, including network and model tools. Not a speed guarantee.

## Changes deployed to sculpy-chat v3

- Natural short paragraphs, no obligatory headings/checklists/closing offer.
- Immediate user request overrides a standing preference for long responses.
- Distinguish nonoverlap from feasible travel; do not invent route times.
- Clarify ambiguous names/incomplete utterances; respect explicit corrections and “don't change”.
- Put the freshly read context after older dialogue, retaining current-record precedence.

Existing 12 relevant local contract/domain tests pass. These use mocked model responses and do NOT establish improved naturalness. The user explicitly approved deployment on 2026-10-07. Deployed sculpy-chat v3 and re-ran all eight cases with the real model: 8/8 revised heuristic checks passed, with manual transcript review. The feasibility answer now correctly says travel/preparation time is unknown and arrival cannot be confirmed. Unauthenticated production history returned HTTP 401. Latency was 3.9–7.9 seconds. This is a small sample, not a reliability guarantee. See scripts/fixtures/conversation-v3.json.

## Re-run

`node scripts/conversation-eval.mjs /tmp/sculpy-eval.json`

Optionally set `SCULPY_EVAL_URL` to an authorized test endpoint. This runner uses the fictional demo request path, not production auth/data. It does not click/save proposed cards. Review every response manually; do not rely on the count alone. Calls incur normal model usage.

## Limits and needed input

- Eight short scenarios are not a reliability guarantee; no real audio transcription tested.
- Model prose still has no deterministic fact-by-fact validation. Prompt wording cannot guarantee critical facts are always correct. A future source-backed time/location display and structured conflict calculation can reduce this risk.
- Formal date/time/payment fields are not directly edited by chat; confirmation cards save notes or pending suggestions.
- Only the latest 12 conversation turns, 20 work logs and 30 context records are available per current implementation. No automatic long-term personal memory.
- No route/weather tools, so actual travel feasibility remains unknown without supplied evidence.
- This run does not re-certify production account isolation, database writes or failure recovery.
- Next useful user input: 5–10 anonymized real utterance sequences (including corrections), the desired response style, and company rules for arrival/preparation buffers. These guide additional cases without inventing operational policy.

## Existing options checked

Promptfoo offers reusable multi-turn testing: https://www.promptfoo.dev/docs/configuration/chat/ . For this small pass, the existing native Node/curl approach was extended without adding a framework dependency. Promptfoo is not installed or tested here. No new memory service was integrated.
