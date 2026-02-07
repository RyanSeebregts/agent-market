import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import * as path from "path";
import { Wallet } from "ethers";

import weatherMock from "./mocks/weather.js";
import jokesMock from "./mocks/jokes.js";
import pricesMock from "./mocks/prices.js";
import { makeCatalogRouter } from "./routes/catalog.js";
import { makeProxyRouter } from "./routes/proxy.js";
import { makeRegisterRouter } from "./routes/register.js";
import { makeEscrowsRouter } from "./routes/escrows.js";
import { makeLiveLayer } from "./layers.js";

// Load env from root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
app.use(cors());
app.use(express.json());

// Mount mock APIs
app.use("/mock", weatherMock);
app.use("/mock", jokesMock);
app.use("/mock", pricesMock);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "FlareGate Gateway" });
});

// Check required env vars
const GATEWAY_PRIVATE_KEY = process.env.GATEWAY_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://coston-api.flare.network/ext/C/rpc";
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;
const PORT = parseInt(process.env.GATEWAY_PORT || "3000", 10);

if (!GATEWAY_PRIVATE_KEY) {
    console.error("GATEWAY_PRIVATE_KEY is not set in .env");
    console.error("Generate one with: node -e \"console.log(require('ethers').Wallet.createRandom().privateKey)\"");
    process.exit(1);
}

if (!ESCROW_CONTRACT_ADDRESS) {
    console.error("ESCROW_CONTRACT_ADDRESS is not set in .env");
    console.error("Deploy the contract first: npm run deploy");
    process.exit(1);
}

// Print gateway wallet info
const gatewayWallet = new Wallet(GATEWAY_PRIVATE_KEY);
console.log(`\n--- FlareGate Gateway ---`);
console.log(`Gateway wallet: ${gatewayWallet.address}`);
console.log(`Contract:       ${ESCROW_CONTRACT_ADDRESS}`);
console.log(`RPC:            ${RPC_URL}`);
console.log(`Network:        coston Testnet (Chain ID: 16)`);

// Update registry provider addresses to use gateway wallet
import * as fs from "fs";
const registryPath = path.resolve(__dirname, "../data/registry.json");
try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    let updated = false;
    for (const listing of registry) {
        if (!listing.providerAddress || listing.providerAddress === "") {
            listing.providerAddress = gatewayWallet.address;
            updated = true;
        }
    }
    if (updated) {
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        console.log(`Updated registry provider addresses to ${gatewayWallet.address}`);
    }
} catch (e) {
    console.warn("Could not update registry:", e);
}

// Build Effect layers
const liveLayer = makeLiveLayer({
    privateKey: GATEWAY_PRIVATE_KEY,
    rpcUrl: RPC_URL,
    contractAddress: ESCROW_CONTRACT_ADDRESS,
});

// Mount API routes
app.use("/api", makeCatalogRouter(liveLayer));
app.use("/api", makeProxyRouter(liveLayer));
app.use("/api", makeRegisterRouter(liveLayer));
app.use("/api", makeEscrowsRouter(liveLayer));

app.listen(PORT, () => {
    console.log(`\nGateway listening on http://localhost:${PORT}`);
    console.log(`Mock APIs:  http://localhost:${PORT}/mock/weather?city=London`);
    console.log(`Catalog:    http://localhost:${PORT}/api/catalog`);
    console.log(`Health:     http://localhost:${PORT}/health\n`);
});
