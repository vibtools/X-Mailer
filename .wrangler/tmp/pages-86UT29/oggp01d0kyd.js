// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: [
    "/api",
    "/api/*"
  ],
  exclude: [
    "/assets/*",
    "/favicon.ico",
    "/index.html",
    "/robots.txt",
    "/site.webmanifest"
  ]
};

// ../../../App/nvm/v22.23.2/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "D:\\VibTools_Workspace\\02_Websites\\09_X_Mailer\\.wrangler\\tmp\\pages-86UT29\\functionsWorker-0.7630341914764311.mjs";
import { isRoutingRuleMatch } from "D:\\App\\nvm\\v22.23.2\\node_modules\\wrangler\\templates\\pages-dev-util.ts";
export * from "D:\\VibTools_Workspace\\02_Websites\\09_X_Mailer\\.wrangler\\tmp\\pages-86UT29\\functionsWorker-0.7630341914764311.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=oggp01d0kyd.js.map
