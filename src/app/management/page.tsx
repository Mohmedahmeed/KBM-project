import { getManagementData } from "@/lib/management-data";
import { getTunisToday, requireManagementAdmin } from "@/lib/management-access";
import { ManagementWorkspace } from "./management-workspace";

export const metadata = {
  title: "Gestion commerciale | KBM Stock",
};

export default async function ManagementPage({ searchParams }: PageProps<"/management">) {
  await requireManagementAdmin();
  const params = await searchParams;
  const data = await getManagementData();
  return <ManagementWorkspace
    data={data}
    today={getTunisToday()}
    initialSearch={typeof params.search === "string" ? params.search : ""}
  />;
}
