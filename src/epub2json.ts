import chalk from "chalk";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import xml from "fast-xml-parser";

const epub2json = async (o: Options) => {
  console.log(chalk.blueBright(`Converting ${o.epub} to JSON...`));
  const epubPath = path.resolve(o.epub);
  if (!fs.existsSync(epubPath)) {
    console.error(chalk.redBright(`File not found: ${epubPath}`));
    return;
  }

  const directory = await unzipper.Open.file(o.epub);
  const opfFile = directory.files.find(d => d.path === "OPS/package.opf") ?? directory.files.find(d => d.path === "OEBPS/package.opf");
  if (!opfFile) {
    console.error(chalk.redBright(`Could not find package.opf.`));
    return;
  }
  
  const opf = new xml.XMLParser().parse(await opfFile.buffer());
  console.log(opf);

  console.log(chalk.greenBright(`Converted ${o.epub} to JSON.`));
};

export { epub2json };