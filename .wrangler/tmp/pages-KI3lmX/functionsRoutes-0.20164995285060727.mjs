import { onRequest as __api_geo_ts_onRequest } from "/Users/tobiasmaeder/Documents/04_Arbeit_Projekte/Queer Guide/Dev/web/functions/api/geo.ts"

export const routes = [
    {
      routePath: "/api/geo",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_geo_ts_onRequest],
    },
  ]