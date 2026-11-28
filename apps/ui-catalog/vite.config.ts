/** Derives public prop documentation from the same declarations consumed by the demo. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const declarationOptions: ts.CompilerOptions = {
  skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
};

/**
 * Load the declaration graph through the library's public TypeScript entry.
 * @returns The root declaration and its type checker.
 * @throws If the library declarations cannot be loaded.
 */
function loadComponentDeclarations() {
  const declaration = ts.resolveModuleName(
    "@chulane/ui",
    fileURLToPath(import.meta.url),
    declarationOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (!declaration) {
    throw Error("Build @chulane/ui before starting the catalog");
  }
  const program = ts.createProgram([declaration], declarationOptions);
  const file = program.getSourceFile(declaration);
  if (!file) {
    throw Error("Could not load @chulane/ui declarations");
  }
  return { checker: program.getTypeChecker(), file };
}

/**
 * Read the public components' props for the catalog reference.
 * @returns Prop descriptions indexed by component export.
 */
function componentApi() {
  const { checker, file } = loadComponentDeclarations();
  const module = checker.getSymbolAtLocation(file)!;
  const api: Record<string, unknown> = {};
  for (const symbol of checker.getExportsOfModule(module)) {
    if (!/^[A-Z]/.test(symbol.name)) {
      continue;
    }
    const type = checker.getTypeOfSymbolAtLocation(symbol, file);
    const signature = type.getCallSignatures()[0];
    if (!signature) {
      continue;
    }
    const props = signature.parameters[0];
    api[symbol.name] = props
      ? checker
          .getPropertiesOfType(checker.getTypeOfSymbolAtLocation(props, file))
          .filter((p) => !p.name.startsWith("on") || !p.name.endsWith("Capture"))
          .filter(
            (p) =>
              p.declarations?.some((d) => !d.getSourceFile().fileName.includes("@types/react/")) ||
              [
                "children",
                "value",
                "onChange",
                "disabled",
                "className",
                "onClick",
                "placeholder",
                "ref",
              ].includes(p.name),
          )
          .map((p) => ({
            name: p.name,
            type: checker.typeToString(
              checker.getTypeOfSymbolAtLocation(p, file),
              file,
              ts.TypeFormatFlags.NoTruncation,
            ),
            optional: Boolean(p.flags & ts.SymbolFlags.Optional),
          }))
      : [];
  }
  return api;
}
export default defineConfig({
  plugins: [
    react(),
    {
      name: "public-component-api",
      resolveId: (id) => (id === "virtual:component-api" ? "\0component-api" : undefined),
      load: (id) =>
        id === "\0component-api" ? "export default " + JSON.stringify(componentApi()) : undefined,
    },
  ],
});
