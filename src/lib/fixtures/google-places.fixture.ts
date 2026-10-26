// DEMO FIXTURE DATA. Every business below is fictional. Names, phone numbers
// (555-01xx fictional range), addresses, websites (example.com / example.org),
// and reviews are invented for demo and test purposes only. Nothing here
// describes a real business.
//
// Items use the same shape as compass~crawler-google-places dataset items so
// the fixture scraper exercises the same normalizer as the real Apify path.

import type { ApifyPlaceItem } from "../scraper/apify-types";

type R = [stars: number, text: string, ownerReply?: string];

function place(
  n: number,
  title: string,
  opts: {
    website?: string | null;
    phone?: string | null;
    rating: number;
    reviewsCount: number;
    hours?: boolean;
    reviews: R[];
    behavior?: "fail_diagnosis" | "hallucinate";
  },
): ApifyPlaceItem {
  const id = `fixture-${String(n).padStart(3, "0")}`;
  return {
    title,
    placeId: id,
    categoryName: "Plumber",
    address: `${100 + n} Example Street, Austin, TX 78701`,
    city: "Austin",
    state: "Texas",
    phone: opts.phone === undefined ? `(512) 555-01${String(n).padStart(2, "0")}` : opts.phone,
    website: opts.website === undefined ? `https://${id}.example.com` : opts.website,
    totalScore: opts.rating,
    reviewsCount: opts.reviewsCount,
    url: null,
    openingHours:
      opts.hours === false
        ? []
        : [
            { day: "Monday", hours: "8 AM to 5 PM" },
            { day: "Tuesday", hours: "8 AM to 5 PM" },
            { day: "Wednesday", hours: "8 AM to 5 PM" },
            { day: "Thursday", hours: "8 AM to 5 PM" },
            { day: "Friday", hours: "8 AM to 5 PM" },
            { day: "Saturday", hours: "Closed" },
            { day: "Sunday", hours: "Closed" },
          ],
    reviews: opts.reviews.map(([stars, text, reply], i) => ({
      reviewId: `${id}-r${i + 1}`,
      stars,
      text,
      publishedAtDate: new Date(Date.UTC(2026, 8, 28 - i * 3)).toISOString(),
      responseFromOwnerText: reply ?? null,
    })),
    __fixture: true,
    __fixtureBehavior: opts.behavior,
  };
}

export const FIXTURE_PLACES: ApifyPlaceItem[] = [
  place(1, "Example Plumbing Co", {
    rating: 3.6,
    reviewsCount: 48,
    reviews: [
      [2, "Called three times on a Monday morning and it went straight to voicemail. Ended up hiring someone else."],
      [5, "Great work on our water heater once we finally got on the schedule."],
      [1, "Nobody answered the phone during business hours. Left a message and never got a call back."],
      [4, "Fair price for a slab leak repair. Communication could be better."],
      [3, "Good tech but it took days to get a quote emailed to me."],
    ],
  }),
  place(2, "Sample Drain and Sewer (Demo)", {
    website: null,
    rating: 4.2,
    reviewsCount: 15,
    reviews: [
      [5, "Cleared our main line fast. Wish they had a website so I could see their prices."],
      [4, "Friendly crew. I found them by word of mouth since I could not find them online."],
      [2, "Hard to schedule an appointment. They only take bookings over the phone."],
      [5, "Honest and on time."],
    ],
  }),
  place(3, "Demo Rooter Services", {
    rating: 3.2,
    reviewsCount: 61,
    reviews: [
      [1, "Terrible experience. The tech left a mess and the office never responded to my complaint."],
      [2, "Overcharged for a simple clog. No one from the company ever followed up."],
      [1, "Showed up four hours late with no call."],
      [4, "Fixed the toilet, decent price."],
      [2, "Rude on the phone and slow to respond to emails."],
    ],
  }),
  place(4, "Placeholder Pipe Works", {
    rating: 4.6,
    reviewsCount: 120,
    reviews: [
      [5, "Excellent service, very professional.", "Thank you for trusting us!"],
      [5, "They fixed a burst pipe on a Sunday night.", "Glad we could help."],
      [4, "Good work, the online booking was easy.", "Thanks for the kind words."],
      [3, "Called after hours and only got a voicemail, but they called back the next morning.", "Sorry for the wait!"],
    ],
  }),
  place(5, "Example Water Heater Pros", {
    rating: 4.0,
    reviewsCount: 33,
    reviews: [
      [3, "Could not get through on the phone for two days. Once I did, the install was solid."],
      [2, "I tried to book online but there is no online booking, so I gave up and called a competitor."],
      [5, "Knowledgeable and quick."],
      [4, "Good price on a tankless unit."],
    ],
  }),
  place(6, "Test Fixture Leak Repair", {
    website: null,
    phone: null,
    hours: false,
    rating: 4.8,
    reviewsCount: 9,
    reviews: [
      [5, "Found the leak behind the wall quickly."],
      [5, "My neighbor recommended them. Hard to find any contact info online."],
      [4, "Good work, but I had to message them on social media to reach them."],
    ],
  }),
  place(7, "Example Flaky Diagnosis LLC", {
    rating: 3.9,
    reviewsCount: 27,
    behavior: "fail_diagnosis",
    reviews: [
      [2, "Went straight to voicemail every time I called."],
      [4, "Decent repair on our kitchen sink."],
    ],
  }),
  place(8, "Example Hallucination Check Co", {
    rating: 3.4,
    reviewsCount: 40,
    behavior: "hallucinate",
    reviews: [
      [2, "Nobody answered the phone when our basement flooded."],
      [3, "Okay service, slow to respond to my quote request."],
      [4, "Solid work on the gas line."],
    ],
  }),
  place(9, "Example Emergency Plumbers", {
    rating: 3.8,
    reviewsCount: 74,
    reviews: [
      [1, "Their emergency line went to voicemail at 2 AM. Not much of an emergency service."],
      [2, "Left two messages and never heard back."],
      [5, "When they showed up they were great."],
      [3, "Still waiting on the invoice they promised to send last week."],
    ],
  }),
  place(10, "Sample Family Plumbing", {
    rating: 4.4,
    reviewsCount: 52,
    reviews: [
      [5, "Family owned and it shows. Very kind."],
      [2, "Scheduling was a nightmare, three phone calls just to book a visit."],
      [4, "Good work on the shower valve."],
      [3, "Nice people but took forever to get back to me with a quote."],
    ],
  }),
  place(11, "Demo Pipe and Valve", {
    rating: 3.7,
    reviewsCount: 18,
    reviews: [
      [2, "Couldn't get a hold of anyone for a week."],
      [1, "No response to my review or my emails about a warranty issue."],
      [4, "Fixed the leak, fair price."],
    ],
  }),
  place(12, "Example Quiet Plumbing", {
    rating: 4.9,
    reviewsCount: 210,
    reviews: [
      [5, "Fantastic, would hire again.", "Thank you!"],
      [5, "Quick, clean, and polite.", "We appreciate you!"],
      [5, "Best plumber we have used.", "Thanks so much."],
    ],
  }),
];
