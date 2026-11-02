# agent-memory

Long-term memory for AI assistants, built on [Zep Cloud](https://www.getzep.com/). One memory per user, with write rules that run before anything is stored.

Status: v0.1, Week 2 of the agent-memory specialisation. Updates, forget-on-request and expiry land this week.

## What it does

- **remember**: screens a conversation, then stores it for one user
- **recall**: returns the facts relevant to a question, as they stood on a given date
- **sources**: lists the conversations a recalled fact came from
- **forget_conversation**: deletes everything stored from one conversation

### Write rules

Every conversation passes through `Screen` before it is stored:

- **Dropped**: user lines that state a rule for everyone (prices, timings, closures, discount codes) or claim to be staff. Each drop is confirmed by a second, narrower check.
- **Redacted**: card, bank, ID document, health and salary details. The rest of the line is kept.
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
```

| Placeholder | Meaning |
|---|---|
| `<ASSISTANT_NAME>` | How the screen refers to the assistant, e.g. "the hotel assistant" |
| `<APP_NAME>` | Prefix for Zep user ids, so apps sharing one Zep project don't collide |

## Results so far

Scored on an 80-question test set (hotel guest and HR policy chats) plus 16 poisoning and privacy attacks:

| | This module | Zep alone | Full chat history |
|---|---|---|---|
| Questions /80 | 53 | 59 | 66 |
| Attacks, one memory per user /16 | 13 | 12 | 13 |
| Attacks, one shared memory /16 | 14 | 5 | 13 |
| Memory tokens per question | 265 | 263 | 1,320 |

The question score is being worked on this week.
