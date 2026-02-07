const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";

export interface ApiListing {
  id: string;
  name: string;
  description: string;
  providerAddress: string;
  baseUrl: string;
  endpoints: {
    path: string;
    method: string;
    priceWei: string;
    description: string;
  }[];
}

export interface CatalogResponse {
  apis: ApiListing[];
  count: number;
  contractAddress: string;
  chainId: number;
  network: string;
}

export const fetchCatalog = async (): Promise<CatalogResponse> => {
  const resp = await fetch(`${GATEWAY_URL}/api/catalog`, {
    cache: "no-store",
  });
  return resp.json();
};
