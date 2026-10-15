import type { WebGLState, WebGPUState } from "../../renderer";
import { tickWebGPU as tickWebGPUImpl } from "./render-tick-webgpu";
import type { RuntimeTickDeps } from "./render-tick-webgpu.types";

export function createRuntimeRenderTicks(deps: RuntimeTickDeps) {
  function tickWebGPU(state: WebGPUState) {
    return tickWebGPUImpl(deps, state);
  }

  function tickWebGL(_state: WebGLState) {
    // WebGL2 has been removed. WebGPU is the only renderer.
    return;
  }

  return { tickWebGPU, tickWebGL };
}
