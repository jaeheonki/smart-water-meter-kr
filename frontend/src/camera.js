// 사진 획득 추상화 — 앱에서는 네이티브 카메라, 브라우저 개발 중에는 파일 선택으로 동작
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CameraPreview } from "@capacitor-community/camera-preview";

function base64ToJpegFile(value) {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], "meter.jpg", { type: "image/jpeg" });
}

export function createCameraPreviewController({
  preview = CameraPreview,
  isNative = () => Capacitor.isNativePlatform(),
} = {}) {
  let started = false;
  let flashSupported = false;
  let flashOn = false;

  return {
    isAvailable() {
      return isNative();
    },

    async start(parent) {
      if (!isNative()) return { started: false, flashSupported: false };
      if (started) return { started: true, flashSupported };

      await preview.start({
        parent,
        position: "rear",
        toBack: true,
        disableAudio: true,
      });
      started = true;
      try {
        const modes = await preview.getSupportedFlashModes();
        flashSupported = modes.result.includes("torch");
      } catch {
        flashSupported = false;
      }
      return { started: true, flashSupported };
    },

    async capture() {
      if (!started) throw new Error("camera preview is not started");
      const result = await preview.capture({ quality: 90 });
      return base64ToJpegFile(result.value);
    },

    async toggleFlash() {
      if (!started || !flashSupported) return { flashOn: false };
      const nextFlashOn = !flashOn;
      await preview.setFlashMode({ flashMode: nextFlashOn ? "torch" : "off" });
      flashOn = nextFlashOn;
      return { flashOn };
    },

    async stop() {
      if (!started) return;
      started = false;
      try {
        if (flashOn) await preview.setFlashMode({ flashMode: "off" });
      } finally {
        flashOn = false;
        flashSupported = false;
        await preview.stop();
      }
    },
  };
}

export const cameraPreviewController = createCameraPreviewController();

export function isPhotoCancelled(error) {
  if (!(error instanceof Error)) return false;
  return /cancelled|canceled/i.test(error.message);
}

export async function getPhoto(source = "camera") {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: source === "photos" ? CameraSource.Photos : CameraSource.Camera,
      quality: 90,
    });
    const blob = await (await fetch(photo.webPath)).blob();
    return new File([blob], "meter.jpg", { type: blob.type || "image/jpeg" });
  }
  // 웹 폴백: 파일 선택 다이얼로그
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") input.capture = "environment";
    input.onchange = () =>
      input.files[0] ? resolve(input.files[0]) : reject(new Error("cancelled"));
    input.oncancel = () => reject(new Error("cancelled"));
    input.click();
  });
}
