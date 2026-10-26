import type { Metadata } from "next";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard | ringring.run" };

export default function DashboardPage() {
  return <DashboardClient />;
}
