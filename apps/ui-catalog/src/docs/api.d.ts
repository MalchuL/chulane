/** Resolved from the built library by the catalog Vite plugin. */
declare module "virtual:component-api" {
  const api: Record<string, { name: string; type: string; optional: boolean }[]>;
  export default api;
}
