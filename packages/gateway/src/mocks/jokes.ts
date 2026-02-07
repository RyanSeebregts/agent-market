import { Router, Request, Response } from "express";

const router = Router();

const jokes: Record<string, string[]> = {
  programming: [
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "There are only 10 types of people in the world: those who understand binary and those who don't.",
    "A SQL query walks into a bar, walks up to two tables and asks, 'Can I join you?'",
    "Why did the developer go broke? Because he used up all his cache.",
    "!false — it's funny because it's true.",
    "How many programmers does it take to change a light bulb? None. That's a hardware problem.",
    "Why do Java programmers have to wear glasses? Because they can't C#.",
  ],
  general: [
    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    "What do you call a fake noodle? An impasta.",
    "Why don't scientists trust atoms? Because they make up everything.",
    "I'm reading a book about anti-gravity. It's impossible to put down.",
  ],
  crypto: [
    "Why did the Bitcoin break up with the dollar? It needed more space on the blockchain.",
    "What's a blockchain developer's favorite game? Hash tag.",
    "Why are cryptocurrency investors so calm? Because they hodl.",
    "I invested in a blockchain bakery. The proof of steak was delicious.",
  ],
};

router.get("/joke", (req: Request, res: Response) => {
  const category = (req.query.category as string) || "general";
  const jokeList = jokes[category] || jokes.general;
  const joke = jokeList[Math.floor(Math.random() * jokeList.length)];

  res.json({
    joke,
    category: jokes[category] ? category : "general",
    timestamp: new Date().toISOString(),
  });
});

export default router;
