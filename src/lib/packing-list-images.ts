import { unzipSync } from "fflate";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

export type PackedProductImage = { sku: string; bytes: Uint8Array; mediaName: string };

function parseXml(text: string, label: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error(`Le classeur est invalide : ${label}.`);
  return document;
}

function resolveZipPath(sourcePath: string, target: string) {
  const parts = target.startsWith("/") ? [] : sourcePath.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function relationships(document: Document) {
  const map = new Map<string, string>();
  for (const relationship of document.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship")) {
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function getCellValue(cell: Element, sharedStrings: string[]) {
  if (cell.getAttribute("t") === "inlineStr") {
    return Array.from(cell.getElementsByTagNameNS(MAIN_NS, "t"), (node) => node.textContent ?? "").join("");
  }
  const value = cell.getElementsByTagNameNS(MAIN_NS, "v")[0]?.textContent ?? "";
  if (cell.getAttribute("t") === "s") return sharedStrings[Number(value)] ?? "";
  return value;
}

function getCellColumn(reference: string) {
  return reference.match(/^[A-Z]+/)?.[0] ?? "";
}

export async function parsePackingListImages(file: File): Promise<{
  images: PackedProductImage[];
  additionalPhotos: number;
  rowsWithoutPhotos: number;
}> {
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
    throw new Error("Choisissez un classeur Excel .xlsx.");
  }
  if (file.size > 60 * 1024 * 1024) {
    throw new Error("Le classeur dépasse la limite de 60 Mo.");
  }

  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const textDecoder = new TextDecoder();
  const workbookPath = "xl/workbook.xml";
  const workbookBytes = archive[workbookPath];
  const workbookRelBytes = archive["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !workbookRelBytes) throw new Error("Le classeur ne contient pas de feuille Excel lisible.");

  const workbook = parseXml(textDecoder.decode(workbookBytes), "métadonnées");
  const workbookRels = relationships(parseXml(textDecoder.decode(workbookRelBytes), "relations"));
  const firstSheet = workbook.getElementsByTagNameNS(MAIN_NS, "sheet")[0];
  const sheetRelId = firstSheet?.getAttributeNS(REL_NS, "id");
  const sheetTarget = sheetRelId ? workbookRels.get(sheetRelId) : undefined;
  if (!sheetTarget) throw new Error("Aucune feuille de produits n’a été trouvée.");
  const sheetPath = resolveZipPath(workbookPath, sheetTarget);
  const sheetBytes = archive[sheetPath];
  if (!sheetBytes) throw new Error("La feuille de produits est introuvable dans le classeur.");

  const sharedStringsBytes = archive["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsBytes
    ? Array.from(parseXml(textDecoder.decode(sharedStringsBytes), "noms de produits").getElementsByTagNameNS(MAIN_NS, "si"),
      (item) => Array.from(item.getElementsByTagNameNS(MAIN_NS, "t"), (node) => node.textContent ?? "").join(""))
    : [];
  const sheet = parseXml(textDecoder.decode(sheetBytes), "lignes de produits");
  const dataRows = sheet.getElementsByTagNameNS(MAIN_NS, "row");
  let headerRow = -1;
  const productsByRow = new Map<number, string>();

  for (const row of dataRows) {
    const rowNumber = Number(row.getAttribute("r"));
    const values = new Map<string, string>();
    for (const cell of row.getElementsByTagNameNS(MAIN_NS, "c")) {
      const column = getCellColumn(cell.getAttribute("r") ?? "");
      if (column) values.set(column, getCellValue(cell, sharedStrings).trim());
    }
    if (headerRow < 0 && values.get("A")?.toLocaleUpperCase() === "ITEM NO.") {
      headerRow = rowNumber;
      continue;
    }
    if (headerRow >= 0 && rowNumber > headerRow) {
      const sku = values.get("A") ?? "";
      if (sku && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku)) productsByRow.set(rowNumber, sku);
    }
  }
  if (headerRow < 0 || productsByRow.size === 0) {
    throw new Error("Format non reconnu : la colonne ITEM NO. du packing list est absente.");
  }

  const duplicateSkus = Array.from(productsByRow.values()).filter((sku, index, all) => all.indexOf(sku) !== index);
  if (duplicateSkus.length > 0) {
    throw new Error(`SKU en double dans le classeur : ${duplicateSkus.slice(0, 5).join(", ")}.`);
  }

  const sheetFileName = sheetPath.split("/").pop() ?? "";
  const sheetRelsPath = `${sheetPath.split("/").slice(0, -1).join("/")}/_rels/${sheetFileName}.rels`;
  const sheetRelsBytes = archive[sheetRelsPath];
  const drawingId = sheet.getElementsByTagNameNS(MAIN_NS, "drawing")[0]?.getAttributeNS(REL_NS, "id");
  const drawingTarget = sheetRelsBytes && drawingId
    ? relationships(parseXml(textDecoder.decode(sheetRelsBytes), "relations des images")).get(drawingId)
    : undefined;
  if (!drawingTarget) throw new Error("Le classeur ne contient aucune image liée aux produits.");

  const drawingPath = resolveZipPath(sheetPath, drawingTarget);
  const drawingBytes = archive[drawingPath];
  const drawingRelsPath = `${drawingPath.split("/").slice(0, -1).join("/")}/_rels/${drawingPath.split("/").pop()}.rels`;
  const drawingRelsBytes = archive[drawingRelsPath];
  if (!drawingBytes || !drawingRelsBytes) throw new Error("Les références aux photos sont incomplètes.");
  const drawing = parseXml(textDecoder.decode(drawingBytes), "ancrages des photos");
  const drawingRels = relationships(parseXml(textDecoder.decode(drawingRelsBytes), "fichiers photo"));
  const imagesByRow = new Map<number, string[]>();
  const anchors = [
    ...Array.from(drawing.getElementsByTagNameNS(DRAWING_NS, "twoCellAnchor")),
    ...Array.from(drawing.getElementsByTagNameNS(DRAWING_NS, "oneCellAnchor")),
  ];
  for (const anchor of anchors) {
    const from = anchor.getElementsByTagNameNS(DRAWING_NS, "from")[0];
    if (Number(from?.getElementsByTagNameNS(DRAWING_NS, "col")[0]?.textContent) !== 1) continue;
    const rowNumber = Number(from?.getElementsByTagNameNS(DRAWING_NS, "row")[0]?.textContent) + 1;
    const embedId = anchor.getElementsByTagNameNS(DRAWING_MAIN_NS, "blip")[0]?.getAttributeNS(REL_NS, "embed");
    const mediaTarget = embedId ? drawingRels.get(embedId) : undefined;
    if (productsByRow.has(rowNumber) && mediaTarget) {
      const paths = imagesByRow.get(rowNumber) ?? [];
      paths.push(resolveZipPath(drawingPath, mediaTarget));
      imagesByRow.set(rowNumber, paths);
    }
  }

  const productImages: PackedProductImage[] = [];
  let additionalPhotos = 0;
  let rowsWithoutPhotos = 0;
  for (const [row, sku] of productsByRow) {
    const mediaNames = imagesByRow.get(row) ?? [];
    if (mediaNames.length === 0) {
      rowsWithoutPhotos += 1;
      continue;
    }
    additionalPhotos += Math.max(0, mediaNames.length - 1);
    const mediaName = mediaNames[0];
    const bytes = archive[mediaName];
    if (bytes) productImages.push({ sku, bytes, mediaName });
  }
  return { images: productImages, additionalPhotos, rowsWithoutPhotos };
}
