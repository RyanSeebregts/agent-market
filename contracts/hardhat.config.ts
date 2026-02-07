import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        coston2: {
            url: process.env.RPC_URL || "https://coston2-api.flare.network/ext/C/rpc",
            chainId: 114,
            accounts: process.env.GATEWAY_PRIVATE_KEY
                ? [process.env.GATEWAY_PRIVATE_KEY]
                : [],
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
    },
    paths: {
        sources: "./",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
