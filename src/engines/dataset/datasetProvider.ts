import { DatasetConfig, ResearchBrain } from "../../types";
import { buildRealMarketData, loadRealMarket, RealMarketData } from "../realMarket";
import { parseMarketCsv } from "./csvParse";
import { InMemoryDatasetProvider } from "./inMemoryProvider";
import { BridgeDatasetProvider } from "./bridgeProvider";
import { DatasetProvider } from "./types";

// Uploaded CSV text lives only in memory for the session (it can be large and
// is not worth persisting to localStorage). The Settings upload control fills
// this; the factory reads it. After a reload the user re-picks the file.
let uploadedDataset: { name: string; text: string } | null = null;

export function setUploadedDataset(name: string, text: string): void {
  uploadedDataset = { name, text };
}

export function getUploadedDatasetName(): string | null {
  return uploadedDataset?.name ?? null;
}

export interface DatasetProviderOptions {
  bridgeUrl: string;
  brain: ResearchBrain;
}

function looksLikeBundle(text: string): RealMarketData | null {
  try {
    const parsed = JSON.parse(text) as Omit<RealMarketData, "returns">;
    if (parsed && parsed.dates && parsed.tickers && parsed.benchmark) {
      return buildRealMarketData(parsed);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

// Returns a provider for the configured dataset, or null when the loop should
// use the deterministic mock simulator (kind "mock", or any unrecoverable
// failure — a missing upload, an unreachable URL, a disconnected bridge).
export async function getDatasetProvider(
  config: DatasetConfig,
  options: DatasetProviderOptions
): Promise<DatasetProvider | null> {
  switch (config.kind) {
    case "mock":
      return null;

    case "bundled": {
      const data = await loadRealMarket();
      return data ? new InMemoryDatasetProvider(data, "bundled", config.label) : null;
    }

    case "upload": {
      if (!uploadedDataset) return null;
      try {
        const json = looksLikeBundle(uploadedDataset.text);
        const data = json ?? parseMarketCsv(uploadedDataset.text, uploadedDataset.name, config.columns).data;
        return new InMemoryDatasetProvider(data, "upload", config.label || uploadedDataset.name);
      } catch {
        return null;
      }
    }

    case "remote": {
      if (!config.remoteUrl) return null;
      try {
        const response = await fetch(config.remoteUrl);
        if (!response.ok) return null;
        const text = await response.text();
        const json = looksLikeBundle(text);
        const data = json ?? parseMarketCsv(text, config.label || config.remoteUrl, config.columns).data;
        return new InMemoryDatasetProvider(data, "remote", config.label || config.remoteUrl);
      } catch {
        return null;
      }
    }

    case "bridge":
      return BridgeDatasetProvider.create(config, options.bridgeUrl, options.brain);

    default:
      return null;
  }
}
