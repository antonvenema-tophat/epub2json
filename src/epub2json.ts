import chalk from "chalk";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import xml from "fast-xml-parser";

interface Content {
  text: string;
  href: string;
  contents?: Content[];
}

const createPathForFilePath = async (filePath: string) => {
  try { await fs.promises.mkdir(path.dirname(filePath), { recursive: true }); } catch { }
}

const parseNavPoints = (navPoints: any[]): Content[] => {
  const contents: Content[] = [];
  for (const navPoint of navPoints) {
    if (!navPoint.navLabel) {
      console.error(chalk.redBright(`ncx.navPoint is missing required navLabel element.`));
      return [];
    }
    if (!navPoint.navLabel[0].text) {
      console.error(chalk.redBright(`ncx.navPoint is missing required navLabel.text element.`));
      return [];
    }
    if (!navPoint.content) {
      console.error(chalk.redBright(`ncx.navPoint is missing required content element.`));
      return [];
    }
    if (!navPoint.content[0]["@_src"]) {
      console.error(chalk.redBright(`ncx.navPoint is missing required content.src attribute.`));
      return [];
    }
    const content: Content = {
      text: navPoint.navLabel[0].text[0],
      href: navPoint.content[0]["@_src"][0],
    }
    if (navPoint.navPoint) {
      content.contents = parseNavPoints(navPoint.navPoint);
    }
    contents.push(content);
  }
  return contents;
}

const epub2json = async (o: Options) => {
  const opsPath = "OPS";

  // resolve paths
  const epubFilePath = path.resolve(o.epub);
  const outputPath = path.resolve(o.output);

  // test epub path
  if (!fs.existsSync(epubFilePath)) {
    console.error(chalk.redBright(`File not found: ${epubFilePath}`));
    return;
  }

  // open epub
  console.log(chalk.blueBright(`Opening ${o.epub}...`));
  const directory = await unzipper.Open.file(epubFilePath);

  // extract package.opf
  const opfFile = directory.files.find(d => d.path === path.join(opsPath, "package.opf"));
  if (!opfFile) {
    console.error(chalk.redBright(`Could not find package.opf.`));
    return;
  }

  // parse package.opf
  const opf = new xml.XMLParser({
    allowBooleanAttributes: true,
    ignoreAttributes: false,
    isArray: () => true,
  }).parse(await opfFile.buffer());
  if (!opf.package) {
    console.error(chalk.redBright(`package.opf is missing required package element.`));
    return;
  }
  if (!opf.package[0].metadata) {
    console.error(chalk.redBright(`package.opf is missing required package.metadata element.`));
    return;
  }
  if (!opf.package[0].manifest) {
    console.error(chalk.redBright(`package.opf is missing required package.manifest element.`));
    return;
  }
  if (!opf.package[0].spine) {
    console.error(chalk.redBright(`package.opf is missing required package.spine element.`));
    return;
  }
  
  // parse metadata
  const metadata: {[key: string]: any} = {
    title: opf.package[0].metadata[0]["dc:title"][0]["#text"],
    publisher: opf.package[0].metadata[0]["dc:publisher"][0]["#text"],
    creators: opf.package[0].metadata[0]["dc:creator"].map((c: any) => c["#text"]),
    date: opf.package[0].metadata[0]["dc:date"][0]["#text"],
    identifier: opf.package[0].metadata[0]["dc:identifier"][0]["#text"],
    language: opf.package[0].metadata[0]["dc:language"][0]["#text"],
    description: opf.package[0].metadata[0]["dc:description"][0]["#text"],
    rights: opf.package[0].metadata[0]["dc:rights"][0]["#text"],
    source: opf.package[0].metadata[0]["dc:source"][0]["#text"],
    type: opf.package[0].metadata[0]["dc:type"][0]["#text"],
  };

  // write metadata
  const metadataFilePath = path.join(outputPath, "metadata.json");
  await createPathForFilePath(metadataFilePath);
  await fs.promises.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));

  // parse manifest
  const manifest: {[key: string]: {
    href: string,
    mediaType: string,
  }} = {};
  for (const item of opf.package[0].manifest[0].item) {
    manifest[item["@_id"][0] as string] = {
      href: item["@_href"][0],
      mediaType: item["@_media-type"][0],
    };
  }

  // extract toc.ncx
  const ncxFile = directory.files.find(d => d.path === path.join(opsPath, manifest[opf.package[0].spine[0]["@_toc"][0]].href));
  if (!ncxFile) {
    console.error(chalk.redBright(`Could not find toc.ncx.`));
    return;
  }

  // parse toc.ncx
  const ncx = new xml.XMLParser({
    allowBooleanAttributes: true,
    ignoreAttributes: false,
    isArray: () => true,
  }).parse(await ncxFile.buffer());
  if (!ncx.ncx) {
    console.error(chalk.redBright(`toc.ncx is missing required ncx element.`));
    return;
  }
  if (!ncx.ncx[0].docTitle) {
    console.error(chalk.redBright(`toc.ncx is missing required ncx.docTitle element.`));
    return;
  }
  if (!ncx.ncx[0].navMap) {
    console.error(chalk.redBright(`toc.ncx is missing required ncx.navMap element.`));
    return;
  }
  
  // parse toc
  const toc = {
    title: ncx.ncx[0].docTitle[0]["text"],
    contents: parseNavPoints(ncx.ncx[0].navMap[0].navPoint)
  };

  // write toc
  const tocFilePath = path.join(outputPath, "toc.json");
  await createPathForFilePath(tocFilePath);
  await fs.promises.writeFile(tocFilePath, JSON.stringify(toc, null, 2));

  // read html
  const htmls = [];
  for (const itemRef of opf.package[0].spine[0].itemref) {
    const linear = !itemRef["@_linear"] || itemRef["@_linear"][0] == "yes";
    if (!linear) continue;
    const item = manifest[itemRef["@_idref"][0] as string];
    if (item.mediaType !== "application/xhtml+xml") {
      console.error(chalk.redBright(`package.opf has non-HTML item in package.spine.`));
      return;
    }
    if (!item.href.startsWith("xhtml")) { // because we merge into "xhtml" directory
      console.error(chalk.redBright(`package.opf has non-standard path '${item.href}' in package.spine.`));
      return;
    }
    const htmlFile = directory.files.find(d => d.path === path.join(opsPath, item.href));
    if (!htmlFile) {
      console.error(chalk.redBright(`Could not find ${item.href}.`));
      return;
    }
    const html = (await htmlFile.buffer()).toString();
    htmls.push(html);
  }

  // write html (TODO: merge bodies)
  const htmlFilePath = path.join(outputPath, "xhtml", "index.html");
  await createPathForFilePath(htmlFilePath);
  await fs.promises.writeFile(htmlFilePath, htmls.join("\n"));

  console.log(chalk.greenBright(`Converted ${o.epub} to JSON.`));
};

export { epub2json };