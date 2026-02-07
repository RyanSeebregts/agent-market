import { Effect, Console, Duration, Layer } from "effect";
import { formatEther } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import chalk from "chalk";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { AgentWallet, EscrowContract, ZERO_ADDRESS } from "@flaregate/shared";
import { agentFetch, agentFetchWithToken, getCatalog } from "./sdk.js";
import { makeLiveLayer } from "./layers.js";

const GATEWAY_URL = "http://localhost:3000";

const log = {
    header: (msg: string) => Console.log(chalk.bold.cyan(`\n${"=".repeat(50)}\n  ${msg}\n${"=".repeat(50)}`)),
    step: (n: number, msg: string) => Console.log(chalk.bold.yellow(`\n--- Step ${n}: ${msg} ---`)),
    info: (msg: string) => Console.log(chalk.white(`  ${msg}`)),
    success: (msg: string) => Console.log(chalk.bold.green(`  ${msg}`)),
    error: (msg: string) => Console.log(chalk.bold.red(`  ${msg}`)),
    data: (msg: string) => Console.log(chalk.magenta(`  ${msg}`)),
    hash: (msg: string) => Console.log(chalk.cyan(`  ${msg}`)),
    divider: () => Console.log(chalk.gray("  " + "-".repeat(46))),
};

