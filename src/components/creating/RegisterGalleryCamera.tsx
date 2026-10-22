import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useCreatingStore } from "./creating-store";

export function RegisterGalleryCamera() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    useCreatingStore.getState().setGalleryCamera(camera);
    return () => useCreatingStore.getState().setGalleryCamera(null);
  }, [camera]);

  return null;
}
