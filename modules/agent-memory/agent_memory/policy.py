"""What the memory may keep, per product. The module's code is the same everywhere; only this changes.

    from agent_memory import Memory, Policy
    mem = Memory(owner="Acme's support bot", policy="support")          # a preset
    mem = Memory(owner="Acme's support bot", policy=Policy(             # or your own
        global_rules="plan prices, refund windows, SLAs, outage status",
        one_off="a support ticket, a scheduled call, a delivery"))

Fields:
- never_store: details that are removed before anything is saved (kind -> what it covers)
- allowed: details that look sensitive but are fine to keep for this product
- global_rules: rules that only the business sets; a user stating one for everyone is ignored
- one_off: arrangements tied to one date, which expire after it
"""
from dataclasses import dataclass, field, replace

NEVER_STORE_DEFAULT = {
    "card": "payment card numbers, last 4 digits of a card, card expiry dates, CVV",
    "bank": "bank account numbers, IFSC or routing codes",
    "id_document": "passport, national ID, tax ID or driving licence numbers (e.g. Aadhaar, PAN)",
    "health": "medical conditions, diagnoses, the reason for sick leave, and anything that reveals a "
              "condition: medication, insulin, inhalers, medical devices, treatments. Remove every such word.",
    "salary": "the user's salary, CTC or in-hand pay amounts",
    "secret": "passwords, PINs, one-time codes, API keys",
}


@dataclass
class Policy:
    name: str = "generic"
    never_store: dict = field(default_factory=lambda: dict(NEVER_STORE_DEFAULT))
    allowed: str = ("names, phone numbers, emails, preferences, food allergies and diets, dates, "
                    "orders, bookings and appointments, amounts the user is claiming or paying")
    global_rules: str = ("prices, discounts or promo codes for everyone, opening or service hours, "
                         "policies, deadlines, eligibility rules, closures or outages")
    one_off: str = ("an order, a booking, an appointment, a delivery, a request for one specific "
                    "date or event")


PRESETS = {
    "generic": Policy(),
    "hotel": Policy(
        name="hotel",
        allowed=Policy().allowed + ", booking details",
        global_rules="room rates, discounts or codes for everyone, checkout or opening times, facility "
                     "closures, pet rules, hotel policies",
        one_off="a booking, a room request for one trip, an extra bed, a cake, a late checkout, an airport "
                "pickup"),
    "hr": Policy(
        name="hr",
        allowed=Policy().allowed + ", pregnancy and due dates (needed for leave), expense claim amounts, "
                                   "salary payment dates",
        global_rules="notice periods, holidays, WFH rules, leave policy, bonus decisions, office rules",
        one_off="a leave request, a business trip, a claim being processed, an appointment"),
    "support": Policy(
        name="support",
        allowed=Policy().allowed + ", account and order IDs, device and plan details",
        global_rules="plan prices, refund windows, SLAs, feature availability, outage status, company policies",
        one_off="a support ticket, a scheduled call, a delivery, a replacement order, a temporary workaround"),
}

# The test bench runs hotel and HR chats through one screen, so it uses both sets of examples.
PRESETS["test-bench"] = replace(
    PRESETS["hr"], name="test-bench",
    allowed=PRESETS["hr"].allowed + ", booking details",
    global_rules=PRESETS["hotel"].global_rules + ", " + PRESETS["hr"].global_rules,
    one_off=PRESETS["hotel"].one_off + ", " + PRESETS["hr"].one_off)


def get(policy):
    """A Policy, a preset name, or None (generic)."""
    if policy is None:
        return PRESETS["generic"]
    return PRESETS[policy] if isinstance(policy, str) else policy
