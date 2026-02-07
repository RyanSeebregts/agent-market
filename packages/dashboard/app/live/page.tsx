"use client";

import { EventFeed } from "@/components/EventFeed";

export default function LivePage() {
    return (
        <div>
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Live Event Feed</h2>
                <p className="text-gray-400">
                    Real-time contract events from the FlareGate escrow contract on coston
                </p>
            </div>

            <EventFeed />
        </div>
    );
}
