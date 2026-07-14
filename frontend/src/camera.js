// 사진 획득 추상화 — 앱에서는 네이티브 카메라, 브라우저 개발 중에는 파일 선택으로 동작
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export async function getPhoto() {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
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
    input.onchange = () =>
      input.files[0] ? resolve(input.files[0]) : reject(new Error("cancelled"));
    input.oncancel = () => reject(new Error("cancelled"));
    input.click();
  });
}
