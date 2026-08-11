import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function AdminUI() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/admin", { replace: true });
  }, [navigate]);
  return null;
}
