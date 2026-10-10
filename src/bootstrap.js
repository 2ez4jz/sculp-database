import { config } from "./config.js";
const demo = new URLSearchParams(location.search).get("demo") === "1";
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
  await import("./app.js?v=advisor-release-20261009b");
} else {
  document.querySelector("#demo-template").remove();
  await import("./pages/login/index.js");
}
