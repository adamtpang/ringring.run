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
    oneLiner: "Answers every call and text 24/7 in the business's voice, books jobs, and routes emergencies.",
    includes: [
      "Trained on the business's hours, services, and service area",
      "Books or captures the lead, then texts a summary to the owner",
      "Discloses that it is an AI assistant on every call",
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
    oneLiner: "Online booking plus automatic text follow-ups so quotes and callbacks never slip.",
    includes: [
      "Self-serve booking link",
      "Automatic reminders and quote follow-ups by text",
      "Owner dashboard of open leads",
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
