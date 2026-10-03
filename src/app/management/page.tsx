import { getManagementData } from "@/lib/management-data";
import { getTunisToday, requireManagementAdmin } from "@/lib/management-access";
import { ManagementWorkspace } from "./management-workspace";

export const metadata = {
  title: "Gestion commerciale | KBM Stock",
};

export default async function ManagementPage() {
  await requireManagementAdmin();
  const data = await getManagementData();
  return <ManagementWorkspace data={data} today={getTunisToday()} />;
}
