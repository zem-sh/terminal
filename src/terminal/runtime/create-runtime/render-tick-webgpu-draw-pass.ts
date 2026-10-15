import { emitWebGPUQueuedGlyphs } from "./render-tick-webgpu-emit-glyphs";
import type { DrawWebGPUFrameParams } from "./render-tick-webgpu.types";
import { injectCursorTrailUniforms } from "../render-stage-shaders";

export function drawWebGPUFrame(params: DrawWebGPUFrameParams) {
  const { deps, state, frame, cursor, cursorPos, cursorStyle, rows, cols, cellW, cellH, yPad, baselineOffset, underlineOffsetPx, underlineThicknessPx, primaryScale, textHeight, useLinearBlending, useLinearCorrection, clearColor, hasShaderStages, stageTargets, compiledWebGPUStages } = params;
  const { device, context } = state;
  const { wasmHandle, wasmExports, canvas, decodePackedRGBA, cursorFallback, clamp, scrollbarState, syncScrollbar, webgpuUniforms, ensureInstanceBuffer, GLYPH_INSTANCE_FLOATS, wasm, collectKittyDrawPlan, resolveKittyWebGPUBindGroup } = deps;

  emitWebGPUQueuedGlyphs({ deps, state, frame, queueByFont: frame.glyphQueueByFont, targetMaps: { nearest: frame.glyphDataNearestByFont, linear: frame.glyphDataLinearByFont }, cellW, cellH, yPad, baselineOffset, primaryScale });
  emitWebGPUQueuedGlyphs({ deps, state, frame, queueByFont: frame.overlayGlyphQueueByFont, targetMaps: { nearest: frame.overlayGlyphDataNearestByFont, linear: frame.overlayGlyphDataLinearByFont }, cellW, cellH, yPad, baselineOffset, primaryScale });

  if (cursorStyle !== null && cursorPos) {
    let cursorCol = cursorPos.col;
    let cursorRow = cursorPos.row;
    let cursorWidth = cellW;
    if (cursorPos.wideTail && cursorCol > 0) { cursorCol -= 1; cursorWidth = cellW * 2; }
    if (cursorRow < rows && cursorCol < cols) {
      const x = cursorCol * cellW;
      const y = cursorRow * cellH;
      const cursorColor = cursor?.color ? decodePackedRGBA(cursor.color) : cursorFallback;
      const ct = underlineThicknessPx;
      if (cursorStyle === 0) {
        // Align the block cursor with the text block: glyphs are anchored at
        // `yPad` (their baseline is yPad + baselineOffset), so centering the
        // cursor on the full cell would push it below the text whenever the
        // cell height is increased (line-height setting).
        const cursorPadY = Math.max(0, yPad);
        deps.pushRect(frame.fgRectData, x, y + cursorPadY, cursorWidth, textHeight, cursorColor);
      } else if (cursorStyle === 1) {
        const offset = Math.floor((ct + 1) / 2);
        deps.pushRect(frame.cursorData, x - offset, y, ct, cellH, cursorColor);
      } else if (cursorStyle === 2) {
        const baseY = cursorRow * cellH + yPad + baselineOffset;
        const underlineY = clamp(baseY + underlineOffsetPx, y + 1, y + cellH - ct - 1);
        deps.pushRect(frame.cursorData, x, underlineY, cursorWidth, ct, cursorColor);
      } else if (cursorStyle === 3) {
        deps.pushRect(frame.cursorData, x, y, cursorWidth, ct, cursorColor);
        deps.pushRect(frame.cursorData, x, y + cellH - ct, cursorWidth, ct, cursorColor);
        deps.pushRect(frame.cursorData, x, y, ct, cellH, cursorColor);
        deps.pushRect(frame.cursorData, x + cursorWidth - ct, y, ct, cellH, cursorColor);
      } else {
        deps.pushRect(frame.fgRectData, x, y, cursorWidth, cellH, cursorColor);
      }
    }
  }

  if (wasmExports && wasmHandle && wasmExports.restty_scrollbar_total) {
    const total = wasmExports.restty_scrollbar_total(wasmHandle) || 0;
    const offset = wasmExports.restty_scrollbar_offset ? wasmExports.restty_scrollbar_offset(wasmHandle) : 0;
    const len = wasmExports.restty_scrollbar_len ? wasmExports.restty_scrollbar_len(wasmHandle) : rows;
    if (total !== scrollbarState.lastTotal || offset !== scrollbarState.lastOffset || len !== scrollbarState.lastLen) {
      scrollbarState.lastTotal = total;
      scrollbarState.lastOffset = offset;
      scrollbarState.lastLen = len;
    }
    syncScrollbar(total, offset, len);
  }

  webgpuUniforms[0] = canvas.width;
  webgpuUniforms[1] = canvas.height;
  webgpuUniforms[2] = 0;
  webgpuUniforms[3] = 0;
  webgpuUniforms[4] = useLinearBlending ? 1 : 0;
  webgpuUniforms[5] = useLinearCorrection ? 1 : 0;
  webgpuUniforms[6] = 0;
  webgpuUniforms[7] = 0;
  device.queue.writeBuffer(state.uniformBuffer, 0, webgpuUniforms);

  const presentView = context.getCurrentTexture().createView();
  const mainView = hasShaderStages && stageTargets ? stageTargets.sceneView : presentView;
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: mainView,
      clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
      loadOp: "clear", storeOp: "store",
    }],
  });

  const alignTo4 = (value: number) => (value + 3) & ~3;
  const uploadInstanceBatches = (kind: "rect" | "glyph", batches: Array<{ array: Float32Array; offset: number }>) => {
    if (!batches.length) return;
    let totalBytes = 0;
    for (const batch of batches) { totalBytes = alignTo4(totalBytes); batch.offset = totalBytes; totalBytes += batch.array.byteLength; }
    ensureInstanceBuffer(state, kind, totalBytes);
    const buffer = kind === "rect" ? state.rectInstanceBuffer : state.glyphInstanceBuffer;
    for (const batch of batches) device.queue.writeBuffer(buffer, batch.offset, batch.array);
  };

  const rectBaseBatches: Array<{ array: Float32Array; offset: number; instances: number }> = [];
  const rectDecorBatches: Array<{ array: Float32Array; offset: number; instances: number }> = [];
  const rectTopBatches: Array<{ array: Float32Array; offset: number; instances: number }> = [];
  const pushRectBatch = (target: typeof rectBaseBatches, data: number[]) => {
    if (!data.length) return;
    target.push({ array: new Float32Array(data), offset: 0, instances: data.length / 8 });
  };
  pushRectBatch(rectBaseBatches, frame.bgData);
  pushRectBatch(rectBaseBatches, frame.selectionData);
  pushRectBatch(rectDecorBatches, frame.underlineData);
  pushRectBatch(rectDecorBatches, frame.fgRectData);
  pushRectBatch(rectTopBatches, frame.cursorData);
  pushRectBatch(rectTopBatches, frame.overlayData);

  type GlyphBatch = { array: Float32Array; offset: number; instances: number; pipeline: GPURenderPipeline; bindGroup: GPUBindGroup };
  const glyphMainBatches: GlyphBatch[] = [];
  const glyphOverlayBatches: GlyphBatch[] = [];

  for (const [fontIndex, glyphData] of frame.glyphDataNearestByFont.entries()) {
    if (!glyphData.length) continue;
    const atlasState = state.glyphAtlases?.get(fontIndex);
    if (!atlasState?.bindGroupNearest) continue;
    glyphMainBatches.push({ array: new Float32Array(glyphData), offset: 0, instances: glyphData.length / GLYPH_INSTANCE_FLOATS, pipeline: state.glyphPipelineNearest, bindGroup: atlasState.bindGroupNearest });
  }
  for (const [fontIndex, glyphData] of frame.glyphDataLinearByFont.entries()) {
    if (!glyphData.length) continue;
    const atlasState = state.glyphAtlases?.get(fontIndex);
    if (!atlasState?.bindGroupLinear) continue;
    glyphMainBatches.push({ array: new Float32Array(glyphData), offset: 0, instances: glyphData.length / GLYPH_INSTANCE_FLOATS, pipeline: state.glyphPipeline, bindGroup: atlasState.bindGroupLinear });
  }
  for (const [fontIndex, glyphData] of frame.overlayGlyphDataNearestByFont.entries()) {
    if (!glyphData.length) continue;
    const atlasState = state.glyphAtlases?.get(fontIndex);
    if (!atlasState?.bindGroupNearest) continue;
    glyphOverlayBatches.push({ array: new Float32Array(glyphData), offset: 0, instances: glyphData.length / GLYPH_INSTANCE_FLOATS, pipeline: state.glyphPipelineNearest, bindGroup: atlasState.bindGroupNearest });
  }
  for (const [fontIndex, glyphData] of frame.overlayGlyphDataLinearByFont.entries()) {
    if (!glyphData.length) continue;
    const atlasState = state.glyphAtlases?.get(fontIndex);
    if (!atlasState?.bindGroupLinear) continue;
    glyphOverlayBatches.push({ array: new Float32Array(glyphData), offset: 0, instances: glyphData.length / GLYPH_INSTANCE_FLOATS, pipeline: state.glyphPipeline, bindGroup: atlasState.bindGroupLinear });
  }

  const kittyPlacements = wasm && wasmHandle ? wasm.getKittyPlacements(wasmHandle) : [];
  const kittyPlan = collectKittyDrawPlan(kittyPlacements, cellW, cellH);
  const kittyUnderlayBatches: GlyphBatch[] = [];
  const kittyOverlayBatches: GlyphBatch[] = [];
  const pushKittyBatches = (target: GlyphBatch[], slices: typeof kittyPlan.underlay) => {
    let currentBindGroup: GPUBindGroup | null = null;
    let currentData: number[] = [];
    const flush = () => {
      if (!currentBindGroup || !currentData.length) return;
      target.push({ array: new Float32Array(currentData), offset: 0, instances: currentData.length / GLYPH_INSTANCE_FLOATS, pipeline: state.glyphPipeline, bindGroup: currentBindGroup });
      currentData = [];
    };
    for (const slice of slices) {
      const bindGroup = resolveKittyWebGPUBindGroup(state, slice, false);
      if (!bindGroup) continue;
      if (currentBindGroup && bindGroup !== currentBindGroup) flush();
      currentBindGroup = bindGroup;
      const invW = slice.imageWidth > 0 ? 1 / slice.imageWidth : 0;
      const invH = slice.imageHeight > 0 ? 1 / slice.imageHeight : 0;
      currentData.push(slice.dx, slice.dy, slice.dw, slice.dh, slice.sx * invW, slice.sy * invH, (slice.sx + slice.sw) * invW, (slice.sy + slice.sh) * invH, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1);
    }
    flush();
  };
  pushKittyBatches(kittyUnderlayBatches, kittyPlan.underlay);
  pushKittyBatches(kittyOverlayBatches, kittyPlan.overlay);

  uploadInstanceBatches("rect", [...rectBaseBatches, ...rectDecorBatches, ...rectTopBatches]);
  uploadInstanceBatches("glyph", [...glyphMainBatches, ...glyphOverlayBatches, ...kittyUnderlayBatches, ...kittyOverlayBatches]);

  pass.setVertexBuffer(0, state.vertexBuffer);

  const drawRectBatches = (batches: Array<{ array: Float32Array; offset: number; instances: number }>) => {
    if (!batches.length) return;
    pass.setPipeline(state.rectPipeline);
    pass.setBindGroup(0, state.rectBindGroup);
    for (const batch of batches) {
      pass.setVertexBuffer(1, state.rectInstanceBuffer, batch.offset, batch.array.byteLength);
      pass.draw(6, batch.instances, 0, 0);
    }
  };

  const drawGlyphBatches = (batches: Array<{ array: Float32Array; offset: number; instances: number; pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }>) => {
    for (const batch of batches) {
      pass.setPipeline(batch.pipeline);
      pass.setBindGroup(0, batch.bindGroup);
      pass.setVertexBuffer(1, state.glyphInstanceBuffer, batch.offset, batch.array.byteLength);
      pass.draw(6, batch.instances, 0, 0);
    }
  };

  drawRectBatches(rectBaseBatches);
  drawGlyphBatches(kittyUnderlayBatches);
  drawRectBatches(rectDecorBatches);
  drawGlyphBatches(glyphMainBatches);
  drawGlyphBatches(kittyOverlayBatches);
  drawRectBatches(rectTopBatches);
  drawGlyphBatches(glyphOverlayBatches);

  pass.end();

  if (hasShaderStages && stageTargets) {
    injectCursorTrailUniforms(compiledWebGPUStages, cursorPos, cellW, cellH, canvas.width, canvas.height);
    let source = "scene";
    const nowSec = performance.now() * 0.001;
    for (let i = 0; i < compiledWebGPUStages.length; i += 1) {
      const stage = compiledWebGPUStages[i];
      stage.uniformData[0] = canvas.width;
      stage.uniformData[1] = canvas.height;
      stage.uniformData[2] = nowSec;
      stage.uniformData[3] = 0;
      for (let j = 0; j < 8; j += 1) stage.uniformData[4 + j] = stage.params[j] ?? 0;
      device.queue.writeBuffer(stage.uniformBuffer, 0, stage.uniformData);

      const isLast = i === compiledWebGPUStages.length - 1;
      const target = !isLast ? (source === "ping" ? stageTargets.pongView : stageTargets.pingView) : presentView;
      const bindGroup = source === "scene" ? stage.bindGroupScene : source === "ping" ? stage.bindGroupPing : stage.bindGroupPong;
      if (!bindGroup) continue;
      const stagePass = encoder.beginRenderPass({
        colorAttachments: [{ view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
      });
      stagePass.setPipeline(stage.pipeline);
      stagePass.setBindGroup(0, bindGroup);
      stagePass.setVertexBuffer(0, state.vertexBuffer);
      stagePass.draw(6, 1, 0, 0);
      stagePass.end();
      if (!isLast) source = source === "ping" ? "pong" : "ping";
    }
  }

  device.queue.submit([encoder.finish()]);
}
