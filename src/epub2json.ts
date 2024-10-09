import chalk from "chalk";
import fs from "fs";
import path from "path";

const epub2json = async (o: Options) => {
  console.log(chalk.blueBright(`Converting ${o.epub} to JSON...`));
  const epubPath = path.resolve(o.epub);
  if (!fs.existsSync(epubPath)) {
    console.error(chalk.redBright(`File not found: ${epubPath}`));
    process.exit(1);
  }

  const data = await fs.promises.readFile(o.epub);
  //TODO
  await fs.promises.writeFile(`${o.epub}.json`, data);

  console.log(chalk.greenBright(`Converted ${o.epub} to JSON.`));
};

export { epub2json };