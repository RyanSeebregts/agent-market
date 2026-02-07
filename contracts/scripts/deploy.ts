import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying FlareGateEscrow with account:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

    const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
    console.log("Fee recipient:", feeRecipient);

    const FlareGateEscrow = await ethers.getContractFactory("FlareGateEscrow");
    const escrow = await FlareGateEscrow.deploy(feeRecipient);
    await escrow.waitForDeployment();

    const contractAddress = await escrow.getAddress();
    console.log("FlareGateEscrow deployed to:", contractAddress);

    // Update .env file with contract address
    const envPath = path.resolve(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf-8");
        envContent = envContent.replace(
            /ESCROW_CONTRACT_ADDRESS=.*/,
            `ESCROW_CONTRACT_ADDRESS=${contractAddress}`
        );
        envContent = envContent.replace(
            /NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=.*/,
            `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${contractAddress}`
        );
        fs.writeFileSync(envPath, envContent);
        console.log("Updated .env with contract address");
    }

    // Copy ABI to shared package
    const artifactPath = path.resolve(
        __dirname,
        "../artifacts/FlareGateEscrow.sol/FlareGateEscrow.json"
    );
    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
        const abiOutputPath = path.resolve(
            __dirname,
            "../../packages/shared/src/abi.json"
        );
        fs.writeFileSync(abiOutputPath, JSON.stringify(artifact.abi, null, 2));
        console.log("Copied ABI to packages/shared/src/abi.json");
    }

    console.log("\n--- Deployment Summary ---");
    console.log("Contract:", contractAddress);
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
    console.log(
        "Explorer:",
        `https://coston-explorer.flare.network/address/${contractAddress}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
