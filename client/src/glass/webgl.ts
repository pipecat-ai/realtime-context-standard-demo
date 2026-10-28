let supported: boolean | null = null

/** Whether WebGL2 is available. Probed once; the probe's context is released. */
export function supportsWebGL2(): boolean {
  if (supported === null) {
    const gl = document.createElement("canvas").getContext("webgl2")
    supported = gl !== null
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
  }
  return supported
}

/** One triangle covering the viewport, at attribute 0. */
export const FULLSCREEN_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

export function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("glass: createShader failed")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`glass: ${log ?? "shader failed to compile"}`)
  }
  return shader
}

/** Links a fragment shader against a shared vertex shader. */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertex: WebGLShader,
  fragmentSource: string
): WebGLProgram {
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, "aPosition")
  gl.linkProgram(program)
  // Flagged for deletion; freed with the program.
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`glass: ${gl.getProgramInfoLog(program) ?? "link failed"}`)
  }
  return program
}

/** Binds the fullscreen triangle to attribute 0. */
export function bindFullscreenTriangle(
  gl: WebGL2RenderingContext
): WebGLBuffer {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return buffer
}
