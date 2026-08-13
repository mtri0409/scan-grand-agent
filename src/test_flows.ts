import "dotenv/config";
import { graph } from "./graph.js";
import { HumanMessage } from "./messages.js";
import { Command } from "@langchain/langgraph";

type Scenario = {
  name: string;
  input: string;
  answers: string[];
};

const scenarios: Scenario[] = [
  {
    name: "Unclear -> Clarify -> B -> no selection",
    input: "scan grant",
    answers: ["Tìm grant foodtech cho RetriV", "không"],
  },
  {
    name: "Unclear -> Clarify -> A -> resolve source",
    input: "scan grant",
    answers: ["Green Food Grant 2026", "tự tìm"],
  },
  {
    name: "Direct A with URL",
    input: "Scan grant https://example.com/green-food-grant-2026 Green Food Grant 2026",
    answers: [],
  },
  {
    name: "Direct B -> select first candidate",
    input: "Tìm grant foodtech cho RetriV",
    answers: ["1"],
  },
];

function getFinalState(lastChunk: any): any {
  return Object.values(lastChunk || {}).reduce(
    (acc: any, val: any) => ({ ...acc, ...(val || {}) }),
    {}
  );
}

async function runScenario(scenario: Scenario, index: number) {
  const threadId = `test-flow-${Date.now()}-${index}`;
  const config = { configurable: { thread_id: threadId } };
  let input: any = { messages: [HumanMessage(scenario.input)] };
  let lastChunk: any = null;

  console.log(`\n=== SCENARIO ${index + 1}: ${scenario.name} ===`);

  for (let step = 0; step < 20; step += 1) {
    const stream = await graph.stream(input, config);
    let interrupted = false;

    for await (const chunk of stream as any) {
      if ((chunk as any).__interrupt__) {
        interrupted = true;
        const interrupts = (chunk as any).__interrupt__ as any[];
        console.log("--- INTERRUPT ---");
        for (const intr of interrupts) {
          console.log(intr.value?.question ?? JSON.stringify(intr.value, null, 2));
        }
        break;
      }
      lastChunk = chunk;
    }

    if (!interrupted) {
      const final = getFinalState(lastChunk);
      console.log("--- FINAL messages ---");
      console.dir(final.messages ?? [], { depth: null });
      console.log("--- FINAL chatComplement ---");
      console.log(final.chatComplement ?? "");
      return;
    }

    const answer = scenario.answers.shift();
    if (!answer) {
      throw new Error(`Scenario "${scenario.name}" thiếu answer cho interrupt tiếp theo.`);
    }

    console.log(`--- ANSWER --- ${answer}`);
    input = new Command({ resume: answer });
  }

  throw new Error(`Scenario "${scenario.name}" vượt quá số bước tối đa.`);
}

async function main() {
  for (let i = 0; i < scenarios.length; i += 1) {
    await runScenario({ ...scenarios[i], answers: [...scenarios[i].answers] }, i);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
