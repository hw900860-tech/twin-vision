// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * The TanStack devtools Vite plugin (added by @lovable.dev/vite-tanstack-config in dev
 * mode) injects `data-tsd-source="file:line:col"` source-location attributes into JSX
 * elements so its devtools can map DOM nodes back to source. React-three-fiber's
 * reconciler then tries to apply that attribute onto THREE objects inside the
 * <Canvas> and throws `R3F: Cannot set "data-tsd-source"` on every commit — repeated
 * uncaught exceptions kill the WebGL render loop and black-screen the scene.
 *
 * This plugin strips those dev-only attributes from the emitted props objects.
 */
function stripTsdSourceAttrs(): Plugin {
  // The devtools inject-source transform adds `data-tsd-source="file:line:col"` to JSX
  // attributes, and the React/JSX transform then encodes them as props-object keys:
  // `"data-tsd-source": "/src/...tsx:39:5",`. R3F tries to set that key onto THREE
  // objects and throws on every commit. Remove the key/value pair (with its trailing
  // comma) from every props object the transform emits.
  const re = /\s*"data-tsd-source":\s*"[^"]*",?/g;
  return {
    name: "strip-tsd-source-attrs",
    transform(code, id) {
      if (id.includes("node_modules") || !code.includes("data-tsd-source")) return null;
      const out = code.replace(re, "");
      if (out !== code) return { code: out, map: null };
      return null;
    },
  };
}

export default defineConfig({
  plugins: [stripTsdSourceAttrs()],
  vite: {
    server: {
      port: 8080,
      host: true,
      allowedHosts: ["e2b.app", ".e2b.app"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
