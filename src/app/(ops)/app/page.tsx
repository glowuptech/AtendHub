import { redirect } from "next/navigation";
import { appHomePath } from "@/features/auth/navigation";

export default function AppHome() {
  redirect(appHomePath);
}
