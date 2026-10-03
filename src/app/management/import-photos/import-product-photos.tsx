"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parsePackingListImages, type PackedProductImage } from "@/lib/packing-list-images";
import { createClient } from "@/lib/supabase/client";

type ImportCandidate = PackedProductImage & { alreadyHasImage: boolean };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}

function optimizeImage(image: PackedProductImage) {
  return (async () => {
    const extension = image.mediaName.split(".").pop()?.toLowerCase() ?? "";
    const mime = extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "bmp"
        ? "image/bmp"
        : extension === "webp"
          ? "image/webp"
          : "image/png";
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(image.bytes).buffer], { type: mime }));
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error(`Préparation de l’image impossible pour ${image.sku}.`);
    }
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error(`Compression impossible pour ${image.sku}.`)), "image/webp", quality);
    });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob;
    try {
      blob = await encode(0.84);
      if (blob.size > 4_500_000) blob = await encode(0.68);
      if (blob.size > 4_500_000) {
        canvas.width = Math.max(1, Math.round(canvas.width * 0.7));
        canvas.height = Math.max(1, Math.round(canvas.height * 0.7));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await encode(0.62);
      }
    } finally {
      bitmap.close();
    }
    if (blob.size > 5 * 1024 * 1024) throw new Error(`La photo ${image.sku} dépasse la limite de stockage après compression.`);
    const format = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    return { blob, format };
  })();
}

