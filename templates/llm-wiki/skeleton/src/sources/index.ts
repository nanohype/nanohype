import "./local.js";
import "./mock.js";

export {
  registerSourceProvider,
  getSourceProvider,
  listSourceProviders,
} from "./registry.js";

export type { SourceProvider, Source } from "./types.js";
