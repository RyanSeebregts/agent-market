#!/bin/bash
set -e

echo "=============================="
echo "  FlareGate Setup"
echo "=============================="
echo ""

# 1. Copy .env if needed
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env

  # Generate wallet keys if not set
  echo "Generating wallet keys..."
  GATEWAY_KEY=$(node -e "const { Wallet } = require('ethers'); console.log(Wallet.createRandom().privateKey)")
  AGENT_KEY=$(node -e "const { Wallet } = require('ethers'); console.log(Wallet.createRandom().privateKey)")
  GATEWAY_ADDR=$(node -e "const { Wallet } = require('ethers'); console.log(new Wallet('$GATEWAY_KEY').address)")
  AGENT_ADDR=$(node -e "const { Wallet } = require('ethers'); console.log(new Wallet('$AGENT_KEY').address)")

  # Update .env
  sed -i '' "s|GATEWAY_PRIVATE_KEY=|GATEWAY_PRIVATE_KEY=$GATEWAY_KEY|" .env
  sed -i '' "s|AGENT_PRIVATE_KEY=|AGENT_PRIVATE_KEY=$AGENT_KEY|" .env
  sed -i '' "s|FEE_RECIPIENT=|FEE_RECIPIENT=$GATEWAY_ADDR|" .env

  echo ""
  echo "Generated wallets:"
  echo "  Gateway: $GATEWAY_ADDR"
  echo "  Agent:   $AGENT_ADDR"
  echo ""
  echo "IMPORTANT: Fund both wallets with testnet C2FLR!"
  echo "  Faucet: https://faucet.flare.network/coston"
  echo ""
else
  echo ".env already exists, skipping..."
fi

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Build shared package
echo ""
echo "Building shared package..."
npm run build:shared

# 4. Compile contracts
echo ""
echo "Compiling contracts..."
npm run build:contracts

# 5. Run contract tests
echo ""
echo "Running contract tests..."
npm run test:contracts

echo ""
echo "=============================="
echo "  Setup Complete!"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Fund your wallets with testnet C2FLR from https://faucet.flare.network/coston"
echo "  2. Deploy the contract: npm run deploy"
echo "  3. Run the demo: ./demo.sh"
echo ""

# Extract and show wallet addresses
if [ -f .env ]; then
  GATEWAY_KEY=$(grep GATEWAY_PRIVATE_KEY .env | cut -d'=' -f2)
  AGENT_KEY=$(grep AGENT_PRIVATE_KEY .env | cut -d'=' -f2)
  if [ -n "$GATEWAY_KEY" ]; then
    GATEWAY_ADDR=$(node -e "const { Wallet } = require('ethers'); console.log(new Wallet('$GATEWAY_KEY').address)")
    echo "Gateway wallet: $GATEWAY_ADDR"
  fi
  if [ -n "$AGENT_KEY" ]; then
    AGENT_ADDR=$(node -e "const { Wallet } = require('ethers'); console.log(new Wallet('$AGENT_KEY').address)")
    echo "Agent wallet:   $AGENT_ADDR"
  fi
fi
