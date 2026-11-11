import { fail } from '../shared/errors';
export class CameraAdapter {
  private epoch = 0;
  private stream?: MediaStream;
  supported() {
    return Boolean(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia);
  }
  async start(): Promise<MediaStream> {
    if (!this.supported())
      throw fail('service-unavailable', '相机不可用，请确认 HTTPS、安全上下文和浏览器权限');
    this.stop();
    const id = this.epoch;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch {
      throw fail(
        'business-rejected',
        '相机权限未获批准或被占用，请在系统设置中确认，或联系现场负责人',
      );
    }
    if (id !== this.epoch) {
      stream.getTracks().forEach((t) => t.stop());
      throw fail('cancelled', '相机已关闭');
    }
    this.stream = stream;
    return stream;
  }
  stop() {
    this.epoch++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
