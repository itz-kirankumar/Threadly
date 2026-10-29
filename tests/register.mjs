// Registers the TypeScript path resolver for `node --test`:
//   node --import ./tests/register.mjs --test tests/*.test.mjs
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