const demo = Effect.gen(function* () {
    yield* log.header("FlareGate Agent Demo");
    yield* Console.log(chalk.gray("  API Marketplace for AI Agents on Flare Network\n"));

    // --- Wallet Info ---
    const wallet = yield* AgentWallet;
    yield* log.info(`Agent wallet: ${chalk.bold(wallet.address)}`);

    const balance = yield* wallet.getBalance();
    yield* log.info(`Balance: ${chalk.bold(formatEther(balance))} C2FLR`);

    if (balance === 0n) {
        yield* log.error("No C2FLR balance! Fund your wallet at: https://faucet.flare.network/coston");
        return;
    }

    yield* Effect.sleep(Duration.seconds(1));

    // --- Step 1: Browse Catalog ---
    yield* log.step(1, "Browsing API Catalog");
    const catalog = yield* getCatalog(GATEWAY_URL);

    yield* Console.log("");
    for (const api of catalog.apis) {
        yield* Console.log(chalk.bold.white(`  ${api.name}`));
        yield* Console.log(chalk.gray(`    ${api.description}`));
        for (const ep of api.endpoints) {
            const priceEth = formatEther(ep.priceWei);
            yield* Console.log(
                chalk.white(`    ${ep.method} ${ep.path}`) +
                chalk.yellow(` — ${priceEth} C2FLR`)
            );
        }
        yield* Console.log("");
    }
    yield* log.info(`Contract: ${chalk.bold(catalog.contractAddress)}`);
    yield* log.info(`Network: ${catalog.network} (Chain ID: ${catalog.chainId})`);

    yield* Effect.sleep(Duration.seconds(1));

    // --- Step 2: Try without payment ---
    yield* log.step(2, "Attempting API Call Without Payment");
    yield* log.info("Calling weather API without escrow...");

    const tryNoPayment = yield* Effect.tryPromise({
        try: async () => {
            const resp = await fetch(`${GATEWAY_URL}/api/proxy/weather-api/weather?city=London`);
            const body = await resp.json() as { price: string; currency: string; provider: string };
            return { status: resp.status, body };
        },
        catch: (e) => e,
    }).pipe(Effect.either);

    if (tryNoPayment._tag === "Right" && tryNoPayment.right.status === 402) {
        const { body } = tryNoPayment.right;
        yield* log.info(`Got HTTP ${chalk.bold.red("402")} Payment Required`);
        yield* log.info(`Price: ${chalk.yellow(body.price + " wei")} (${body.currency})`);
        yield* log.info(`Provider: ${body.provider}`);
        yield* log.success("HTTP 402 working as expected!");
    } else {
        yield* log.error("Unexpected response from gateway");
    }

    yield* Effect.sleep(Duration.seconds(1));

    // --- Step 3: Full Payment Flow ---
    yield* log.step(3, "Paying and Consuming API");
    yield* log.info("Starting full escrow payment flow...\n");

    const result = yield* agentFetch(
        GATEWAY_URL,
        "weather-api",
        "/weather?city=London",
        { maxPriceWei: BigInt("1000000000000000000"), timeout: 300 }
    );

    yield* Effect.sleep(Duration.millis(500));
    yield* log.divider();

    if (result.hashesMatch) {
        yield* log.success("Hashes match — funds released to provider!");
    } else {
        yield* log.error("Hash mismatch — dispute raised!");
    }

    yield* log.divider();
    yield* Console.log("");
    yield* log.data("Data received:");
    yield* Console.log(chalk.white("  " + JSON.stringify(result.data, null, 2).replace(/\n/g, "\n  ")));

    yield* Console.log("");
    yield* log.hash(`Escrow ID:  #${result.escrowId}`);
    yield* log.hash(`Data hash:  ${result.dataHash}`);
    yield* log.hash(`Match:      ${result.hashesMatch ? chalk.green("YES") : chalk.red("NO")}`);

    // --- Step 4: FXRP Token Payment (FAssets) ---
    const fxrpAddress = process.env.FXRP_TOKEN_ADDRESS;
    if (fxrpAddress) {
        yield* Effect.sleep(Duration.seconds(1));
        yield* log.step(4, "Paying with FXRP (FAssets Token)");
        yield* log.info("Demonstrating ERC-20 token payment with synthetic XRP...\n");
        yield* log.info(`FXRP token: ${chalk.bold(fxrpAddress)}`);

        const tokenResult = yield* agentFetchWithToken(
            GATEWAY_URL,
            "joke-api",
            "/joke?category=crypto",
            fxrpAddress,
            { maxPriceUnits: BigInt("1000000000000000000"), timeout: 300 }
        );

        yield* Effect.sleep(Duration.millis(500));
        yield* log.divider();

        if (tokenResult.hashesMatch) {
            yield* log.success("Hashes match — FXRP funds released to provider!");
        } else {
            yield* log.error("Hash mismatch — dispute raised!");
        }

        yield* log.divider();
        yield* Console.log("");
        yield* log.data("Data received (paid with FXRP):");
        yield* Console.log(chalk.white("  " + JSON.stringify(tokenResult.data, null, 2).replace(/\n/g, "\n  ")));

        yield* Console.log("");
        yield* log.hash(`Escrow ID:  #${tokenResult.escrowId}`);
        yield* log.hash(`Payment:    FXRP token`);
        yield* log.hash(`Data hash:  ${tokenResult.dataHash}`);
        yield* log.hash(`Match:      ${tokenResult.hashesMatch ? chalk.green("YES") : chalk.red("NO")}`);
    } else {
        yield* Console.log("");
        yield* log.info("Set FXRP_TOKEN_ADDRESS in .env to demo FAssets token payment flow");
    }

    // --- Final Summary ---
    yield* Console.log("");
    yield* log.header("Demo Complete!");
    yield* log.success(`Escrow #${result.escrowId} settled on-chain (native C2FLR)`);
    if (fxrpAddress) {
        yield* log.success("FAssets (FXRP) token payment also demonstrated!");
    }
    yield* log.info(`View on explorer: https://coston-explorer.flare.network/address/${process.env.ESCROW_CONTRACT_ADDRESS}`);
    yield* Console.log("");
});

// Validate env
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://coston-api.flare.network/ext/C/rpc";
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;

if (!AGENT_PRIVATE_KEY) {
    console.error(chalk.red("AGENT_PRIVATE_KEY is not set in .env"));
    process.exit(1);
}

if (!ESCROW_CONTRACT_ADDRESS) {
    console.error(chalk.red("ESCROW_CONTRACT_ADDRESS is not set in .env"));
    process.exit(1);
}

const LiveLayer = makeLiveLayer({
    privateKey: AGENT_PRIVATE_KEY,
    rpcUrl: RPC_URL,
    contractAddress: ESCROW_CONTRACT_ADDRESS,
});

const main = demo.pipe(
    Effect.provide(LiveLayer),
    Effect.catchAll((error) =>
        Console.error(
            chalk.bold.red(`\nDemo failed: ${(error as any)._tag ?? "Unknown"} — ${JSON.stringify(error)}`)
        )
    )
);

Effect.runPromise(main).catch(console.error);
