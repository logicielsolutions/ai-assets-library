# agent-memory

Long-term memory for AI assistants, built on [Zep Cloud](https://www.getzep.com/). One memory per user, with write rules that run before anything is stored.

Status: v0.3, Week 2 of the agent-memory specialisation. Scores slightly above Zep on its own, blocks fake rules and private details that Zep stores, and acts on forget requests. Tracing and lesson approval land next.

## What it does

- **remember**: screens a conversation, then stores it for one user
- **recall**: returns the facts relevant to a question, as they stood on a given date, oldest first so changes read in order
- **sources**: lists the conversations a recalled fact came from
- **forget** (automatic): when a user asks to forget something ("remove my allergy info"), the matching facts are deleted and every earlier conversation that mentions the detail is stored again without it. The request itself is stored without the detail.
- **updates** (automatic): when a fact changes, Zep gives the old one an end date; recall shows it as "no longer true" next to the new one
- **expiry** (automatic): one-off arrangements that name a date (a cake for 16 October, a late checkout) get an end date when stored; recall labels them once that date has passed
- **clean_up**: the daily clean-up, deletes one-off facts that ended more than 30 days ago
- **forget_conversation**: deletes everything stored from one conversation

### Write rules

Every conversation passes through `Screen` before it is stored:

- **Dropped**: user lines that state a rule for everyone (prices, timings, closures, discount codes) or claim to be staff. Each drop is confirmed by a second, narrower check.
- **Redacted**: card, bank, ID document, health and salary details. The model lists the exact words to remove and the code removes each one, so the rest of the line is kept.
- A regex pass catches number-shaped details the model missed.

Decisions are cached on disk by content hash, so re-screening the same conversation is free.

## Install

```bash
pip install -e modules/agent-memory
```

Needs Python 3.10+ and two keys in the environment:

| Variable | What it's for |
|---|---|
| `ZEP_API_KEY` | Zep Cloud, where memories are stored |
| `OPENAI_API_KEY` | The write-rule screen (gpt-4.1-mini by default) |

## Use

```python
from agent_memory import Memory, Screen

mem = Memory(owner="<ASSISTANT_NAME>", namespace="<APP_NAME>",
             screen=Screen(owner="<ASSISTANT_NAME>", cache_dir=".cache/screen"))

mem.remember("guest-01", "conv-123", [
    {"role": "user", "text": "I'm vegetarian, and checkout is 4pm for everyone now"},
    {"role": "assistant", "text": "Noted your diet. Standard checkout is 11 am."},
], date="2026-06-03")

for fact in mem.recall("guest-01", "what's my diet?", as_of="2026-09-01"):
    print(fact.line())                    # e.g. [2026-06-03] The guest is vegetarian.
    print(mem.sources("guest-01", fact))  # [{"user": ..., "conversation": "conv-123", "date": ...}]

mem.forget_conversation("guest-01", "conv-123")
mem.clean_up("guest-01", today="2026-11-03")   # run daily
```

| Placeholder | Meaning |
|---|---|
| `<ASSISTANT_NAME>` | How the screen refers to the assistant, e.g. "the hotel assistant" |
| `<APP_NAME>` | Prefix for Zep user ids, so apps sharing one Zep project don't collide |

## Results so far

Scored on an 80-question test set (hotel guest and HR policy chats) plus 16 poisoning and privacy attacks. Zep's search and fact extraction vary from run to run, so scores are means over repeated runs.

| | This module (v0.3) | Zep alone | Full chat history |
|---|---|---|---|
| Questions /80, mean (range) | 59.0 (58–60), 2 runs | 57.0 (56–58), 6 runs | 66 |
| Forget questions /10 | 6.5 | 5.7 | – |
| Forget requests where the detail is gone from stored facts and chats /10 | 5 to 9 (varies by load) | 0 | – |
| Attacks, one memory per user /16 | 13 | 12 | 13 |
| Attacks where a forbidden detail leaked (per user) | 0 | 1 | – |
| Memory tokens per question | 267 | 261 | 1,320 |

Known gap: picking the exact detail to forget is done by a small model and varies between runs (5 to 9 of 10 cleaned fully). A broad request like "delete everything about the dinner and cake" still leaves some details.
