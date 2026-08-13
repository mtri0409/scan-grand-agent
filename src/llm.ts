import OpenAI from "openai";
import 'dotenv/config';
if (!process.env.AI_API_KEY) {
  throw new Error("Missing AI_API_KEY environment variable");
}
if (!process.env.AI_API_URL) {
  throw new Error("Missing AI_API_URL environment variable");
}

export const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_URL,
});

export const DEFAULT_MODEL = process.env.MODEL ?? "mistral-large-latest";
