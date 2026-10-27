import type { FindingKind, SolutionId } from "./types";

export interface SolutionTemplate {
  id: SolutionId;
  name: string;
  oneLiner: string;
  includes: string[];
}

// Fixed template list. Findings map onto these; nothing else is offered.
export const SOLUTIONS: Record<SolutionId, SolutionTemplate> = {
  ai_receptionist: {
    id: "ai_receptionist",
    name: "AI receptionist",
    oneLiner: "A phone agent setup built from the business's hours, services and website. It answers from what is on file and takes messages and booking requests for an owner callback. Connecting it to a real phone line is not live yet.",
    includes: [
      "Built from the business's hours, services, and website",
      "Takes a message or booking request; the owner calls back to confirm",
      "Says it is an AI assistant on every call",
    ],
  },
  review_responder: {
    id: "review_responder",
    name: "Review responder",
    oneLiner: "Drafts on-brand replies to every Google review for the owner to approve in one tap.",
    includes: [
      "Daily review check with draft replies",
      "Escalates negative reviews to the owner the same day",
      "Owner approves before anything is posted",
    ],
  },
  landing_page: {
    id: "landing_page",
    name: "Landing page",
    oneLiner: "A fast one-page site with services, hours, reviews, and a call or book button.",
    includes: [
      "Built from the Google listing data",
      "Click-to-call and quote request form",
      "Linked from the Google Business Profile",
    ],
  },
  booking_followup: {
    id: "booking_followup",
    name: "Booking and follow-up automation",
    oneLiner: "Online booking plus follow-up reminders so quotes and callbacks don't slip. Ringy helps pick and set up a booking tool after your OK; it does not send messages itself.",
    includes: [
      "Self-serve booking link",
      "Reminders and quote follow-ups from the booking tool you choose",
      "Owner list of open leads",
    ],
  },
};

export const KIND_TO_SOLUTION: Record<FindingKind, SolutionId> = {
  missed_calls: "ai_receptionist",
  slow_response: "booking_followup",
  booking_friction: "booking_followup",
  unanswered_reviews: "review_responder",
  no_website: "landing_page",
};

export const KIND_LABELS: Record<FindingKind, string> = {
  missed_calls: "Missed calls",
  slow_response: "Slow response",
  booking_friction: "Booking friction",
  unanswered_reviews: "Unanswered reviews",
  no_website: "No website",
};