export function ImportProductPhotos() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [additionalPhotos, setAdditionalPhotos] = useState(0);
  const [rowsWithoutPhotos, setRowsWithoutPhotos] = useState(0);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  async function analyze() {
    setFailure("");
    setMessage("");
    setCandidates([]);
    setUnmatched([]);
    if (!file) {
      setFailure("Sélectionnez d’abord un fichier .xlsx.");
      return;
    }

    try {
      setProgress("Lecture locale du classeur et repérage des photos…");
      const parsed = await parsePackingListImages(file);
      setAdditionalPhotos(parsed.additionalPhotos);
      setRowsWithoutPhotos(parsed.rowsWithoutPhotos);
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || userData.user?.email?.toLowerCase() !== "derbycafe33@gmail.com") {
        throw new Error("Connectez-vous avec le compte administrateur pour importer les photos.");
      }
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("sku,image_path")
        .limit(1000);
      if (productsError) throw new Error(`Lecture des produits impossible : ${productsError.message}`);
      const productBySku = new Map((products ?? []).map((product) => [product.sku.toUpperCase(), product]));
      const missing = parsed.images.filter((image) => !productBySku.has(image.sku.toUpperCase())).map((image) => image.sku);
      const matched = parsed.images.flatMap((image) => {
        const product = productBySku.get(image.sku.toUpperCase());
        return product ? [{ ...image, alreadyHasImage: Boolean(product.image_path) }] : [];
      });
      setCandidates(matched);
      setUnmatched(missing);
      if (matched.length === 0) throw new Error("Aucune photo ne correspond aux produits enregistrés dans Supabase.");
      setMessage(`${matched.length} photos reconnues pour des produits existants; ${missing.length} SKU absents de la base.`);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setProgress(null);
    }
  }

  async function importPhotos() {
    setFailure("");
    setMessage("");
    const toImport = candidates.filter((candidate) => replaceExisting || !candidate.alreadyHasImage);
    if (toImport.length === 0) {
      setFailure("Aucune photo à importer. Activez le remplacement si vous souhaitez remplacer les photos existantes.");
      return;
    }

    const supabase = createClient();
    const uploadedPaths: string[] = [];
    const mappings: Array<{ sku: string; image_path: string }> = [];
    let completed = 0;
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || userData.user?.email?.toLowerCase() !== "derbycafe33@gmail.com") {
        throw new Error("Accès réservé au compte administrateur.");
      }
      for (let offset = 0; offset < toImport.length; offset += 4) {
        const batch = toImport.slice(offset, offset + 4);
        setProgress(`Préparation et envoi des photos : ${completed}/${toImport.length}`);
        const results = await Promise.allSettled(batch.map(async (image) => {
          const { blob, format } = await optimizeImage(image);
          const safeSku = image.sku.toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
          const path = `${safeSku}/${crypto.randomUUID()}.${format}`;
          const { error } = await supabase.storage.from("product-images").upload(path, blob, {
            contentType: blob.type,
            upsert: false,
          });
          if (error) throw new Error(`Envoi de la photo ${image.sku} impossible : ${error.message}`);
          uploadedPaths.push(path);
          return { sku: image.sku.toUpperCase(), image_path: path };
        }));
        completed += batch.length;
        setProgress(`Photos envoyées : ${completed}/${toImport.length}`);
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (rejected) throw rejected.reason;
        mappings.push(...results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
      }

      const { error: saveError } = await supabase.rpc("web_import_product_images", { p_images: mappings });
      if (saveError) throw new Error(`Association des photos impossible : ${saveError.message}`);
      setCandidates((current) => current.map((candidate) => ({ ...candidate, alreadyHasImage: true })));
      setMessage(`${mappings.length} photos associées aux produits. Les nouvelles images sont affichées dans le catalogue.`);
      router.refresh();
    } catch (error) {
      const cleanup = uploadedPaths.length
        ? await supabase.storage.from("product-images").remove(uploadedPaths)
        : { error: null };
      const cleanupNotice = cleanup.error ? ` Les fichiers temporaires n’ont pas pu être supprimés : ${cleanup.error.message}` : "";
      setFailure(`${errorMessage(error)}${cleanupNotice}`);
    } finally {
      setProgress(null);
    }
  }

  const importableCount = candidates.filter((candidate) => replaceExisting || !candidate.alreadyHasImage).length;

  return (
    <main className="photo-import-page" dir="ltr" lang="fr">
      <header className="photo-import-header">
        <div><p>KBM STOCK / CATALOGUE</p><h1>Importer les photos des produits</h1><p>Importez le packing list Excel directement dans le catalogue. Le fichier et les photos sont traités dans votre navigateur, sans Telegram et sans envoi du classeur à un service IA.</p></div>
        <Link href="/management/products">Retour aux produits</Link>
      </header>
      <section className="photo-import-card">
        <ol className="photo-import-steps">
          <li><strong>1. Choisissez le fichier</strong><span>Classeur .xlsx contenant les SKU en colonne ITEM NO. et les photos en colonne Photo.</span></li>
          <li><strong>2. Vérifiez l’aperçu</strong><span>Seules les photos correspondant aux SKU déjà présents seront liées. Les données de stock, prix et description ne sont pas modifiées.</span></li>
          <li><strong>3. Lancez l’import</strong><span>Les images sont réduites et converties pour l’espace privé Supabase, puis associées aux produits.</span></li>
        </ol>
        <label className="photo-import-file">
          <span>Fichier Excel (.xlsx), jusqu’à 60 Mo</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={progress !== null} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setCandidates([]); setMessage(""); setFailure(""); }} />
        </label>
        {file && <p className="photo-import-file-info">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo</p>}
        <button type="button" className="photo-import-button secondary" disabled={!file || progress !== null} onClick={analyze}>Analyser les photos dans ce navigateur</button>
        {message && <p className="photo-import-message" role="status">{message}</p>}
        {failure && <p className="photo-import-error" role="alert">{failure}</p>}
        {progress && <p className="photo-import-progress" role="status">{progress}</p>}
        {candidates.length > 0 && (
          <section className="photo-import-preview">
            <h2>Aperçu avant import</h2>
            <p>{candidates.length} produits avec photo correspondent à votre catalogue; {candidates.filter((item) => item.alreadyHasImage).length} ont déjà une photo.</p>
            {(additionalPhotos > 0 || rowsWithoutPhotos > 0) && <p>{additionalPhotos} photos supplémentaires sur une ligne déjà illustrée ne sont pas importées, car chaque produit possède un seul champ photo. {rowsWithoutPhotos} lignes n’ont aucune image intégrée.</p>}
            {unmatched.length > 0 && <p className="photo-import-warning">SKU non présents dans la base (ignorés) : {unmatched.slice(0, 20).join(", ")}{unmatched.length > 20 ? ` et ${unmatched.length - 20} autres` : ""}.</p>}
            <label className="photo-import-replace"><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> Remplacer aussi les photos déjà présentes</label>
            <ul className="photo-import-sku-list">{candidates.slice(0, 24).map((candidate) => <li key={candidate.sku}>{candidate.sku}{candidate.alreadyHasImage && <span> · photo actuelle conservée</span>}</li>)}</ul>
            {candidates.length > 24 && <p>… et {candidates.length - 24} autres produits.</p>}
            <button type="button" className="photo-import-button" disabled={progress !== null || importableCount === 0} onClick={importPhotos}>Importer {importableCount} photos dans les produits</button>
          </section>
        )}
      </section>
      <p className="photo-import-note">Les photos restent privées et visibles uniquement dans l’espace connecté. La limite Telegram ne s’applique pas à cet import direct depuis votre ordinateur.</p>
    </main>
  );
}
