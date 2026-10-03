import { requireManagementAdmin } from "@/lib/management-access";
import { ImportProductPhotos } from "./import-product-photos";

export const metadata = { title: "Importer les photos produits | KBM Stock" };

export default async function ImportProductPhotosPage() {
  await requireManagementAdmin();
  return <ImportProductPhotos />;
}
