import { Text } from "@react-three/drei";
import { timelineYearMarkers } from "~lib/creating/layout";
import { CREATING_INK, CREATING_PAPER } from "~lib/creating/types";
import type { CreatingEntry } from "~lib/creating/types";

type Props = {
  entries: CreatingEntry[];
  scrollX: number;
};

const RADIUS = 10.5;

export function TimelineYearTiles({ entries, scrollX }: Props) {
  const markers = timelineYearMarkers(entries);
  return (
    <>
      {markers.map((m) => {
        const theta = m.theta + scrollX;
        const x = RADIUS * Math.sin(theta);
        const z = RADIUS * Math.cos(theta);
        return (
          <group
            key={`${m.year}-${m.theta}`}
            position={[x, 0.4, z]}
            rotation={[0, -theta + Math.PI, 0]}
          >
            <mesh scale={[1.35, 0.55, 1]}>
              <planeGeometry />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Text
              fontSize={1.45}
              color={CREATING_INK}
              outlineWidth={0.035}
              outlineColor={CREATING_PAPER}
              anchorX="center"
              anchorY="middle"
              font="/fonts/newsreader-latin.woff"
            >
              {String(m.year)}
            </Text>
          </group>
        );
      })}
    </>
  );
}
