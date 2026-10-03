import { requireManagementAdmin } from "@/lib/management-access";
import { BusinessAssistant } from "./business-assistant";

export const metadata = { title: "Assistant commercial IA | KBM Stock" };

export default async function BusinessAssistantPage() {
  await requireManagementAdmin();
  return <BusinessAssistant />;
}
