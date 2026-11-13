// Копирует общий интерфейс сайта (tettapro-analogs-web/public) и локальный сервер сайта в программу.
import { cp, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..", "..", "tettapro-analogs-web");
const dst = path.join(here, "..", "app");

await rm(dst, { recursive: true, force: true });
await cp(path.join(web, "public"), dst, { recursive: true });
await copyFile(path.join(web, "server.cjs"), path.join(here, "..", "server.cjs"));
console.log("Интерфейс и сервер сайта скопированы в программу.");
