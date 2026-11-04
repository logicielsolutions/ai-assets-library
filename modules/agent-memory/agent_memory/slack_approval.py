"""Lesson approval in Slack, through the team's safety net (logicielsolutions/agent-safety-net).

Optional: the rest of the module works without it. Each proposed lesson is posted to a Slack
channel; a reviewer replies approve or deny in the message's thread. Through the net, each lesson
also gets:
- a hidden-instruction scan before anyone is asked ("ignore all previous instructions..." is denied
  without pinging a reviewer)
- a cap on lessons asked per batch, so a looping agent can't flood the channel
- a record of who decided, and loop, budget and no-progress checks

    pip install "agent-safety-net @ git+https://github.com/logicielsolutions/agent-safety-net"
    export SLACK_BOT_TOKEN=xoxb-...            # a bot with chat:write + channels:history / groups:history

    from agent_memory import Memory
    from agent_memory.slack_approval import SlackLessonApproval
    mem = Memory(owner="Acme's support bot", namespace="acme", claims_to_lessons=True)
    SlackLessonApproval(mem, channel="#agent-memory-approvals", approvers=["U012ABCDEF"])

Proposals are handled one by one on a background thread, since a reviewer can take an hour. A lesson
nobody answers in time is denied with the reason "no answer in time"; it can be proposed again.
"""
import queue
import threading


class _Recording:
    """Wraps the approver to keep the last outcome and who gave it (the net doesn't hand those on)."""

    def __init__(self, approver):
        self.approver, self.outcome, self.who = approver, None, None

    def ask(self, req):
        self.outcome = self.approver.ask(req)
        self.who = req.get("approver")
        return self.outcome

    def alert(self, req):
        self.approver.alert(req)


class SlackLessonApproval:
    def __init__(self, mem, channel=None, approvers=None, timeout=3600, max_per_batch=5,
                 approver=None, recorder=None, start=True):
        """approver: any object with ask(request) -> "approved" | "denied" | "timeout" (default: the net's
        SlackApprover, token from SLACK_BOT_TOKEN). recorder: the net's recorder, e.g. JsonlRecorder."""
        try:
            from safety_net import NetStop, NetToolError, SafetyNet, Scanner, SlackApprover
        except ImportError as e:
            raise ImportError('Slack approval needs the safety net: pip install "agent-safety-net @ '
                              'git+https://github.com/logicielsolutions/agent-safety-net"') from e
        self.NetStop, self.NetToolError = NetStop, NetToolError
        self.lessons = mem.lessons
        self.approver = _Recording(approver or SlackApprover(channel=channel, timeout=timeout, approvers=approvers))
        scanner = Scanner()

        def clean(inputs):   # runs before anyone is asked
            v = scanner.scan(inputs["lesson"])
            return f"the lesson looks like hidden instructions ({', '.join(v.reasons)})" if v.blocked else None

        self.net = SafetyNet(
            risky=["save_lesson"], approver=self.approver,
            checks={"save_lesson": clean}, max_calls={"save_lesson": max_per_batch},
            tool_timeout={"save_lesson": 300, "*": 30},   # saving into Zep takes ~20 s
            no_retry=["save_lesson"],
            budget={"max_steps": 1000, "max_seconds": 3600},
            recorder=recorder)
        self.tools = self.net.wrap_tools({"save_lesson": self._save})
        self.queue = queue.Queue()
        self.log = []   # (lesson id, outcome, reason) for each decision, newest last
        self.lessons.notify = self.queue.put
        if start:
            threading.Thread(target=self.run, daemon=True).start()

    def _save(self, lesson, id, proposed_by):
        """The risky tool: runs only after a reviewer approves. Returns a different text per lesson,
        so the net's no-progress check never mistakes a run of approvals for a stuck agent."""
        if not any(x["id"] == id and x["status"] == "pending" for x in self.lessons.all()):
            return f"lesson {id} was already decided"
        self.lessons.approve(id, by=f"slack:{self.approver.who}")
        return f"saved lesson {id}"

    def handle(self, lesson):
        """Ask about one lesson and record the decision. Returns "approved", "denied" or "pending"."""
        self.approver.outcome = self.approver.who = None
        try:
            self.net.new_step()
            self.tools["save_lesson"](lesson=lesson["text"], id=lesson["id"], proposed_by=lesson.get("by", ""))
            outcome, reason = "approved", ""
        except self.NetToolError as e:
            reason = str(e)
            if "the most allowed" in reason:     # over this batch's cap: stays pending for the next batch
                self.log.append((lesson["id"], "pending", reason))
                return "pending"
            outcome = "denied"
            who = f"slack:{self.approver.who}" if self.approver.who else "safety net"
            reason = {"denied": "denied in Slack", "timeout": "no answer in time"}.get(self.approver.outcome, reason)
            if any(x["id"] == lesson["id"] and x["status"] == "pending" for x in self.lessons.all()):
                self.lessons.deny(lesson["id"], by=who, reason=reason)
        self.log.append((lesson["id"], outcome, reason))
        return outcome

    def run(self):
        """Background worker: one net run per batch of proposals waiting in the queue."""
        while True:
            batch = [self.queue.get()]
            while not self.queue.empty():
                batch.append(self.queue.get_nowait())
            self.net.start_run(name="agent-memory lessons")
            for i, lesson in enumerate(batch):
                try:
                    if self.handle(lesson) == "pending":
                        self.queue.put(lesson)
                except self.NetStop as e:   # the net stopped this batch; the rest wait for the next one
                    self.log.append((lesson["id"], "pending", f"net stopped: {e.reason}"))
                    for rest in batch[i:]:
                        self.queue.put(rest)
                    break
            self.net.end_run("done")
