// A fixed-size particle pool drawn as one THREE.Points object.
// Every buffer is allocated once. spawn() writes into a ring of slots and
// update() walks typed arrays, so steady play allocates nothing per frame.
// Particles are presentation only. They never touch gameplay state.

export const SHAPE_SOFT = 0;
export const SHAPE_DISC = 1;

// fade: 0 fades out over life, 1 fades in then out (steam, petals).
export const FADE_OUT = 0;
export const FADE_IN_OUT = 1;

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aShape;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying float vShape;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aAlpha > 0.001 ? aSize * uScale / max(0.1, -mv.z) : 0.0;
    vAlpha = aAlpha;
    vShape = aShape;
    vColor = aColor;
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vShape;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float soft = 1.0 - d;
    float edge = vShape < 0.5 ? soft * soft : smoothstep(1.0, 0.72, d);
    gl_FragColor = vec4(vColor, vAlpha * edge);
    #include <colorspace_fragment>
  }
`;

export class ParticlePool {
  constructor(THREE, capacity = 640) {
    this.capacity = capacity;
    this.cursor = 0;
    this.active = 0;

    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);

    this.velocity = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.sway = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.fade = new Uint8Array(capacity);

    const geometry = new THREE.BufferGeometry();
    this.attributes = {
      position: new THREE.BufferAttribute(this.position, 3),
      aColor: new THREE.BufferAttribute(this.color, 3),
      aSize: new THREE.BufferAttribute(this.size, 1),
      aAlpha: new THREE.BufferAttribute(this.alpha, 1),
      aShape: new THREE.BufferAttribute(this.shape, 1),
    };
    for (const [name, attribute] of Object.entries(this.attributes)) {
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scratchColor = new THREE.Color();
  }

  setColor(index, hex, tint = 1) {
    // THREE.Color converts sRGB hex into the linear working space;
    // the fragment shader converts back to the output color space.
    this.scratchColor.setHex(hex);
    this.color[index * 3] = this.scratchColor.r * tint;
    this.color[index * 3 + 1] = this.scratchColor.g * tint;
    this.color[index * 3 + 2] = this.scratchColor.b * tint;
  }

  spawn(
    x, y, z,
    vx, vy, vz,
    {
      color = 0xffffff,
      life = 0.7,
      size = 0.3,
      sizeEnd = size,
      alpha = 0.9,
      gravity = 0,
      drag = 0,
      sway = 0,
      shape = SHAPE_SOFT,
      fade = FADE_OUT,
      tint = 1,
    } = {},
  ) {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.life[index] <= 0) this.active += 1;

    const i3 = index * 3;
    this.position[i3] = x;
    this.position[i3 + 1] = y;
    this.position[i3 + 2] = z;
    this.velocity[i3] = vx;
    this.velocity[i3 + 1] = vy;
    this.velocity[i3 + 2] = vz;
    this.setColor(index, color, tint);
    this.age[index] = 0;
    this.life[index] = life;
    this.size0[index] = size;
    this.size1[index] = sizeEnd;
    this.alpha0[index] = alpha;
    this.gravity[index] = gravity;
    this.drag[index] = drag;
    this.sway[index] = sway;
    this.seed[index] = (index * 7.13) % 6.283;
    this.fade[index] = fade;
    this.shape[index] = shape;
    this.size[index] = size;
    this.alpha[index] = fade === FADE_IN_OUT ? 0.0011 : alpha;
  }

  update(dt) {
    if (this.active === 0) return;
    let active = 0;
    for (let index = 0; index < this.capacity; index += 1) {
      const life = this.life[index];
      if (life <= 0) continue;
      const age = this.age[index] + dt;
      if (age >= life) {
        this.life[index] = 0;
        this.alpha[index] = 0;
        this.size[index] = 0;
        continue;
      }
      active += 1;
      this.age[index] = age;
      const t = age / life;
      const i3 = index * 3;
      const damping = Math.max(0, 1 - this.drag[index] * dt);
      this.velocity[i3] *= damping;
      this.velocity[i3 + 1] = this.velocity[i3 + 1] * damping - this.gravity[index] * dt;
      this.velocity[i3 + 2] *= damping;
      const sway = this.sway[index];
      this.position[i3] += (this.velocity[i3]
        + (sway ? Math.sin(age * 2.6 + this.seed[index]) * sway : 0)) * dt;
      this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
      this.position[i3 + 2] += this.velocity[i3 + 2] * dt;

      const eased = 1 - (1 - t) * (1 - t);
      this.size[index] = this.size0[index]
        + (this.size1[index] - this.size0[index]) * eased;
      const envelope = this.fade[index] === FADE_IN_OUT
        ? Math.sin(Math.PI * t)
        : 1 - t * t;
      this.alpha[index] = Math.max(0.0011, this.alpha0[index] * envelope);
    }
    this.active = active;
    this.attributes.position.needsUpdate = true;
    this.attributes.aSize.needsUpdate = true;
    this.attributes.aAlpha.needsUpdate = true;
    this.attributes.aColor.needsUpdate = true;
    this.attributes.aShape.needsUpdate = true;
  }

  setViewportScale(drawingBufferHeight, fovDegrees) {
    const half = (fovDegrees * Math.PI) / 360;
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan(half));
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
