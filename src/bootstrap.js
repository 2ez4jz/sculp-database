import { config } from "./config.js";
import {setupWebApp} from "./pwa/install.js?v=20261016";
const demo = new URLSearchParams(location.search).get("demo") === "1";
setupWebApp({demo:demo && config.environment === "demo"});
if (demo && config.environment === "demo") {
  document.querySelector("#auth-root").remove();
  document.body.append(
    document.querySelector("#demo-template").content.cloneNode(true),
  );
  document.querySelector("#demo-template").remove();
  const exit = document.createElement("a");
  exit.href = "./";
  exit.textContent = "返回登录";
  exit.className = "demo-exit";
  document.querySelector(".top-actions").prepend(exit);
  await import("./app.js?v=orders-album-20261016");
} else {
  document.querySelector("#demo-template").remove();
  await import("./pages/login/index.js?v=orders-album-20261016");
}
