import type { Metadata } from "next";
import { FindClient } from "./FindClient";

export const metadata: Metadata = { title: "Find a business" };

export default function FindPage() {
  return <FindClient />;
}
