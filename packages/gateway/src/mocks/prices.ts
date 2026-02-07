import { Router, Request, Response } from "express";

const router = Router();

const basePrices: Record<string, number> = {
  FLR: 0.025,
  BTC: 67500,
  ETH: 3450,
  SGB: 0.012,
  USDC: 1.0,
  USDT: 1.0,
};

router.get("/price", (req: Request, res: Response) => {
  const symbol = ((req.query.symbol as string) || "FLR").toUpperCase();
  const basePrice = basePrices[symbol] || Math.random() * 100;
  const change = (Math.random() - 0.5) * 10; // -5% to +5%
  const price = basePrice * (1 + change / 100);

  res.json({
    symbol,
    price: Number(price.toFixed(6)),
    change24h: Number(change.toFixed(2)),
    volume: Math.round(Math.random() * 10000000),
    marketCap: Math.round(price * 1000000000),
    timestamp: new Date().toISOString(),
  });
});

export default router;
