import type { Metadata } from "next";
import { TrackingView } from "./tracking-view";

export const metadata: Metadata = { title: "Private package tracking | ParcelTrack", description: "View the latest available package updates.", robots: { index: false, follow: false } };
export default function PublicTrackingPage() { return <TrackingView />; }
