import { createRoot } from "react-dom/client";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import App from "./app/App";

createRoot(document.getElementById("root")!).render(<App />);
