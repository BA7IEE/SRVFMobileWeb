import { describe, it, expect, vi } from 'vitest';
import { CameraAdapter } from '../../src/platform/camera';
import { LocationAdapter } from '../../src/platform/location';
describe('设备生命周期', () => {
  it('忽略授权时可退出，晚到流立即释放', async () => {
    vi.stubGlobal('isSecureContext', true);
    let complete!: (s: MediaStream) => void;
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise<MediaStream>((resolve) => (complete = resolve)) },
    });
    const camera = new CameraAdapter();
    const pending = camera.start();
    camera.stop();
    complete({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await expect(pending).rejects.toHaveProperty('kind', 'cancelled');
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('相机拒绝与不可用分别反馈', async () => {
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error('denied')) },
    });
    await expect(new CameraAdapter().start()).rejects.toHaveProperty('kind', 'business-rejected');
    vi.stubGlobal('isSecureContext', false);
    await expect(new CameraAdapter().start()).rejects.toHaveProperty('kind', 'service-unavailable');
  });
  it('不要求定位时不申请；拒绝、无响应超时、取消均结束', async () => {
    vi.stubGlobal('isSecureContext', true);
    const request = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: request },
    });
    const location = new LocationAdapter();
    expect(await location.get(false)).toEqual({ state: 'not-required' });
    expect(request).not.toHaveBeenCalled();
    request.mockImplementation((_ok: unknown, fail: (e: { code: number }) => void) =>
      fail({ code: 1 }),
    );
    expect(await location.get(true)).toEqual({ state: 'denied' });
    request.mockImplementation(() => {});
    vi.useFakeTimers();
    const timeout = location.get(true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await timeout).toEqual({ state: 'timeout' });
    const cancelled = location.get(true);
    location.cancel();
    expect(await cancelled).toEqual({ state: 'cancelled' });
  });
});
