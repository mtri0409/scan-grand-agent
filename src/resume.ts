import "dotenv/config";
import { graph } from "./graph.js";
import { Command } from "@langchain/langgraph";
import * as readline from "node:readline";

function readStdin(prompt = "\nNhập câu trả lời: "): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runResume(answer: string, threadId: string, config: any) {
  let interrupted = false;
  let lastChunk: any = null;

  const stream = await graph.stream(new Command({ resume: answer }), config);

  for await (const chunk of stream as any) {
    if ((chunk as any).__interrupt__) {
      interrupted = true;
      console.log("\n=== DỪNG CHỜ USER ===");
      const interrupts = (chunk as any).__interrupt__ as any[];
      for (const intr of interrupts) {
        console.log(intr.value?.question ?? JSON.stringify(intr.value, null, 2));
      }
      return { interrupted, lastChunk: null };
    }
    lastChunk = chunk;
  }

  return { interrupted, lastChunk };
}

function printResult(lastChunk: any) {
  const final: any = Object.values(lastChunk || {}).reduce(
    (acc: any, val: any) => ({ ...acc, ...(val || {}) }),
    {}
  );
  console.log("=== KẾT QUẢ SAU RESUME ===");
  console.dir(final.messages ?? [], { depth: null });
  console.log("\n--- chatComplement ---\n");
  console.log(final.chatComplement ?? "");
}

async function main() {
  const threadId = process.argv[2];
  const initialAnswer = process.argv.slice(3).join(" ");

  if (!threadId) {
    console.error("Usage: node dist/resume.js <thread_id> [initial_answer]");
    process.exit(1);
  }

  const config = { configurable: { thread_id: threadId } };
  let answer = initialAnswer;

  while (true) {
    if (!answer) {
      answer = await readStdin();
      if (!answer) {
        console.log("Không có câu trả lời. Thoát.");
        process.exit(0);
      }
    }

    const result = await runResume(answer, threadId, config);
    if (!result.interrupted) {
      printResult(result.lastChunk);
      break;
    }
    answer = "";
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
