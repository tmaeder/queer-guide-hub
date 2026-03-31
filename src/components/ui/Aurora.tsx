import { useEffect, useRef, useState } from 'react';
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

import './Aurora.css';

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[6];
uniform int uNumStops;
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec3 colorRamp(float factor) {
  float numSegments = float(uNumStops - 1);
  float scaledFactor = factor * numSegments;
  int index = int(floor(scaledFactor));
  index = min(index, uNumStops - 2);
  float lerpFactor = scaledFactor - float(index);
  return mix(uColorStops[index], uColorStops[index + 1], lerpFactor);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec3 rampColor = colorRamp(uv.x);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  time?: number;
  speed?: number;
}

export default function Aurora(props: AuroraProps) {
  const { colorStops = ['#7CFF67', '#FF9257', '#5227FF'], amplitude = 1.0, blend = 0.5 } = props;
  const propsRef = useRef<AuroraProps>(props);
  propsRef.current = props;

  const ctnDom = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  });

  useEffect(() => {
    if (!webglSupported) return;
    const ctn = ctnDom.current;
    if (!ctn) return;

    let renderer: Renderer;
    let animateId = 0;
    let cleanupFn: (() => void) | undefined;

    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
      });

      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.canvas.style.backgroundColor = 'transparent';

      let program: Program | undefined;

      function resize() {
        if (!ctn) return;
        const width = ctn.offsetWidth;
        const height = ctn.offsetHeight;
        if (width === 0 || height === 0) return;
        renderer.setSize(width, height);
        if (program) {
          program.uniforms.uResolution.value = [width, height];
        }
      }
      window.addEventListener('resize', resize);

      const geometry = new Triangle(gl);
      if (geometry.attributes.uv) {
        delete geometry.attributes.uv;
      }

      const padStops = (stops: string[]) => {
        const arr = stops.map((hex) => {
          const c = new Color(hex);
          return [c.r, c.g, c.b];
        });
        while (arr.length < 6) {
          arr.push(arr[arr.length - 1]);
        }
        return arr.slice(0, 6);
      };

      const colorStopsArray = padStops(colorStops);

      program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: amplitude },
          uColorStops: { value: colorStopsArray },
          uNumStops: { value: Math.min(colorStops.length, 6) },
          uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
          uBlend: { value: blend },
        },
      });

      const mesh = new Mesh(gl, { geometry, program });
      ctn.appendChild(gl.canvas);

      const update = (t: number) => {
        animateId = requestAnimationFrame(update);
        const { time = t * 0.01, speed = 1.0 } = propsRef.current;
        if (program) {
          program.uniforms.uTime.value = time * speed * 0.1;
          program.uniforms.uAmplitude.value = propsRef.current.amplitude ?? 1.0;
          program.uniforms.uBlend.value = propsRef.current.blend ?? blend;
          const stops = propsRef.current.colorStops ?? colorStops;
          program.uniforms.uColorStops.value = padStops(stops);
          program.uniforms.uNumStops.value = Math.min(stops.length, 6);
          renderer.render({ scene: mesh });
        }
      };
      animateId = requestAnimationFrame(update);

      resize();

      cleanupFn = () => {
        cancelAnimationFrame(animateId);
        window.removeEventListener('resize', resize);
        if (ctn && gl.canvas.parentNode === ctn) {
          ctn.removeChild(gl.canvas);
        }
        try {
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
          // Already lost
        }
      };
    } catch {
      // WebGL failed at any point — silently degrade
      setWebglSupported(false);
      return;
    }

    return cleanupFn;
  }, [amplitude]);

  if (!webglSupported) return null;
  return <div ref={ctnDom} className="aurora-container" />;
}
