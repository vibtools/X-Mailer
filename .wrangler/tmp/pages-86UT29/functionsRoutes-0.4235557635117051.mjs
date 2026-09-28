import { onRequest as __api___catchall___ts_onRequest } from "D:\\VibTools_Workspace\\02_Websites\\09_X_Mailer\\functions\\api\\[[catchall]].ts"
import { onRequestOptions as ___middleware_ts_onRequestOptions } from "D:\\VibTools_Workspace\\02_Websites\\09_X_Mailer\\functions\\_middleware.ts"
import { onRequest as ___middleware_ts_onRequest } from "D:\\VibTools_Workspace\\02_Websites\\09_X_Mailer\\functions\\_middleware.ts"

export const routes = [
    {
      routePath: "/api/:catchall*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___catchall___ts_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [___middleware_ts_onRequestOptions],
      modules: [],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]