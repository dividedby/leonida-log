// Entry point for `pnpm scrape` (tsx). All logic is in main.ts so tests can import it.
import { runCli } from "./main";

runCli(process.argv.slice(2), process.env).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
