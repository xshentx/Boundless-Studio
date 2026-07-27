import { useEffect, useState } from "react";
import CanvasHomePage from "@/app/canvas/home/page";
import CanvasWorkspacePage from "@/app/canvas/workspace/page";
import CanvasRepairPage from "@/app/canvas-repair/page";
import { CanvasProviders } from "@/app/canvas/canvas-providers";

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/canvas/workspace") return "workspace";
  if (path === "/canvas-repair") return "repair";
  return "home";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const page = route === "workspace" ? <CanvasWorkspacePage /> : route === "repair" ? <CanvasRepairPage /> : <CanvasHomePage />;
  return (
    <main className="h-screen overflow-hidden text-foreground">
      <div className="contents">
        <div key={route} className="animate-page-enter">
          <CanvasProviders>{page}</CanvasProviders>
        </div>
      </div>
    </main>
  );
}
