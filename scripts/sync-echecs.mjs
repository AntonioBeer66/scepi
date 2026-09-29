import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("../src/echecs/", import.meta.url);
const target = new URL("../site/src/echecs/", import.meta.url);
const legacyTarget = new URL("../site/assets/echecs/", import.meta.url);

await rm(legacyTarget, { recursive: true, force: true });
await rm(new URL("../site/assets/data/", import.meta.url), { recursive: true, force: true });
await rm(new URL("../site/assets/engines/", import.meta.url), { recursive: true, force: true });
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
