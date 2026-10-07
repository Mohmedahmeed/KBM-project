import { unzipSync } from "fflate";

export const MAX_PACKING_LIST_SIZE_BYTES = 100 * 1024 * 1024;

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

export type PackedProductImage = { bytes: Uint8Array; mediaName: string };

export type PackingListLine = {
  sku: string;
  sourceName: string;
  cartons: number;
  pcsPerCarton: number;
  totalPieces: number;
  unitPriceRmb: string;
  amountRmb: string;
  cbmTotal: string | null;
  grossWeightTotal: string | null;
  image: PackedProductImage | null;
};

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

function integerCell(value: string, label: string, row: number) {
  if (!/^\d+$/.test(value)) throw new Error(`Valeur entière invalide pour ${label}, ligne ${row}.`);
  const parsed = BigInt(value);
  if (parsed > BigInt(2147483647)) throw new Error(`Quantité trop élevée pour la base, ligne ${row}.`);
  return Number(parsed);
}

function decimalCell(value: string, label: string, row: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Valeur numérique invalide pour ${label}, ligne ${row}.`);
  return value;
}

function assertDecimalProduct(left: string, right: string, expected: string, label: string, row: number) {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const [expectedWhole, expectedFraction = ""] = expected.split(".");
  const productScale = leftFraction.length + rightFraction.length;
  const scale = Math.max(productScale, expectedFraction.length);
  const actual = BigInt(leftWhole + leftFraction) * BigInt(rightWhole + rightFraction);
  const expectedValue = BigInt(expectedWhole + expectedFraction);
  if (
    actual * BigInt(10) ** BigInt(scale - productScale) !==
    expectedValue * BigInt(10) ** BigInt(scale - expectedFraction.length)
  ) {
    throw new Error(`Le total ${label} ne correspond pas aux valeurs de la ligne ${row}.`);
  }
}

export async function parsePackingList(file: File): Promise<{
  lines: PackingListLine[];
  additionalPhotos: number;
  rowsWithoutPhotos: number;
}> {
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
    throw new Error("Choisissez un classeur Excel .xlsx.");
  }
  if (file.size > MAX_PACKING_LIST_SIZE_BYTES) {
    throw new Error(`Le classeur dépasse la limite de ${MAX_PACKING_LIST_SIZE_BYTES / (1024 * 1024)} Mo.`);
  }

  let archive: ReturnType<typeof unzipSync>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Le classeur Excel est endommagé ou ne peut pas être décompressé.");
  }

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
    ? Array.from(
      parseXml(textDecoder.decode(sharedStringsBytes), "noms de produits").getElementsByTagNameNS(MAIN_NS, "si"),
      (item) => Array.from(item.getElementsByTagNameNS(MAIN_NS, "t"), (node) => node.textContent ?? "").join(""),
    )
    : [];
  const sheet = parseXml(textDecoder.decode(sheetBytes), "lignes de produits");
  const rows = Array.from(sheet.getElementsByTagNameNS(MAIN_NS, "row"));
  const rowValues = new Map<number, Map<string, string>>();
  let headerRow = -1;

  for (const row of rows) {
    const rowNumber = Number(row.getAttribute("r"));
    const values = new Map<string, string>();
    for (const cell of row.getElementsByTagNameNS(MAIN_NS, "c")) {
      const column = getCellColumn(cell.getAttribute("r") ?? "");
      if (column) values.set(column, getCellValue(cell, sharedStrings).trim());
    }
    rowValues.set(rowNumber, values);
    if (headerRow < 0 && values.get("A")?.toLocaleUpperCase() === "ITEM NO.") headerRow = rowNumber;
  }

  if (headerRow < 0) throw new Error("Format non reconnu : la colonne ITEM NO. du packing list est absente.");

  const productsByRow = new Map<number, PackingListLine>();
  const seenSkus = new Set<string>();
  for (const [rowNumber, values] of rowValues) {
    if (rowNumber <= headerRow) continue;
    const rawSku = values.get("A") ?? "";
    if (!rawSku) {
      const hasProductData = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]
        .some((column) => Boolean(values.get(column)));
      if (hasProductData) throw new Error(`Référence produit absente, ligne ${rowNumber}.`);
      continue;
    }
    if (rawSku.toLocaleUpperCase() === "TOTAL") continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(rawSku)) {
      throw new Error(`Référence produit invalide, ligne ${rowNumber}.`);
    }

    const cartons = integerCell(values.get("D") ?? "", "cartons", rowNumber);
    const pcsPerCarton = integerCell(values.get("E") ?? "", "quantité par carton", rowNumber);
    const totalPieces = integerCell(values.get("F") ?? "", "quantité totale", rowNumber);
    if (cartons < 1 || pcsPerCarton < 1 || totalPieces < 1 ||
        BigInt(cartons) * BigInt(pcsPerCarton) !== BigInt(totalPieces)) {
      throw new Error(`Les quantités ne concordent pas, ligne ${rowNumber}.`);
    }
    const sourceName = values.get("C") ?? "";
    const sku = rawSku.toLocaleUpperCase();
    if (seenSkus.has(sku)) throw new Error(`SKU en double dans le classeur : ${sku}.`);
    seenSkus.add(sku);

    const unitPriceRmb = decimalCell(values.get("G") ?? "", "prix RMB", rowNumber);
    const amountRmb = decimalCell(values.get("H") ?? "", "montant RMB", rowNumber);
    assertDecimalProduct(String(totalPieces), unitPriceRmb, amountRmb, "RMB", rowNumber);
    const cbmTotal = values.get("J") ? decimalCell(values.get("J")!, "CBM total", rowNumber) : null;
    const grossWeightTotal = values.get("L") ? decimalCell(values.get("L")!, "poids brut total", rowNumber) : null;

    productsByRow.set(rowNumber, {
      sku,
      sourceName,
      cartons,
      pcsPerCarton,
      totalPieces,
      unitPriceRmb,
      amountRmb,
      cbmTotal,
      grossWeightTotal,
      image: null,
    });
  }

  if (productsByRow.size === 0) throw new Error("Aucune ligne produit valide n’a été trouvée.");

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
      const names = imagesByRow.get(rowNumber) ?? [];
      names.push(resolveZipPath(drawingPath, mediaTarget));
      imagesByRow.set(rowNumber, names);
    }
  }

  let additionalPhotos = 0;
  let rowsWithoutPhotos = 0;
  for (const [rowNumber, line] of productsByRow) {
    const mediaNames = imagesByRow.get(rowNumber) ?? [];
    if (mediaNames.length === 0) {
      rowsWithoutPhotos += 1;
      continue;
    }
    additionalPhotos += Math.max(0, mediaNames.length - 1);
    const mediaName = mediaNames[0];
    const bytes = archive[mediaName];
    if (!bytes) throw new Error(`Photo intégrée introuvable pour le produit ${line.sku}.`);
    line.image = { bytes, mediaName };
  }

  return {
    lines: Array.from(productsByRow.values()),
    additionalPhotos,
    rowsWithoutPhotos,
  };
}
