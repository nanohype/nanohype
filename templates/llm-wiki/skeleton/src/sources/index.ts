import "./local.js";
import "./mock.js";

export {
  getSourceProvider,
  listSourceProviders,
  registerSourceProvider,
} from "./registry.js";

export type { Source, SourceProvider } from "./types.js";
