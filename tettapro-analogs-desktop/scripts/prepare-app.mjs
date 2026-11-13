// Копирует общий интерфейс с сайта (tettapro-analogs-web/public) в программу
// и прописывает адрес сайта, с которого программа берёт общую таблицу.
import { cp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "tettapro-analogs-web", "public");
const dst = path.join(here, "..", "app");
const apiBase = process.env.TETTA_API_BASE || "https://tettapro-analogs.netlify.app";

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
await rm(path.join(dst, "sw.js"), { force: true });
await writeFile(path.join(dst, "config.js"),
  `// Сгенерировано при сборке программы.\nwindow.TETTA_CONFIG = { apiBase: ${JSON.stringify(apiBase)}, desktop: true };\n`);
console.log("Интерфейс скопирован, сервер:", apiBase);
