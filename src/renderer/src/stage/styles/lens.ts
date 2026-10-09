export interface LensOptions {
  /** Centre magnification amount: 0 = flat glass, 0.42 ≈ 1.7× at the centre. */
  strength: number
  /** Lens radius as a share of the screen height. */
  radius: number
  /** Chromatic aberration toward the rim. */
  aberration: number
  /** Draw the glass itself (black backdrop, rim shading, specular glint). Off over the desktop. */
  opaque: boolean
  /** Fade everything above this height (share of screen from the top), e.g. under a clock. */
  fadeTop?: number
  /** Height of that fade; 0 disables it. */
  fadeSpan?: number
}

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_strength;
uniform float u_radius;
uniform float u_aberration;
uniform float u_opaque;
uniform float u_fadeTop;
uniform float u_fadeSpan;
varying vec2 v_uv;

// Convex dome: sample closer to the centre where the glass is thickest (magnify),
// and approach 1:1 at the rim so there is no seam where the glass ends.
vec2 refract(vec2 uv, float strength) {
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float r = length(p) / u_radius;
  if (r >= 1.0) return uv;
  float dome = sqrt(1.0 - r * r);
  float m = mix(1.0, 1.0 - strength, pow(dome, 1.4));
  return 0.5 + (p * m) / aspect;
}

void main() {
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (v_uv - 0.5) * aspect;
  float r = length(p) / u_radius;
  float fringe = u_aberration * min(r, 1.0);
  vec4 cr = texture2D(u_tex, refract(v_uv, u_strength + fringe));
  vec4 cg = texture2D(u_tex, refract(v_uv, u_strength));
  vec4 cb = texture2D(u_tex, refract(v_uv, u_strength - fringe));
  vec4 color = vec4(cr.r, cg.g, cb.b, max(cg.a, max(cr.a, cb.a)));

  if (u_opaque > 0.5) {
    color.rgb *= mix(1.0, 0.5, smoothstep(0.72, 1.0, r));
    vec2 g = (p / u_radius - vec2(-0.34, 0.4)) * vec2(1.0, 2.2);
    float glint = exp(-dot(g, g) * 30.0) * 0.05 * step(r, 1.0);
    color = vec4(color.rgb + glint, 1.0);
  }
  if (u_fadeSpan > 0.0) {
    // Premultiplied alpha: scaling the whole colour fades toward whatever is behind.
    color *= smoothstep(u_fadeTop, u_fadeTop + u_fadeSpan, 1.0 - v_uv.y);
  }
  gl_FragColor = color;
}`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('lens shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/** Draws a source canvas through a convex glass lens with WebGL. `ok` is false when WebGL is unavailable. */
export class LensRenderer {
  private gl: WebGLRenderingContext | null = null
  private texture: WebGLTexture | null = null
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private lost = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    if (!vs || !fs) return
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    // One oversized triangle covers the whole viewport.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

    for (const name of ['u_tex', 'u_res', 'u_strength', 'u_radius', 'u_aberration', 'u_opaque', 'u_fadeTop', 'u_fadeSpan']) {
      this.uniforms[name] = gl.getUniformLocation(program, name)
    }
    gl.uniform1i(this.uniforms.u_tex!, 0)
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    this.gl = gl
  }

  get ok(): boolean {
    return this.gl !== null && !this.lost
  }

  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    this.gl?.viewport(0, 0, width, height)
  }

  /** Re-uploads the source (only needed when its pixels changed) and draws the lens. */
  draw(source: HTMLCanvasElement, opts: LensOptions, upload: boolean): void {
    const gl = this.gl
    if (!gl || this.lost) return
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    if (upload) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform2f(this.uniforms.u_res!, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.uniforms.u_strength!, opts.strength)
    gl.uniform1f(this.uniforms.u_radius!, opts.radius)
    gl.uniform1f(this.uniforms.u_aberration!, opts.aberration)
    gl.uniform1f(this.uniforms.u_opaque!, opts.opaque ? 1 : 0)
    gl.uniform1f(this.uniforms.u_fadeTop!, opts.fadeTop ?? 0)
    gl.uniform1f(this.uniforms.u_fadeSpan!, opts.fadeSpan ?? 0)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl = null
  }
}
