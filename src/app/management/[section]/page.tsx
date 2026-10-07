import { notFound } from "next/navigation";
import { getManagementData } from "@/lib/management-data";
import { getTunisToday, requireManagementAdmin } from "@/lib/management-access";
import { ManagementWorkspace, type Section } from "../management-workspace";

const sections: Section[] = ["products", "stock", "shipments", "sales", "customers", "payments", "costs"];

function isManagementSection(section: string): section is Section {
  return sections.some((item) => item === section);
}

export async function generateMetadata({ params }: PageProps<"/management/[section]">) {
  const { section } = await params;
  const labels: Record<string, string> = {
    products: "Produits",
    stock: "Mouvements de stock",
    shipments: "Containers",
    sales: "Ventes",
    customers: "Clients",
    payments: "Paiements",
    costs: "Frais containers",
  };
  return { title: `${labels[section] ?? "Gestion"} | KBM Stock` };
}

export default async function ManagementSectionPage(props: PageProps<"/management/[section]">) {
  await requireManagementAdmin();
  const [{ section }, searchParams] = await Promise.all([props.params, props.searchParams]);
  if (!isManagementSection(section)) notFound();
  const data = await getManagementData();
  return <ManagementWorkspace
    data={data}
    today={getTunisToday()}
    initialSection={section}
    initialSearch={typeof searchParams.search === "string" ? searchParams.search : ""}
  />;
}
