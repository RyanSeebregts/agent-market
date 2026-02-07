#!/bin/bash
set -e

echo "=============================="
echo "  FlareGate Demo"
echo "=============================="
echo ""

# Check .env
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run ./setup.sh first."
  exit 1
fi

# Check contract address
CONTRACT=$(grep ESCROW_CONTRACT_ADDRESS .env | head -1 | cut -d'=' -f2)
if [ -z "$CONTRACT" ]; then
  echo "ERROR: ESCROW_CONTRACT_ADDRESS not set in .env."
  echo "Deploy the contract first: npm run deploy"
  exit 1
fi

echo "Contract: $CONTRACT"
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
  [ -n "$DASHBOARD_PID" ] && kill $DASHBOARD_PID 2>/dev/null
  exit 0
}

trap cleanup EXIT INT TERM

# 1. Start gateway
echo "Starting gateway server..."
npm run gateway &
GATEWAY_PID=$!

# 2. Start dashboard
echo "Starting dashboard..."
npm run dashboard &
DASHBOARD_PID=$!

# 3. Wait for gateway to be ready
echo "Waiting for gateway..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Gateway is ready!"
    break
  fi
  sleep 1
done

# 4. Wait a bit more for dashboard
sleep 3
echo "Dashboard should be at http://localhost:3001/live"
echo ""

# 5. Open dashboard in browser (macOS)
if command -v open > /dev/null; then
  open http://localhost:3001/live
fi

# 6. Run agent demo
echo "Starting agent demo in 3 seconds..."
sleep 3
echo ""
npm run demo

# Keep running until Ctrl+C
echo ""
echo "Demo complete! Gateway and dashboard still running."
echo "Press Ctrl+C to stop all services."
wait
