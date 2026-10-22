export const tileVertexShader = /* glsl */ `
uniform float uOpenProgress;
uniform int uOpenId;
uniform float uPictureSize;

attribute float aId;
attribute vec2 aUvOffset;
attribute vec2 aUvScale;

varying vec2 vUv;
varying vec2 vLocalUv;
varying float vId;
varying float vShade;

void main() {
  vId = aId;
  vLocalUv = uv;
  vUv = uv * aUvScale + aUvOffset;

  float tileW = uPictureSize * 0.5;
  float tileH = uPictureSize * 0.625;
  vec3 local = vec3(position.x * tileW, position.y * tileH, 0.0);
  vec4 worldPos = instanceMatrix * vec4(local, 1.0);

  if (int(aId) == uOpenId && uOpenProgress > 0.0) {
    vec3 center = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec3 dir = normalize(center);
    worldPos.xyz += dir * uOpenProgress * 0.75;
  }

  vec4 mvPosition = modelViewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;

  vec3 center = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  vec3 outward = normalize(center);
  vShade = dot(outward, normalize(vec3(-0.5, -0.15, 0.15))) * 0.5 + 0.5;
}
`;

export const tileFragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uHoveredId;
uniform int uOpenId;
uniform float uOpenProgress;
uniform vec3 uTint;

varying vec2 vUv;
varying vec2 vLocalUv;
varying float vId;
varying float vShade;

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < 0.02) {
    tex = vec4(0.906, 0.867, 0.804, 1.0);
  }

  float edge = min(min(vLocalUv.x, 1.0 - vLocalUv.x), min(vLocalUv.y, 1.0 - vLocalUv.y));
  float alias = smoothstep(0.0, 0.02, edge);

  float hover = 1.0;
  if (abs(vId - uHoveredId) < 0.5) {
    hover = 1.05;
  }

  vec3 col = tex.rgb;
  col = mix(col, uTint, 0.04);
  col *= vShade;
  col *= hover;

  float distToEdge = min(min(vLocalUv.x, 1.0 - vLocalUv.x), min(vLocalUv.y, 1.0 - vLocalUv.y));
  float frame = clamp(1.0 - smoothstep(0.0, 0.035, distToEdge), 0.0, 1.0);
  col = mix(col, uTint, frame * 0.22);

  if (int(vId) == uOpenId) {
    col = mix(col, vec3(1.0), uOpenProgress * 0.12);
  }

  gl_FragColor = vec4(col, alias);
}
`;
