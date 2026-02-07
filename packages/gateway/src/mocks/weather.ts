import { Router, Request, Response } from "express";

const router = Router();

const conditions = ["Sunny", "Cloudy", "Rainy", "Partly Cloudy", "Windy", "Foggy", "Stormy", "Clear"];

router.get("/weather", (req: Request, res: Response) => {
  const city = (req.query.city as string) || "Unknown";
  const temp = Math.round(Math.random() * 35 - 5); // -5 to 30
  const humidity = Math.round(Math.random() * 60 + 30); // 30-90
  const condition = conditions[Math.floor(Math.random() * conditions.length)];

  res.json({
    city,
    temp,
    condition,
    humidity,
    windSpeed: Math.round(Math.random() * 30),
    timestamp: new Date().toISOString(),
  });
});

export default router;
