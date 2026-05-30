import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Order() {
  return <Navigate to={createPageUrl("Menu")} replace />;
}
