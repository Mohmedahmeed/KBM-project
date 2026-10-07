import { requireManagementAdmin } from "@/lib/management-access";
import { ImportStock } from "./import-stock";

export const metadata = { title: "Importer le stock | KBM Stock" };

export default async function ImportStockPage() {
  await requireManagementAdmin();
  return <ImportStock />;
}
