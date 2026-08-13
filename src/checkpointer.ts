import { Checkpoint, CheckpointMetadata, BaseCheckpointSaver, CheckpointTuple } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import * as fs from "fs";
import * as path from "path";
import { logStep } from "./logger.js";

type ChannelVersions = Record<string, number | string>;

/**
 * Simple file-based checkpoint saver for LangGraph.
 * Stores checkpoints as JSON files under a directory keyed by thread_id.
 */
export class FileSaver extends BaseCheckpointSaver {
  private dir: string;

  constructor(dir = ".langgraph-checkpoints") {
    super();
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private filePath(threadId: string, checkpointId?: string): string {
    const base = path.join(this.dir, encodeURIComponent(threadId));
    if (!checkpointId) return base + ".json";
    return path.join(base, `${checkpointId}.json`);
  }

  async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const tuple = await this.getTuple(config);
    return tuple?.checkpoint;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    let checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!threadId) return undefined;

    // Nếu không chỉ định checkpoint_id, lấy latest pointer.
    if (!checkpointId) {
      const pointerFile = this.filePath(threadId);
      if (fs.existsSync(pointerFile)) {
        const pointer = JSON.parse(fs.readFileSync(pointerFile, "utf-8"));
        checkpointId = pointer.checkpointId;
      }
    }
    if (!checkpointId) return undefined;

    const file = this.filePath(threadId, checkpointId);
    logStep("checkpointer", "get", { threadId, checkpointId, file });
    if (!fs.existsSync(file)) return undefined;

    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return {
      config,
      checkpoint: data.checkpoint as Checkpoint,
      metadata: data.metadata as CheckpointMetadata,
      parentConfig: data.parentConfig as RunnableConfig,
    };
  }

  async *list(config: RunnableConfig): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) return;
    const threadDir = path.join(this.dir, encodeURIComponent(threadId));
    if (!fs.existsSync(threadDir)) return;
    const files = fs.readdirSync(threadDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const checkpointId = file.replace(".json", "");
      const tuple = await this.getTuple({ configurable: { thread_id: threadId, checkpoint_id: checkpointId } } as RunnableConfig);
      if (tuple) yield tuple;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const threadDir = path.join(this.dir, encodeURIComponent(threadId));
    if (fs.existsSync(threadDir)) {
      fs.rmSync(threadDir, { recursive: true, force: true });
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = (config.configurable?.thread_id as string) ?? "default";
    const checkpointId = checkpoint.id;

    const file = this.filePath(threadId, checkpointId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ checkpoint, metadata, parentConfig: config }, null, 2));
    logStep("checkpointer", "put", { threadId, checkpointId, file });

    // Also write latest pointer.
    fs.writeFileSync(this.filePath(threadId), JSON.stringify({ checkpointId }, null, 2));

    return { configurable: { thread_id: threadId, checkpoint_id: checkpointId } };
  }

  async putWrites(
    _config: RunnableConfig,
    _writes: any[],
    _taskId: string,
  ): Promise<void> {
    // Not needed for basic interrupt/resume.
  }
}
