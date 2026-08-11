import { useEffect } from "react";
import { useNavigate } from "react-router";

/** OpenSaaS leftover — redirect into PaySuite dashboard. */
export default function DemoAppPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/dashboard", { replace: true });
  }, [navigate]);
  return (
    <div className="p-8 text-sm text-muted-foreground">
      Redirecting to PaySuite dashboard…
    </div>
  );
}
