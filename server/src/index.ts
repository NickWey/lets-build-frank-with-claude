import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
createApp(config).listen(config.port, () => {
  console.log(
    `Frank ${config.version} listening on :${config.port} ` +
      `(console: ${config.hasConsole ? "yes" : "not built"}, azure: ${config.azure.configured ? config.azure.resourceGroup : "not configured"})`,
  );
});
