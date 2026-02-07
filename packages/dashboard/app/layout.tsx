import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "FlareGate — API Marketplace Dashboard",
    description: "Escrow-based API marketplace for AI agents on Flare Network",
};

const NAV_LINKS = [
    { href: "/", label: "Catalog" },
    { href: "/escrows", label: "Escrows" },
    { href: "/live", label: "Live Feed" },
];

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const contractAddress = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";
    const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://coston-explorer.flare.network";

    return (
        <html lang="en">
            <body className="min-h-screen bg-flare-dark">
                <nav className="border-b border-flare-border bg-flare-dark/80 backdrop-blur-sm sticky top-0 z-50">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <h1 className="text-xl font-bold">
                                <span className="text-flare-coral">Flare</span>
                                <span className="text-white">Gate</span>
                            </h1>
                            <div className="flex items-center gap-4">
                                {NAV_LINKS.map((link) => (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        className="text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
                                coston Testnet
                            </span>
                            {contractAddress && (
                                <a
                                    href={`${explorerUrl}/address/${contractAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-gray-500 hover:text-flare-coral font-mono"
                                >
                                    {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
                                </a>
                            )}
                        </div>
                    </div>
                </nav>
                <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
            </body>
        </html>
    );
}
