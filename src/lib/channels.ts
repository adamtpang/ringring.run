// "Talk to Ringy": which channels exist, what the owner agrees to, and the
// rules for saving a preference. Pure. Only browser voice is live; nothing in
// the app sends email, calls, SMS or WhatsApp messages.
import { z } from "zod";
import { CHANNEL_IDS, type ChannelId, type ChannelOptin, type OptinStatus } from "./types";

export const CONSENT_VERSION = "2026-10-27";

export interface Channel {
  id: ChannelId;
  label: string;
  live: boolean;
  /** What happens today, in plain words. */
  today: string;
  contact: "none" | "email" | "phone";
}

export const CHANNELS: Channel[] = [
  { id: "browser_voice", label: "Browser voice", live: true, contact: "none", today: "Live: talk to Ringy from this site, in English. You start every call." },
  { id: "email", label: "Email", live: false, contact: "email", today: "Coming soon. Ringy does not send email yet; saving puts you on the list." },
  { id: "phone", label: "Phone call", live: false, contact: "phone", today: "Coming soon. Ringy does not place or take calls yet; saving puts you on the list." },
  { id: "sms", label: "SMS", live: false, contact: "phone", today: "Coming soon. Ringy does not text yet; saving puts you on the list." },
  { id: "whatsapp", label: "WhatsApp", live: false, contact: "phone", today: "Coming soon. Ringy is not on WhatsApp yet; saving puts you on the list." },
];
export const channelOf = (id: ChannelId): Channel => CHANNELS.find((c) => c.id === id)!;

const phrase = (c: Channel) => (c.id === "sms" || c.id === "whatsapp" ? c.label : c.label.toLowerCase());

/** The exact words the owner ticks. Stored verbatim with the timestamp. */
export function consentText(channel: ChannelId, businessName: string): string {
  const c = channelOf(channel);
  const who = `I own or manage ${businessName} and I am choosing this myself.`;
  if (c.live)
    return `${who} I want to talk with Ringy, an AI agent, by browser voice on this site. I start each call. The call is handled by Ringy's voice provider, ElevenLabs. I can withdraw at any time.`;
  return `${who} I want Ringy, an AI agent, to reach me by ${phrase(c)} at the contact I gave, once that channel is live. It is not live yet. Ringy will not contact me on it until I confirm again, and I can withdraw at any time.`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ().-]{7,20}$/;

export const OptinRequestSchema = z
  .object({
    channel: z.enum(CHANNEL_IDS),
    action: z.enum(["opt_in", "withdraw"]).default("opt_in"),
    consent: z.boolean().optional(),
    contact: z.string().trim().max(120).optional(),
    consent_version: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "withdraw") return;
    if (v.consent !== true) ctx.addIssue({ code: "custom", message: "Tick the consent box first." });
    if (v.consent_version !== CONSENT_VERSION) ctx.addIssue({ code: "custom", message: "The consent text changed. Reload the page and read it again." });
    const kind = channelOf(v.channel).contact;
    if (kind === "email" && !EMAIL.test(v.contact ?? "")) ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
    if (kind === "phone" && (!PHONE.test(v.contact ?? "") || (v.contact ?? "").replace(/\D/g, "").length < 7)) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
  });
export type OptinRequest = z.infer<typeof OptinRequestSchema>;

/** The row to store. The server writes its own consent text, never the client's. */
export function optinRow(businessId: string, businessName: string, req: OptinRequest, at: string): Omit<ChannelOptin, "id" | "created_at"> {
  const c = channelOf(req.channel);
  const withdraw = req.action === "withdraw";
  const status: OptinStatus = withdraw ? "withdrawn" : c.live ? "opted_in" : "waitlist";
  return {
    business_id: businessId,
    channel: req.channel,
    status,
    contact: withdraw || c.contact === "none" ? null : (req.contact ?? null),
    consent_text: withdraw ? `Withdrawn by the owner for ${phrase(c)}.` : consentText(req.channel, businessName),
    consent_version: CONSENT_VERSION,
    consented_at: at,
    source: "talk_to_ringy",
  };
}

export function maskContact(contact: string | null): string | null {
  if (!contact) return null;
  if (contact.includes("@")) {
    const [u, d] = contact.split("@");
    return `${u!.slice(0, 1)}***@${d}`;
  }
  const digits = contact.replace(/\D/g, "");
  return `***${digits.slice(-2)}`;
}

/** What the page shows: the current state per channel, contact masked. */
export interface ChannelState {
  channel: ChannelId;
  status: OptinStatus | "none";
  contact: string | null;
  consented_at: string | null;
}
export function currentStates(rows: ChannelOptin[]): ChannelState[] {
  return CHANNELS.map((c) => {
    const matched = rows.filter((r) => r.channel === c.id);
    const latest = matched.sort((a, b) => b.consented_at.localeCompare(a.consented_at) || b.created_at.localeCompare(a.created_at) || rows.indexOf(a) - rows.indexOf(b))[0];
    return latest
      ? { channel: c.id, status: latest.status, contact: latest.status === "withdrawn" ? null : maskContact(latest.contact), consented_at: latest.consented_at }
      : { channel: c.id, status: "none", contact: null, consented_at: null };
  });
}
