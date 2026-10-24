// Sample inputs for the demo. Taken from the reference mockup (handover-handoff.zip, mockup-final-C/01, 03).
// One click fills the form so the demo never depends on typing.

export const SELLER_SAMPLE = {
  role: "Telecom billing support (US carriers)",
  years: "5",
  notes: "",
  answers: {
    q1: "A roaming charge that lands within 3 days of a plan change is almost always a cycle overlap, not real roaming. The manual treats it as a dispute; it's a billing error. Prorate, don't argue.",
    q2: "They offer a goodwill credit first. Once you say \"goodwill\" the customer hears \"you admit it's wrong\" and asks for the whole bill. Say what was correct before you say what you'll fix.",
    q3: "Refund of 6 months of international add-on after the customer \"didn't notice\". Refused beyond 1 cycle: the add-on shows on every bill and the app sends a monthly notice. Offered to cancel it and refund the current cycle only.",
    q4: "Two lines on one account, one line changed plan mid-cycle. The script prorates the whole account. I prorate only the changed line and re-run the shared data pool for the remaining days — otherwise the other line gets an overage it never had.",
  },
  followups: {
    f1: "If the customer changed plan from the app, the account shows a timestamp and the old plan ends that day — no overlap exists, so a roaming charge after it is real. Also real if the roaming location is outside the new plan's zone.",
    f2: "\"The charge was correct for your old plan. The switch date is what we're fixing.\" Then the amount. Never the amount first.",
  },
};

// The rejected-input sample: a pasted call log. Used to show the refusal in the demo.
export const SELLER_SAMPLE_LOG = "[10:42:17] AGENT: Thank you for calling, how can I help?\n[10:42:25] CUSTOMER: I was charged $48 roaming after I changed my plan…\n[10:42:41] AGENT: Let me check the plan-change date.";

export const BUYER_SAMPLE = {
  demand: "Our support AI fails on roaming-charge disputes after a mid-cycle plan change. Customers escalate and demand full refunds; we have no human pool to route them to.",
  question: "Customer changed plan mid-cycle, then got a $48 roaming charge from the old plan. Do we refund? How much?",
};
