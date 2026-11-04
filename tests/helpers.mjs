// Loads the app's TypeScript modules in plain Node (jiti transpiles on the fly).
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@/": new URL("../", import.meta.url).pathname } });

/** Imports a module by path relative to the repository root, e.g. "lib/safe-next.ts". */
export function load(path) {
  return jiti.import(new URL(`../${path}`, import.meta.url).pathname);
}
