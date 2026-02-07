import { ApiCard } from "@/components/ApiCard";
import { fetchCatalog } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch {
    catalog = null;
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">API Marketplace</h2>
        <p className="text-gray-400">
          Discover and consume APIs with trustless escrow payments on Flare Network
        </p>
      </div>

      {catalog ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-flare-card border border-flare-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{catalog.count}</p>
              <p className="text-xs text-gray-500 mt-1">Available APIs</p>
            </div>
            <div className="bg-flare-card border border-flare-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-flare-coral">{catalog.chainId}</p>
              <p className="text-xs text-gray-500 mt-1">Chain ID</p>
            </div>
            <div className="bg-flare-card border border-flare-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{catalog.network}</p>
              <p className="text-xs text-gray-500 mt-1">Network</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalog.apis.map((api) => (
              <ApiCard key={api.id} api={api} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">Gateway not running</p>
          <p className="text-gray-600 text-sm">
            Start the gateway server: <code className="text-flare-coral">npm run gateway</code>
          </p>
        </div>
      )}
    </div>
  );
}
