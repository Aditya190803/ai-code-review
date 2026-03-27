import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".data");
const COUNTER_FILE = join(DATA_DIR, "install-count.json");

interface InstallCounterState {
  count: number;
  updatedAt: string;
}

async function readCounterState(): Promise<InstallCounterState> {
  try {
    const raw = await readFile(COUNTER_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<InstallCounterState>;

    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return {
      count: 0,
      updatedAt: new Date(0).toISOString(),
    };
  }
}

async function writeCounterState(state: InstallCounterState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(COUNTER_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function getInstallCount(): Promise<number> {
  const state = await readCounterState();
  return state.count;
}

export async function incrementInstallCount(): Promise<number> {
  const state = await readCounterState();
  const nextState: InstallCounterState = {
    count: state.count + 1,
    updatedAt: new Date().toISOString(),
  };

  await writeCounterState(nextState);
  return nextState.count;
}