import { epub2json } from "./epub2json";
import { program } from "commander";

program
  .name("epub2json")
  .requiredOption("--epub <FILE>", "Path to the EPUB file.")
  .requiredOption("--output <PATH>", "Path to the output directory.")
  .description("CLI to convert EPUB to JSON.");

program.parse();

const options = program.opts();

(async () => {
  await epub2json({
    epub: options.epub,
    output: options.output,
  });
})();