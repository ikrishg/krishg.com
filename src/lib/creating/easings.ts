import { CustomEase } from "gsap/CustomEase";
import gsap from "gsap";

let registered = false;

export function registerCreatingEasings() {
  if (registered) return;
  gsap.registerPlugin(CustomEase);
  CustomEase.create("creating.cubicInOut", "0.66, 0, 0.34, 1");
  CustomEase.create("creating.cubicOut", "0.32, 0.94, 0.60, 1");
  CustomEase.create("creating.zoomIn", "0.9, 0, 0.4, 1");
  CustomEase.create("creating.zoomOut", "0.4, 0, 0.1, 1");
  CustomEase.create("creating.zoomProject", "0.5, 0, 0.3, 1");
  registered = true;
}
